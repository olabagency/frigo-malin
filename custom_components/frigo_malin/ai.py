"""Appels à l'IA (Claude ou OpenAI) pour Frigo Malin.

On passe par HTTP directement (aiohttp, déjà fourni par Home Assistant) pour
ne pas imposer de version des SDK, qui entrerait en conflit avec les
intégrations officielles de HA.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiohttp

from .const import DEFAULT_MODELS, PROVIDER_ANTHROPIC, PROVIDER_OPENAI
from .parsing import extract_json, normalize_ingredient

_LOGGER = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2026-10-21"
# Modèles Claude qui acceptent le repli automatique côté serveur en cas de refus.
_ANTHROPIC_FALLBACK_MODELS = ("claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5")
OPENAI_URL = "https://api.openai.com/v1"
TIMEOUT = aiohttp.ClientTimeout(total=180)


class AIError(Exception):
    """Erreur lisible renvoyée à l'interface."""


class InvalidAuth(AIError):
    """Clé API refusée."""


SYSTEM_PROMPT = (
    "Tu es Frigo Malin, un assistant de cuisine pour un foyer français. "
    "Tu réponds toujours en français et uniquement avec du JSON valide, sans texte autour. "
    "Les quantités sont en unités métriques françaises (g, kg, ml, cl, l, c. à soupe, c. à café, pincée...)."
)

DETECT_PROMPT = """Voici une photo de l'intérieur d'un frigo (ou d'un placard).
Liste les aliments que tu reconnais avec certitude ou forte probabilité.
Ignore les emballages illisibles. Utilise des noms simples et courants (« tomates », « yaourts nature », « beurre »).

Réponds avec ce JSON :
{"ingredients": [{"name": "tomates", "amount": "environ 4"}]}
Le champ "amount" est une estimation courte, ou une chaîne vide si tu ne sais pas."""

RECIPE_SCHEMA = """{"recipes": [{
  "title": "Nom de la recette",
  "description": "Une phrase qui donne envie",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 20,
  "ingredients": [{"quantity": 200, "unit": "g", "name": "farine"}],
  "steps": ["Étape 1...", "Étape 2..."],
  "tags": ["rapide", "végétarien"],
  "uses": ["ingrédients du frigo utilisés"],
  "missing": ["ingrédients à acheter en plus"]
}]}
"quantity" est un nombre ou null, "unit" peut être une chaîne vide, les temps sont en minutes."""

STYLE_HINTS = {
    "classic": "Propose des recettes classiques, familiales et sûres, que tout le monde connaît.",
    "creative": "Sois créatif : associations originales, cuisines du monde, twists inattendus, mais toujours réalisables à la maison.",
}


def _image_part_anthropic(image_b64: str, mime: str) -> dict[str, Any]:
    return {"type": "image", "source": {"type": "base64", "media_type": mime, "data": image_b64}}


def _image_part_openai(image_b64: str, mime: str) -> dict[str, Any]:
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}}


