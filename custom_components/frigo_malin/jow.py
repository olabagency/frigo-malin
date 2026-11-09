"""Recettes Jow (jow.fr) : recherche dans le catalogue et import fidèle.

Jow n'a pas d'API publique de recherche : le catalogue vient du plan du site
(https://jow.fr/sitemap.xml, environ 3 700 recettes avec titre, description et image),
gardé en mémoire une journée. Une recette s'importe depuis les données de sa page
(quantités par personne, unités, étapes), mises à l'échelle du foyer.

Les fonctions d'analyse n'importent rien de Home Assistant : elles sont testables seules.
"""

from __future__ import annotations

import gzip
import html
import json
import re
import time
from typing import Any
from urllib.parse import urlparse

from .parsing import _fold, clean_tags, format_number

SITEMAP_URL = "https://jow.fr/sitemap.xml"
CATALOG_TTL = 24 * 3600

_URL_BLOCK = re.compile(r"<url>(.*?)</url>", re.S)
_RECIPE_LOC = re.compile(r"<loc>(https://jow\.fr/recipes/(?!en/)[^<]+)</loc>")
_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)

# Unité Jow -> (unité Frigo Malin, facteur appliqué à la quantité).
_UNITS = {
    "kilogramme": ("g", 1000),
    "gramme": ("g", 1),
    "litre": ("ml", 1000),
    "millilitre": ("ml", 1),
    "centilitre": ("cl", 1),
    "pièce": ("", 1),
    "piece": ("", 1),
    "cuillère à café": ("c. à café", 1),
    "cuillère à soupe": ("c. à soupe", 1),
    "tranche": ("tranche", 1),
    "poignée": ("poignée", 1),
    "pincée": ("pincée", 1),
    "sachet": ("sachet", 1),
    "gousse": ("gousse", 1),
    "boîte": ("boîte", 1),
    "botte": ("botte", 1),
    "brin": ("brin", 1),
    "feuille": ("feuille", 1),
}


def is_jow_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.netloc.lower().endswith("jow.fr") and "/recipes/" in parsed.path


def _tag(block: str, name: str) -> str:
    match = re.search(rf"<{name}>(.*?)</{name}>", block, re.S)
    return html.unescape(match.group(1)).strip() if match else ""


def parse_sitemap(data: bytes | str) -> list[dict[str, Any]]:
    """Recettes du plan du site : {url, title, description, image, tags}."""
    if isinstance(data, bytes):
        if data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        data = data.decode("utf-8", errors="replace")
    recipes: list[dict[str, Any]] = []
    for block in _URL_BLOCK.findall(data):
        loc = _RECIPE_LOC.search(block)
        if not loc:
            continue
        title = _tag(block, "image:title") or _tag(block, "video:title")
        if not title:
            continue
        recipes.append(
            {
                "url": loc.group(1),
                "title": title,
                "description": _tag(block, "image:caption") or _tag(block, "video:description"),
                "image": _tag(block, "image:loc") or _tag(block, "video:thumbnail_loc"),
                "tags": [html.unescape(t).strip() for t in re.findall(r"<video:tag>(.*?)</video:tag>", block)][:4],
                "key": _fold(title),
            }
        )
    return recipes


def search(catalog: list[dict[str, Any]], query: str, limit: int = 24) -> list[dict[str, Any]]:
    """Recettes dont le titre (ou la description) contient tous les mots cherchés."""
    words = [w for w in _fold(query).split() if len(w) > 1]
    results = []
    for recipe in catalog:
        if not words:
            score = 0
        else:
            title = f" {recipe['key']} "
            rest = _fold(recipe["description"] + " " + " ".join(recipe["tags"]))
            if not all(w in title or w in rest for w in words):
                continue
            # Le titre compte plus que la description ; un mot entier plus qu'un morceau.
            score = sum(3 if f" {w} " in title else 2 if w in title else 1 for w in words)
        results.append((score, recipe))
    results.sort(key=lambda x: -x[0])
    return [{k: v for k, v in r.items() if k != "key"} for _, r in results[:limit]]


