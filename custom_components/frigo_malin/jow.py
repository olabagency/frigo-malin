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


# ------------------------------------------------------------------ filtres du catalogue
# Les catégories de Jow manquent sur plus d'un tiers des recettes : on les complète
# avec des mots du titre (sans accents, au singulier, comme _fold).

def _words(text: str) -> re.Pattern[str]:
    return re.compile(r"\b(?:" + "|".join(_fold(w).strip() for w in text.split(",") if w.strip()) + r")\b")


DISHES: dict[str, tuple[str, str, set[str], re.Pattern[str]]] = {
    "pasta": ("🍝", "Pâtes", {"Pâtes veg", "Pâtes protéine animale"}, _words(
        "spaghetti, penne, tagliatelle, fusilli, linguine, macaroni, lasagnes, gnocchi, ravioli, tortellini, "
        "coquillettes, farfalle, orecchiette, rigatoni, conchiglie, carbonara, bolognaise, nouilles, udon, pad thai, mac and cheese")),
    "rice": ("🍚", "Riz & risottos", set(), _words("riz, risotto, paella, biryani, arancini, jambalaya")),
    "salad": ("🥗", "Salades & bowls", {"Salade protéine animal", "Salade veg"}, _words("salade, bowl, poke, buddha, taboulé, coleslaw")),
    "soup": ("🍲", "Soupes", {"Velouté", "Bouillon", "Soupe froide"}, _words("soupe, velouté, potage, gaspacho, gazpacho, bouillon, minestrone, pho, ramen, chorba")),
    "savory": ("🥧", "Quiches, tartes & pizzas", {"Quiche/frittata", "Pizza", "Galette", "Cake salés"}, _words(
        "quiche, tarte, pizza, galette, tourte, frittata, omelette, feuilleté, flammekueche, flammeküeche, focaccia, calzone, cake salé")),
    "sandwich": ("🍔", "Burgers & sandwichs", {"Burger", "Sandwich/Toast/Tartines (chaud)", "Sandwich/Toast/Tartines (froid)", "Tortilla/Fajita/Taco/Burrito/Quesadilla"}, _words(
        "burger, sandwich, croque, wrap, tacos, taco, fajitas, burrito, quesadilla, toast, tartine, bagel, kebab, panini, hot dog, pita, bao")),
    "oven": ("🧀", "Gratins & plats au four", {"Gratin", "Sheet pan"}, _words("gratin, parmentier, tartiflette, lasagnes, moussaka, rôti, au four, cannelloni, hachis")),
    "stew": ("🍛", "Currys & mijotés", set(), _words(
        "curry, dahl, dal, chili, tajine, blanquette, bourguignon, mijoté, ragoût, colombo, mafé, goulash, cari, korma, tikka, massala, masala, stroganoff, pot-au-feu, couscous, rougail, navarin")),
    "dessert": ("🍰", "Desserts", {"Gâteau", "Dessert sans cuisson", "Cookie", "Brownie/Bar", "Tarte/Crumble", "Crêpes/Pancakes/Gaufres", "Condiment sucré"}, _words(
        "gâteau, cookie, cookies, brownie, crumble, mousse au chocolat, tiramisu, fondant, cheesecake, clafoutis, muffin, financier, madeleine, crêpes, crêpe, pancakes, "
        "gaufres, glace, sorbet, panna cotta, flan, cupcake, donut, beignets, churros, meringue, pavlova, banana bread, brioche, cinnamon roll, tarte au citron, tarte aux pommes, "
        "tarte tatin, riz au lait, crème brûlée, mug cake, energy balls, smoothie")),
    "brunch": ("🥐", "Brunch & petit-déj", {"Brunch", "Petit dej 🥝"}, _words("brunch, porridge, granola, overnight, œufs brouillés, oeufs brouillés, bénédicte, shakshuka, french toast, pain perdu")),
    "apero": ("🥂", "Apéro", {"Apéro à partager", "Snacks", "Dips", "Cocktail", "Planches/assemblage"}, _words(
        "apéro, houmous, hummus, dip, tapenade, guacamole, cocktail, mojito, spritz, verrine, rillettes, tzatziki, nachos, chips")),
}

# Filtres cumulables (« et ») : régime, public, matériel, occasion.
OPTIONS: dict[str, tuple[str, str]] = {
    "veggie": ("🌱", "Végétarien"),
    "kids": ("👶", "Enfants"),
    "protein": ("💪", "Protéiné"),
    "healthy": ("💚", "Healthy"),
    "airfryer": ("💨", "Air fryer"),
    "onepan": ("🍳", "Une seule poêle"),
    "batch": ("📦", "Batch cooking"),
    "party": ("🎉", "Fêtes"),
}
_VEG_TAGS = {"Veggie - grain", "Veggie - Veg", "Pâtes veg", "Salade veg", "Vegan"}
_VEG_WORDS = _words("végé, veggie, végétarien, végétarienne, vegan, végétal")
_MEAT_TAG = re.compile(r"protéines? animale?s?", re.I)
_MEAT_WORDS = _words(
    "poulet, bœuf, boeuf, porc, jambon, lardons, bacon, saucisse, chorizo, merguez, steak, viande, canard, dinde, veau, agneau, poisson, saumon, "
    "thon, cabillaud, crevettes, gambas, moules, sardines, maquereau, carbonara, bolognaise, kebab, nuggets, cordon bleu, hachis, parmentier, "
    "knacks, knack, raclette, tartiflette, croque-monsieur, croque monsieur, lorraine, magret, pancetta, speck, prosciutto, coppa, rillettes, "
    "chipolatas, travers, ribs, effiloché, tenders, wings, escalope, filet mignon, côtes, poulpe, seiche, calamars, encornets, crabe, surimi, "
    "anchois, haddock, colin, lieu, dorade, bar, truite, saint-jacques, rôti, burger, hot dog, coq, boulettes, poke, sushi, tataki, pulled, "
    "bresaola, mortadelle, salami, andouille, boudin, foie, gésiers, porchetta, chili con carne, tacos, fajitas, burrito, rougail, blanquette, bourguignon, "
    "périgourdine, niçoise, césar, savoyarde, montagnarde, parisienne, lardon, poisson pané, fish, chicken, beef, pork")
