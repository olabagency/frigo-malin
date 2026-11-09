"""Tests de l'analyse des ingrédients et des pages de recettes."""

import pytest

from custom_components.frigo_malin.parsing import (
    aggregate_shopping,
    extract_json,
    extract_recipe_from_html,
    format_ingredient,
    parse_duration,
    parse_excluded,
    parse_ingredient,
)


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("200 g de farine", (200, "g", "farine")),
        ("1 1/2 c. à soupe d'huile d'olive", (1.5, "c. à soupe", "huile d'olive")),
        ("½ litre de lait", (0.5, "l", "lait")),
        ("2 gousses d'ail", (2, "gousse", "ail")),
        ("3 noix", (3, "", "noix")),
        ("une pincée de sel", (1, "pincée", "sel")),
        ("1 gros oignon", (1, "", "gros oignon")),
        ("2 à 3 tomates", (2, "", "tomates")),
        ("10 cl de crème liquide", (10, "cl", "crème liquide")),
        ("Sel, poivre", (None, "", "Sel, poivre")),
    ],
)
def test_parse_ingredient(line, expected):
    result = parse_ingredient(line)
    assert (result["quantity"], result["unit"], result["name"]) == expected


def test_format_ingredient():
    assert format_ingredient({"quantity": 2, "unit": "gousse", "name": "ail"}) == "Ail (2 gousses)"
    assert format_ingredient({"quantity": 1.5, "unit": "kg", "name": "farine"}) == "Farine (1,5 kg)"
    assert format_ingredient({"quantity": None, "unit": "", "name": "persil"}) == "Persil"


def test_aggregate_shopping_merges_units_and_scales():
    items = aggregate_shopping(
        [
            ([parse_ingredient("500 g de tomates"), parse_ingredient("1 pincée de sel"), parse_ingredient("20 cl de lait")], 1, "A"),
            ([parse_ingredient("600 g de tomate"), parse_ingredient("1 l de lait"), parse_ingredient("Persil")], 2, "B"),
        ],
        parse_excluded("sel, poivre"),
    )
    texts = [item["text"] for item in items]
    assert texts == ["Lait (2,2 l)", "Persil", "Tomates (1,7 kg)"]
    assert items[0]["recipes"] == ["A", "B"]


def test_parse_duration():
    assert parse_duration("PT1H30M") == 90
    assert parse_duration("PT20M") == 20
    assert parse_duration("P0DT0H45M") == 45
    assert parse_duration("") is None


MARMITON_LIKE = """
<html><head>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"WebSite","name":"x"}</script>
<script type="application/ld+json">
{"@context":"http://schema.org","@graph":[{"@type":["Recipe"],
 "name":"Quiche lorraine","recipeYield":"6 personnes","prepTime":"PT15M","cookTime":"PT45M",
 "image":["https://img.example/quiche.jpg"],"recipeCategory":"Plat principal","keywords":"quiche, lardons",
 "recipeIngredient":["1 pâte brisée","200 g de lardons","3 œufs","20 cl de crème fraîche"],
 "recipeInstructions":[{"@type":"HowToSection","name":"Préparation","itemListElement":[
   {"@type":"HowToStep","text":"Préchauffez le four à 180&deg;C."},
   {"@type":"HowToStep","text":"Faites revenir les lardons."}]},
   {"@type":"HowToStep","text":"Enfournez 45 minutes."}]}]}
</script></head><body></body></html>
"""


def test_extract_recipe_from_html():
    recipe = extract_recipe_from_html(MARMITON_LIKE, "https://www.marmiton.org/recettes/quiche")
    assert recipe["title"] == "Quiche lorraine"
    assert recipe["servings"] == 6
    assert recipe["prep_time"] == 15
    assert recipe["cook_time"] == 45
    assert recipe["image"] == "https://img.example/quiche.jpg"
    assert len(recipe["ingredients"]) == 4
    assert recipe["ingredients"][1] == {"quantity": 200.0, "unit": "g", "name": "lardons"}
    assert recipe["steps"] == ["Préchauffez le four à 180°C.", "Faites revenir les lardons.", "Enfournez 45 minutes."]
    assert "quiche" in recipe["tags"]


def test_extract_recipe_absent():
    assert extract_recipe_from_html("<html><body>Rien</body></html>") is None


def test_extract_json():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Voici : {"a": [1, 2]} bon appétit') == {"a": [1, 2]}
    with pytest.raises(ValueError):
        extract_json("pas de json")


MESSY_LDJSON = (
    '<html><head><title>Steak tartare : la recette facile</title>\n'
    '<script type="application/ld+json">\n'
    '{"@context":"http://schema.org","@type":"Recipe","name":"Steak tartare",\n'
    ' "recipeIngredient":["500 g de boeuf haché","1 jaune d\'oeuf","2 c. à soupe de câpres",],\n'
    ' "recipeInstructions":[{"@type":"HowToStep","text":"Hachez finement\n les oignons et les câpres."},\n'
    '  {"@type":"HowToStep","text":"Mélangez avec la viande\tet le jaune d\'oeuf."}],\n'
    ' "recipeYield":"4 personnes"}\n'
    '</script></head><body></body></html>'
)


