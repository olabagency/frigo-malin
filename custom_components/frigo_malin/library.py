"""Bibliothèque de recettes saines fournie avec Frigo Malin.

Les recettes sont dans library/recettes.json. Ce module n'importe rien de
Home Assistant : il est testable seul.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .parsing import normalize_ingredient

LIBRARY_FILE = Path(__file__).parent / "library" / "recettes.json"

THEMES = {
    "anti_inflammatory": "Anti-inflammatoire",
    "balanced": "Équilibré",
    "vegetarian": "Végétarien",
    "vegan": "Vegan",
    "gluten_free": "Sans gluten",
    "quick": "Rapide",
    "protein": "Protéiné",
    "light": "Léger",
    "budget": "Petit budget",
    "batch": "Se garde bien",
}
TYPES = {
    "breakfast": "Petit-déjeuner",
    "soup": "Soupe",
    "salad": "Salade et bowl",
    "main": "Plat",
    "dessert": "Dessert",
}


def prepare_recipe(raw: dict[str, Any]) -> dict[str, Any]:
    """Met une recette de la bibliothèque au format du carnet, avec ses thèmes déduits."""
    themes = list(dict.fromkeys(raw.get("themes") or []))
    allergens = list(raw.get("allergens") or [])
    total = (raw.get("prep") or 0) + (raw.get("cook") or 0)
    if total and total <= 30 and "quick" not in themes:
        themes.append("quick")
    if "gluten" not in allergens:
        themes.append("gluten_free")
    if "vegan" in themes and "vegetarian" not in themes:
        themes.append("vegetarian")
    return {
        "id": f"lib-{raw['slug']}",
        "library_id": raw["slug"],
        "title": raw["title"],
        "description": raw.get("description", ""),
        "emoji": raw.get("emoji", ""),
        "type": raw.get("type", "main"),
        "servings": raw.get("servings", 4),
        "prep_time": raw.get("prep") or None,
        "cook_time": raw.get("cook") or None,
        "ingredients": [i for i in (normalize_ingredient(x) for x in raw.get("ingredients") or []) if i],
        "steps": list(raw.get("steps") or []),
        "themes": [t for t in themes if t in THEMES],
        "tags": [THEMES[t] for t in raw.get("themes") or [] if t in THEMES][:4],
        "allergens": allergens,
        "benefits": list(raw.get("benefits") or []),
        "months": list(raw.get("months") or range(1, 13)),
        "origin": "library",
    }


def load_library(path: Path = LIBRARY_FILE) -> list[dict[str, Any]]:
    """Lit le fichier (à appeler hors de la boucle d'évènements : lecture disque)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return [prepare_recipe(r) for r in data.get("recipes", [])]