# Ingrédients salés : une recette qui en contient n'est pas un dessert (« crumble de courge »).
_SAVORY_WORDS = _words(
    "chèvre, fromage, comté, parmesan, mozzarella, feta, ricotta, roquefort, gorgonzola, raclette, potimarron, courge, butternut, chou, chou-fleur, "
    "poireau, tomate, courgette, champignon, épinards, oignon, carotte, poivron, aubergine, lentilles, pois chiches, pommes de terre, patate, brocoli, "
    "petits pois, haricots, légumes, quinoa, boulgour")
_OPTION_TAGS = {
    "kids": {"Kids", "Familial"},
    "protein": {"Protéines"},
    "healthy": {"Positive Food", "Anti-inflammatoire", "Keto"},
    "airfryer": {"Air-fryer"},
    "onepan": {"One-pan", "Sheet pan"},
    "batch": {"Batch cooking"},
    "party": {"Fêtes", "Nouvel An Lunaire 🏮", "Halloween", "Thanksgiving", "Pâques", "Recettes du dimanche", "BBQ"},
}
_OPTION_WORDS = {
    "airfryer": _words("air fryer, airfryer"),
    "onepan": _words("one pan, one pot, one-pan, one-pot, sheet pan"),
    "batch": _words("batch cooking"),
}


def classify(title: str, description: str, tags: list[str]) -> list[str]:
    """Catégories d'une recette du catalogue (types de plat et options)."""
    t = f" {_fold(title)} "
    tagset = set(tags)
    cats: list[str] = []
    for key, (_, _, dish_tags, words) in DISHES.items():
        if tagset & dish_tags or words.search(t):
            cats.append(key)
    # « Pâtes » : au pluriel seulement (la pâte à tartiner n'en est pas).
    if "pasta" not in cats and re.search(r"\bp[âa]tes\b", title.lower()):
        cats.append("pasta")
    # Un crumble au saumon ou une tarte aux poireaux n'est pas un dessert.
    if "dessert" in cats and (_MEAT_WORDS.search(t) or _SAVORY_WORDS.search(t)):
        cats.remove("dessert")
    # Une tarte au citron est un dessert, pas une tarte salée.
    if "dessert" in cats and "savory" in cats and not tagset & DISHES["savory"][2]:
        cats.remove("savory")
    text = f"{t} {_fold(description)} "
    meat = bool(_MEAT_WORDS.search(text)) or any(_MEAT_TAG.search(x) for x in tags)
    if tagset & _VEG_TAGS or _VEG_WORDS.search(t) or not meat:
        if not (meat and not (tagset & _VEG_TAGS or _VEG_WORDS.search(t))):
            cats.append("veggie")
    for key, option_tags in _OPTION_TAGS.items():
        if tagset & option_tags or (key in _OPTION_WORDS and _OPTION_WORDS[key].search(t)):
            cats.append(key)
    return cats


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
        description = _tag(block, "image:caption") or _tag(block, "video:description")
        tags = [html.unescape(t).strip() for t in re.findall(r"<video:tag>(.*?)</video:tag>", block)]
        recipes.append(
            {
                "url": loc.group(1),
                "title": title,
                "description": description,
                "image": _tag(block, "image:loc") or _tag(block, "video:thumbnail_loc"),
                "tags": [t for t in tags if t != "SPONSO"][:4],
                "cats": classify(title, description, tags),
                "key": _fold(title),
            }
        )
    return recipes


def search(catalog: list[dict[str, Any]], query: str, limit: int = 24) -> list[dict[str, Any]]:
    """Recettes dont le titre (ou la description) contient tous les mots cherchés."""
    return [{k: v for k, v in r.items() if k not in ("key", "cats")} for r in _matches(catalog, query)[:limit]]


def browse(
    catalog: list[dict[str, Any]], query: str = "", dish: str = "", options: list[str] | None = None, page: int = 1, per_page: int = 20
) -> dict[str, Any]:
    """Une page de résultats, avec le nombre de recettes par filtre pour la recherche en cours."""
    found = _matches(catalog, query)
    wanted = [o for o in options or [] if o in OPTIONS]
    with_options = [r for r in found if all(o in r["cats"] for o in wanted)]
    with_dish = [r for r in with_options if not dish or dish in r["cats"]]
    pages = max(1, -(-len(with_dish) // per_page))
    page = max(1, min(int(page or 1), pages))
    start = (page - 1) * per_page

    def count(items: list[dict[str, Any]], key: str) -> int:
        return sum(1 for r in items if key in r["cats"])

    by_dish = [r for r in found if not dish or dish in r["cats"]]
    return {
        "recipes": [{k: v for k, v in r.items() if k not in ("key",)} for r in with_dish[start : start + per_page]],
        "total": len(with_dish),
        "page": page,
        "pages": pages,
        "dishes": [{"key": k, "emoji": e, "label": label, "count": count(with_options, k)} for k, (e, label, _, _) in DISHES.items()],
        "options": [
            {"key": k, "emoji": e, "label": label, "count": count([r for r in by_dish if all(o in r["cats"] for o in wanted if o != k)], k)}
            for k, (e, label) in OPTIONS.items()
        ],
    }


def _matches(catalog: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
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
    return [r for _, r in results]


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
