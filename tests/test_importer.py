"""Import depuis une vraie connexion HTTP, avec une page envoyée en plusieurs morceaux."""

from __future__ import annotations

import asyncio

import aiohttp
from aiohttp import web

from custom_components.frigo_malin.importer import async_import_recipe
from custom_components.frigo_malin.parsing import extract_recipe_from_html, html_to_text

# Page « minifiée » comme celles de Marmiton : beaucoup de CSS en tête, attribut sans guillemets,
# et la fiche recette loin dans la page.
CSS = "<style>/* recipe */.recipe-page__infos{margin-bottom:var(--block-vertical-margin)}</style>" * 400
LDJSON = (
    '<script type=application/ld+json>{"@context":"http://schema.org","@type":"Recipe",'
    '"name":"Steak tartare","recipeYield":"4","recipeIngredient":["600 g de boeuf haché","2 jaunes d\'oeufs"],'
    '"recipeInstructions":[{"@type":"HowToStep","text":"Hacher."},{"@type":"HowToStep","text":"Mélanger."}]}</script>'
)
PAGE = f"<!doctype html><html><head><title>Steak tartare</title>{CSS}</head><body>{'<p>pub</p>' * 2000}{LDJSON}</body></html>"


class _NoAI:
    async def extract_recipe(self, text, url):  # pragma: no cover - ne doit pas être appelé
        raise AssertionError("L'IA ne devrait pas être appelée : la fiche JSON-LD suffit")


async def test_import_reads_whole_chunked_page(socket_enabled) -> None:
    async def handler(request):
        resp = web.StreamResponse()
        resp.content_type = "text/html"
        resp.charset = "utf-8"
        await resp.prepare(request)
        data = PAGE.encode()
        for i in range(0, len(data), 8000):
            await resp.write(data[i : i + 8000])
            await asyncio.sleep(0.01)
        await resp.write_eof()
        return resp

    app = web.Application()
    app.router.add_get("/recette", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    try:
        async with aiohttp.ClientSession() as session:
            recipe = await async_import_recipe(session, _NoAI(), f"http://127.0.0.1:{port}/recette")
    finally:
        await runner.cleanup()
    assert recipe["title"] == "Steak tartare"
    assert recipe["ingredients"][0] == {"quantity": 600.0, "unit": "g", "name": "boeuf haché"}
    assert recipe["steps"] == ["Hacher.", "Mélanger."]


def test_unquoted_ldjson_attribute():
    assert extract_recipe_from_html(PAGE)["title"] == "Steak tartare"


def test_css_is_not_sent_to_the_ai():
    page = (
        "<html><head><title>Tarte</title></head><body>"
        "<div>/* recipe */.recipe-page__infos{margin-bottom:var(--block-vertical-margin)}@media screen and (max-width:560px){body{margin-top:168px}}</div>"
        "<h2>Ingrédients</h2><ul><li>200 g de farine</li></ul></body></html>"
    )
    text = html_to_text(page)
    assert "margin" not in text
    assert "200 g de farine" in text