class AIClient:
    """Client minimal pour les deux fournisseurs."""

    def __init__(self, session: aiohttp.ClientSession, provider: str, api_key: str, model: str | None) -> None:
        self._session = session
        self.provider = provider
        self._api_key = api_key
        self.model = model or DEFAULT_MODELS[provider]

    # ------------------------------------------------------------------ bas niveau

    async def validate(self) -> None:
        """Vérifie la clé en listant les modèles (gratuit)."""
        if self.provider == PROVIDER_ANTHROPIC:
            url, headers = f"{ANTHROPIC_URL}/models", self._anthropic_headers()
        else:
            url, headers = f"{OPENAI_URL}/models", self._openai_headers()
        try:
            async with self._session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status in (401, 403):
                    raise InvalidAuth("Clé API refusée")
                if resp.status >= 400:
                    raise AIError(f"Erreur {resp.status} du fournisseur")
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise AIError("Impossible de joindre le fournisseur d'IA") from err

    def _anthropic_headers(self, beta: str | None = None) -> dict[str, str]:
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        if beta:
            headers["anthropic-beta"] = beta
        return headers

    def _openai_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    async def _post(self, url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with self._session.post(url, headers=headers, json=payload, timeout=TIMEOUT) as resp:
                body = await resp.text()
                if resp.status in (401, 403):
                    raise InvalidAuth("Clé API refusée : vérifiez-la dans les réglages de l'intégration.")
                if resp.status == 429:
                    raise AIError("Trop de demandes ou crédit épuisé chez le fournisseur d'IA. Réessayez plus tard.")
                if resp.status >= 400:
                    _LOGGER.warning("Erreur IA %s : %s", resp.status, body[:500])
                    try:
                        message = json.loads(body).get("error", {}).get("message")
                    except (ValueError, AttributeError):
                        message = None
                    raise AIError(message or f"Erreur {resp.status} du fournisseur d'IA")
                return json.loads(body)
        except asyncio.TimeoutError as err:
            raise AIError("L'IA a mis trop de temps à répondre.") from err
        except aiohttp.ClientError as err:
            raise AIError("Impossible de joindre le fournisseur d'IA.") from err

    async def _complete(self, prompt: str, image: tuple[str, str] | None = None) -> Any:
        """Envoie une demande et renvoie le JSON de la réponse."""
        if self.provider == PROVIDER_ANTHROPIC:
            content: list[dict[str, Any]] = []
            if image:
                content.append(_image_part_anthropic(*image))
            content.append({"type": "text", "text": prompt})
            payload: dict[str, Any] = {
                "model": self.model,
                "max_tokens": 16000,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": content}],
            }
            beta = None
            if self.model in _ANTHROPIC_FALLBACK_MODELS:
                payload["fallbacks"] = "default"
                beta = "server-side-fallback-2026-07-01"
            data = await self._post(f"{ANTHROPIC_URL}/messages", self._anthropic_headers(beta), payload)
            if data.get("stop_reason") == "refusal":
                raise AIError("L'IA a refusé cette demande. Essayez avec une autre photo ou une autre formulation.")
            text = "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
        elif self.provider == PROVIDER_OPENAI:
            user_content: list[dict[str, Any]] = []
            if image:
                user_content.append(_image_part_openai(*image))
            user_content.append({"type": "text", "text": prompt})
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                "response_format": {"type": "json_object"},
                "max_completion_tokens": 16000,
            }
            data = await self._post(f"{OPENAI_URL}/chat/completions", self._openai_headers(), payload)
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message") or {}
            if message.get("refusal"):
                raise AIError("L'IA a refusé cette demande.")
            text = message.get("content") or ""
        else:
            raise AIError(f"Fournisseur inconnu : {self.provider}")

        try:
            return extract_json(text)
        except ValueError as err:
            _LOGGER.debug("Réponse illisible : %s", text[:1000])
            raise AIError("La réponse de l'IA était illisible. Réessayez.") from err

    # ------------------------------------------------------------------ usages

    async def detect_ingredients(self, image_b64: str, mime: str) -> list[dict[str, str]]:
        data = await self._complete(DETECT_PROMPT, (image_b64, mime))
        result = []
        seen = set()
        for item in data.get("ingredients", []) if isinstance(data, dict) else []:
            if isinstance(item, str):
                item = {"name": item}
            name = str(item.get("name") or "").strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                result.append({"name": name, "amount": str(item.get("amount") or "").strip()})
        return result

    async def suggest_recipes(
        self,
        ingredients: list[str],
        style: str = "classic",
        count: int = 3,
        servings: int = 4,
        notes: str = "",
    ) -> list[dict[str, Any]]:
        count = max(1, min(int(count), 6))
        prompt = (
            f"Ingrédients disponibles : {', '.join(ingredients)}.\n"
            "On suppose que le foyer a aussi les basiques : sel, poivre, huile, beurre, farine, sucre, épices courantes.\n"
            f"{STYLE_HINTS.get(style, STYLE_HINTS['classic'])}\n"
            f"Propose {count} recettes pour {servings} personnes qui utilisent au maximum ces ingrédients "
            "et demandent le moins d'achats possible. Étapes claires et numérotables, une action par étape.\n"
        )
        if notes.strip():
            prompt += f"Contraintes du foyer : {notes.strip()}\n"
        prompt += f"\nRéponds avec ce JSON :\n{RECIPE_SCHEMA}"
        data = await self._complete(prompt)
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        return [clean_ai_recipe(r) for r in recipes if isinstance(r, dict) and r.get("title")]

    async def extract_recipe(self, page_text: str, url: str) -> dict[str, Any]:
        """Secours quand une page n'expose pas de recette structurée."""
        prompt = (
            "Voici le texte d'une page web qui contient une recette. Extrais-la fidèlement, sans rien inventer.\n"
            "Si la page ne contient pas de recette, renvoie {\"recipes\": []}.\n\n"
            f"Réponds avec ce JSON (une seule recette) :\n{RECIPE_SCHEMA}\n\n--- PAGE ---\n{page_text}"
        )
        data = await self._complete(prompt)
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        if not recipes:
            raise AIError("Aucune recette trouvée sur cette page.")
        recipe = clean_ai_recipe(recipes[0])
        recipe["source_url"] = url
        return recipe


def _int_or_none(value: Any) -> int | None:
    try:
        return int(float(value)) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def clean_ai_recipe(raw: dict[str, Any]) -> dict[str, Any]:
    """Met une recette proposée par l'IA au format du carnet."""
    return {
        "title": str(raw.get("title") or "").strip(),
        "description": str(raw.get("description") or "").strip(),
        "servings": _int_or_none(raw.get("servings")),
        "prep_time": _int_or_none(raw.get("prep_time")),
        "cook_time": _int_or_none(raw.get("cook_time")),
        "ingredients": [i for i in (normalize_ingredient(x) for x in raw.get("ingredients") or []) if i],
        "steps": [str(s).strip() for s in raw.get("steps") or [] if str(s).strip()],
        "tags": [str(t).strip() for t in raw.get("tags") or [] if str(t).strip()][:8],
        "uses": [str(t).strip() for t in raw.get("uses") or [] if str(t).strip()],
        "missing": [str(t).strip() for t in raw.get("missing") or [] if str(t).strip()],
    }
