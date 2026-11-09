"""Jow : catalogue (plan du site), recherche et import d'une recette."""

from __future__ import annotations

from pathlib import Path

from custom_components.frigo_malin.jow import describe_quantity, is_jow_url, parse_recipe_page, parse_sitemap, search

HERE = Path(__file__).parent
PAGE = (HERE / "fixtures_jow_page.html").read_text()
SITEMAP = (HERE / "fixtures_jow_sitemap.xml").read_text()
URL = "https://jow.fr/recipes/bouillon-coco-poulet-8l365tj97dswkvun0e5z"


def test_recognizes_jow_links() -> None:
    assert is_jow_url(URL)
    assert not is_jow_url("https://www.marmiton.org/recettes/recette_x.aspx")
    assert not is_jow_url("https://jow.fr/")


def test_recipe_is_scaled_to_household() -> None:
    recipe = parse_recipe_page(PAGE, URL, servings=2)
    assert recipe["title"] == "Bouillon coco poulet"
    assert recipe["servings"] == 2 and recipe["origin"] == "jow"
    lines = [describe_quantity(i) for i in recipe["ingredients"]]
    assert lines[:3] == ["2 Poulet (escalope)", "200 g Champignons de Paris (frais)", "1/2 Oignon rouge"]
    assert "10 cl Lait de coco" in lines
    assert "40 cl Eau" in lines  # ingrédient d'appoint de Jow
    assert len(recipe["steps"]) == 8
    assert recipe["prep_time"] == 5 and recipe["cook_time"] == 21
    assert recipe["image"].startswith("https://static.jow.fr/")
    assert recipe["notes"].startswith("💡 ")


def test_page_without_data_is_ignored() -> None:
    assert parse_recipe_page("<html></html>", URL, 4) is None


def test_catalog_and_search() -> None:
    catalog = parse_sitemap(SITEMAP)
    assert len(catalog) == 6
    first = catalog[0]
    assert first["title"] == "Lasagnes végé aux courgettes & champignons"
    assert first["image"].startswith("https://static.jow.fr/")
    assert [r["title"] for r in search(catalog, "lentille")] == ["Dahl de lentilles corail"]
    assert [r["title"] for r in search(catalog, "poulet")] == ["Pâtes Alfredo au poulet"]
    assert search(catalog, "chili carne")[0]["title"] == "Chili con carne"
    assert len(search(catalog, "")) == 6
    assert "key" not in search(catalog, "")[0]
