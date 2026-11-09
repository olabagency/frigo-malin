"""Macronutriments estimés : table d'aliments et conversion des quantités."""

from __future__ import annotations

from custom_components.frigo_malin.nutrition import clean_food, compute, grams, match_food, unknown_names
from custom_components.frigo_malin.parsing import parse_ingredient


def _recipe(lines: list[str], servings: int, foods=None) -> dict:
    return compute([parse_ingredient(line) for line in lines], servings, foods)


def test_gratin_per_serving_is_plausible() -> None:
    n = _recipe(
        ["1 kg de pommes de terre", "50 cl de crème liquide", "25 cl de lait", "2 gousses d'ail", "30 g de beurre", "sel", "poivre", "1 pincée de muscade"],
        6,
    )
    assert 350 <= n["kcal"] <= 500
    assert n["unknown"] == []
    assert n["fat"] > n["protein"]


def test_longest_keyword_wins() -> None:
    assert match_food("pommes de terre")["kcal"] == 80
    assert match_food("pomme")["kcal"] == 52
    assert match_food("ail haché")["kcal"] == 130  # pas du bœuf haché
    assert match_food("persil haché")["neg"]
    assert match_food("noix de muscade")["neg"]
    assert match_food("lait de coco")["fat"] == 19
    assert match_food("poivron jaune")["kcal"] == 26


def test_units_are_converted() -> None:
    egg = match_food("œufs")
    assert grams(3, "", egg) == 165
    oil = match_food("huile d'olive")
    assert round(grams(2, "c. à soupe", oil)) == 27
    assert grams(1, "boîte", match_food("pois chiches")) == 265
    assert grams(None, "", match_food("sel")) == 0


def test_unknown_ingredients_and_ai_cache() -> None:
    n = _recipe(["200 g de riz", "1 bok choy"], 2)
    assert n["unknown"] == ["bok choy"]
    foods = {"bok choy": clean_food({"kcal": 13, "protein": 1.5, "carbs": 2, "fat": 0.2, "fiber": 1, "piece_g": 300})}
    m = _recipe(["200 g de riz", "1 bok choy"], 2, foods)
    assert m["unknown"] == [] and m["ai"]
    assert m["kcal"] == n["kcal"] + round(13 * 3 / 2)
    assert unknown_names([{"ingredients": [parse_ingredient("1 bok choy")]}], foods) == []


def test_clean_food_bounds_values() -> None:
    food = clean_food({"kcal": 5000, "protein": -3, "carbs": "12", "fat": None, "negligible": True})
    assert food == {"kcal": 900, "protein": 0.0, "carbs": 12.0, "fat": 0.0, "fiber": 0.0, "neg": True}
