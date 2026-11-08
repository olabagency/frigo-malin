"""Bibliothèque de recettes saines fournie avec l'intégration."""

import re

from custom_components.frigo_malin.household import ALLERGENS
from custom_components.frigo_malin.library import THEMES, TYPES, load_library


def test_library_is_complete_and_consistent():
    recipes = load_library()
    assert len(recipes) >= 40
    ids = [r["id"] for r in recipes]
    assert len(ids) == len(set(ids))
    for r in recipes:
        assert r["title"] and r["description"] and r["emoji"], r["title"]
        assert r["type"] in TYPES, r["title"]
        assert set(r["themes"]) <= set(THEMES), r["title"]
        assert set(r["allergens"]) <= set(ALLERGENS), r["title"]
        assert len(r["ingredients"]) >= 3 and len(r["steps"]) >= 3, r["title"]
        assert all(1 <= m <= 12 for m in r["months"]), r["title"]
        for ing in r["ingredients"]:
            # Chaque ingrédient a une quantité et un nom propre (pas de « de » en tête, pas de parenthèses).
            assert ing["quantity"] is not None, (r["title"], ing)
            assert not ing["name"].startswith(("de ", "d'")) and "(" not in ing["name"], (r["title"], ing)


def test_derived_themes():
    by_id = {r["library_id"]: r for r in load_library()}
    soup = by_id["soupe-lentilles-corail-curcuma"]
    assert "gluten_free" in soup["themes"]  # pas de gluten dans les allergènes
    assert "vegetarian" in soup["themes"]  # vegan implique végétarien
    porridge = by_id["porridge-myrtilles-noix"]
    assert "quick" in porridge["themes"] and "gluten_free" not in porridge["themes"]


def test_allergens_match_ingredients():
    """Garde-fou : un ingrédient évident doit être déclaré dans les allergènes."""
    checks = {
        "fish": ("saumon", "thon", "maquereau", "cabillaud", "sardine", "anchois", "poisson"),
        "eggs": ("œuf", "oeuf"),
        "nuts": ("noix", "amande", "cajou", "noisette"),
        "milk": ("lait", "yaourt", "feta", "parmesan", "beurre", "crème légère"),
        "sesame": ("sésame", "tahini"),
        "soy": ("soja", "tofu", "miso", "edamame"),
        "crustaceans": ("crevette",),
        "gluten": ("pain", "farine", "pâte", "épeautre", "orge", "avoine", "boulgour", "semoule", "blé"),
        "celery": ("céleri",),
        "mustard": ("moutarde",),
    }
    exceptions = {"lait de coco", "noix de coco", "crème de coco", "beurre de", "farine de sarrasin", "fécule"}
    for r in load_library():
        for allergen, words in checks.items():
            for ing in r["ingredients"]:
                name = ing["name"].lower()
                if any(e in name for e in exceptions):
                    continue
                if any(re.search(rf"\b{w}(s|x)?\b", name) for w in words):
                    assert allergen in r["allergens"], f"{r['title']} : « {ing['name']} » sans l'allergène {allergen}"