def test_extract_recipe_from_messy_ldjson():
    """Retours à la ligne et tabulations bruts dans les textes, virgule en trop : on lit quand même."""
    recipe = extract_recipe_from_html(MESSY_LDJSON, "https://www.marmiton.org/recettes/steak")
    assert recipe is not None
    assert recipe["title"] == "Steak tartare"
    assert recipe["servings"] == 4
    assert [i["name"] for i in recipe["ingredients"]] == ["boeuf haché", "jaune d'oeuf", "câpres"]
    assert recipe["steps"] == ["Hachez finement les oignons et les câpres.", "Mélangez avec la viande et le jaune d'oeuf."]


def test_html_to_text_keeps_the_recipe_part():
    """Sur une page très longue, le texte envoyé à l'IA commence près des ingrédients."""
    from custom_components.frigo_malin.parsing import html_to_text

    junk = "<div>Menu publicité recettes du jour</div>" * 3000
    page = f"<html><head><title>Tarte</title></head><body>{junk}<h2>Ingrédients</h2><ul><li>200 g de farine</li></ul></body></html>"
    text = html_to_text(page)
    assert text.startswith("Titre de la page : Tarte")
    assert "200 g de farine" in text
    assert len(text) < 41000


def test_centimetres_are_a_unit():
    assert parse_ingredient("3 cm de gingembre frais") == {"quantity": 3.0, "unit": "cm", "name": "gingembre frais"}


@pytest.mark.parametrize(
    ("ingredient", "expected"),
    [
        ({"quantity": 2, "unit": "", "name": "tours de moulin de poivre au goût"}, "Poivre"),
        ({"quantity": 3, "unit": "", "name": "gouttes de tabasco"}, "Tabasco"),
        ({"quantity": 1, "unit": "pincée", "name": "piment d'Espelette"}, "Piment d'Espelette"),
        ({"quantity": 1, "unit": "", "name": "filet d'huile d'olive"}, "Huile d'olive"),
        ({"quantity": 1, "unit": "", "name": "trait de sauce soja"}, "Sauce soja"),
        ({"quantity": None, "unit": "", "name": "persil (facultatif)"}, "Persil"),
        ({"quantity": None, "unit": "", "name": "huile pour la cuisson"}, "Huile"),
        ({"quantity": 2, "unit": "filet", "name": "maquereau"}, "Maquereau (2 filets)"),
        ({"quantity": 200, "unit": "g", "name": "farine"}, "Farine (200 g)"),
    ],
)
def test_shopping_item_is_buyable(ingredient, expected):
    from custom_components.frigo_malin.parsing import shopping_item

    assert format_ingredient(shopping_item(ingredient)) == expected


def test_pepper_mill_is_excluded_like_pepper():
    items = aggregate_shopping(
        [([{"quantity": 2, "unit": "", "name": "tours de moulin de poivre au goût"}, parse_ingredient("200 g de bœuf")], 1, "Tartare")],
        parse_excluded("sel, poivre, eau"),
    )
    assert [i["text"] for i in items] == ["Bœuf (200 g)"]


@pytest.mark.parametrize(
    "name",
    ["sel", "Sel fin", "fleur de sel", "gros sel", "poivre", "poivre noir du moulin", "sel et poivre", "Poivre de Cayenne"],
)
def test_salt_and_pepper_are_never_on_the_list(name):
    """Même si l'utilisateur a vidé la liste des exclusions."""
    items = aggregate_shopping([([{"quantity": 1, "unit": "pincée", "name": name}], 1, "R")], excluded=[])
    assert items == []


@pytest.mark.parametrize("name", ["poivron rouge", "selle d'agneau", "céleri", "persil"])
def test_similar_words_are_kept(name):
    items = aggregate_shopping([([{"quantity": 1, "unit": "", "name": name}], 1, "R")], excluded=[])
    assert len(items) == 1


def test_subtract_from_list():
    from custom_components.frigo_malin.parsing import subtract_from_list

    existing = [
        {"uid": "a", "summary": "Tomates (800 g)"},
        {"uid": "b", "summary": "Crème (25 cl)"},
        {"uid": "c", "summary": "Persil"},
        {"uid": "d", "summary": "Pain"},
    ]
    ops = subtract_from_list(
        existing,
        [
            {"name": "tomates", "quantity": 500, "unit": "g"},
            {"name": "crème", "quantity": 25, "unit": "cl"},
            {"name": "persil", "quantity": None, "unit": ""},
        ],
    )
    assert ops == [
        {"op": "update", "uid": "a", "text": "Tomates (300 g)", "previous": "Tomates (800 g)"},
        {"op": "remove", "uid": "b", "text": "Crème (25 cl)"},
        {"op": "remove", "uid": "c", "text": "Persil"},
    ]