def _quantity(per_cover: Any, covers: int, factor: float) -> float | None:
    try:
        value = float(per_cover) * covers * factor
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    if factor >= 1000:  # g et ml : arrondi lisible
        step = 5 if value >= 50 else 1
        return float(round(value / step) * step) or 1.0
    return round(value * 4) / 4 or 0.25  # pièces et cuillères : au quart près


def _ingredient(raw: dict[str, Any], covers: int) -> dict[str, Any] | None:
    name = str(raw.get("name") or (raw.get("ingredient") or {}).get("name") or "").strip()
    if not name:
        return None
    unit_name = str((raw.get("unit") or {}).get("name") or "").strip().lower()
    unit, factor = _UNITS.get(unit_name, (unit_name, 1))
    quantity = _quantity(raw.get("quantityPerCover"), covers, factor)
    if unit == "ml" and quantity and quantity >= 100:
        unit, quantity = "cl", quantity / 10
    # « Tomate (concentré) » -> « Tomate (concentré) » : Jow écrit l'aliment puis la précision.
    return {"quantity": quantity, "unit": unit, "name": name}


def parse_recipe_page(page: str, url: str, servings: int) -> dict[str, Any] | None:
    """Recette Jow à partir des données de la page, pour `servings` personnes."""
    match = _NEXT_DATA.search(page)
    if not match:
        return None
    try:
        recipe = json.loads(match.group(1))["props"]["pageProps"]["recipe"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(recipe, dict) or not recipe.get("title"):
        return None
    covers = max(1, int(servings or 4))
    ingredients = [_ingredient(c, covers) for c in recipe.get("constituents") or [] if isinstance(c, dict)]
    ingredients += [
        _ingredient(c, covers)
        for c in recipe.get("additionalConstituents") or []
        if isinstance(c, dict) and not c.get("isHidden")
    ]
    steps = [str(s.get("label") or "").strip() for s in recipe.get("directions") or [] if isinstance(s, dict)]
    habits = recipe.get("eatingHabitsCompatibility") or {}
    tags = ["vegan" if habits.get("vegan") else "végétarien" if habits.get("vegetarian") else ""]
    tip = (recipe.get("tip") or {}).get("description") if isinstance(recipe.get("tip"), dict) else ""
    total = (recipe.get("preparationTime") or 0) + (recipe.get("cookingTime") or 0)
    if total and total <= 20:
        tags.append("rapide")
    return {
        "title": str(recipe["title"]).strip(),
        "description": str(recipe.get("description") or "").strip(),
        "image": recipe.get("imageUrlHD") or recipe.get("imageUrl") or "",
        "servings": covers,
        "prep_time": recipe.get("preparationTime") or None,
        "cook_time": recipe.get("cookingTime") or None,
        "ingredients": [i for i in ingredients if i],
        "steps": [s for s in steps if s],
        "tags": clean_tags([t for t in tags if t], str(recipe["title"])),
        "notes": f"💡 {tip.strip()}" if tip and tip.strip() else "",
        "source_url": url,
        "origin": "jow",
    }


class JowCatalog:
    """Catalogue Jow gardé en mémoire une journée."""

    def __init__(self) -> None:
        self.recipes: list[dict[str, Any]] = []
        self.loaded_at = 0.0

    @property
    def fresh(self) -> bool:
        return bool(self.recipes) and time.monotonic() - self.loaded_at < CATALOG_TTL

    def load(self, data: bytes | str) -> None:
        recipes = parse_sitemap(data)
        if recipes:
            self.recipes = recipes
            self.loaded_at = time.monotonic()


def describe_quantity(ing: dict[str, Any]) -> str:
    """Pour les journaux et les tests : « 400 g Champignons »."""
    q = ing.get("quantity")
    return " ".join(p for p in (format_number(q) if q else "", ing.get("unit") or "", ing["name"]) if p)
