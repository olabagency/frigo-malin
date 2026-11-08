"""Import d'une recette depuis son adresse web (Marmiton, 750g, blogs...)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import aiohttp

from .ai import AIClient, AIError
from .parsing import count_ldjson, extract_recipe_from_html, extract_recipe_from_microdata, html_to_text

_LOGGER = logging.getLogger(__name__)

MAX_PAGE_SIZE = 8 * 1024 * 1024
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Mobile Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
}


class RecipeImportError(Exception):
    """Erreur d'import lisible."""


async def async_import_recipe(session: aiohttp.ClientSession, ai: AIClient, url: str) -> dict[str, Any]:
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise RecipeImportError("Adresse invalide : elle doit commencer par https://")

    try:
        async with session.get(
            url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30), allow_redirects=True
        ) as resp:
            if resp.status >= 400:
                raise RecipeImportError(f"Le site a répondu avec l'erreur {resp.status}.")
            # On lit la page jusqu'au bout : content.read(n) ne renvoie que ce qui est déjà
            # arrivé (souvent un seul morceau), d'où des pages tronquées sans la recette.
            chunks: list[bytes] = []
            size = 0
            async for chunk in resp.content.iter_chunked(64 * 1024):
                chunks.append(chunk)
                size += len(chunk)
                if size >= MAX_PAGE_SIZE:
                    break
            page = b"".join(chunks).decode(resp.charset or "utf-8", errors="replace")
            final_url = str(resp.url)
    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        raise RecipeImportError("Impossible d'ouvrir cette page.") from err

    recipe = extract_recipe_from_html(page, final_url)
    if not (recipe and recipe["ingredients"]):
        recipe = extract_recipe_from_microdata(page, final_url)
    if recipe and recipe["ingredients"]:
        recipe["origin"] = "url"
        return recipe

    blocks, readable = count_ldjson(page)
    text = html_to_text(page)
    _LOGGER.warning(
        "Import de %s : pas de recette structurée (page de %s caractères, %s bloc(s) JSON-LD dont %s lisible(s)). "
        "Analyse du texte par l'IA (%s caractères).",
        final_url,
        len(page),
        blocks,
        readable,
        len(text),
    )
    if len(text) < 200:
        raise RecipeImportError(
            "Le site n'a pas renvoyé la recette (page vide ou protection anti-robots). "
            "Copiez les ingrédients et les étapes dans « Nouvelle recette »."
        )
    try:
        recipe = await ai.extract_recipe(text, final_url)
    except AIError as err:
        _LOGGER.warning("Import de %s : l'IA n'a pas trouvé de recette. Début du texte : %s", final_url, text[:300])
        raise RecipeImportError(str(err)) from err
    recipe["origin"] = "url"
    return recipe
