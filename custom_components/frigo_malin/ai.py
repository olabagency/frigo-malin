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
# Planifier une semaine entière demande une longue réponse.
LONG_TIMEOUT = aiohttp.ClientTimeout(total=420)


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

Pour chaque aliment, estime aussi combien de jours il se garde encore à partir d'aujourd'hui, d'après ce que tu vois
(salade fraîche 3, salade un peu fanée 1, yaourts fermés 10, crème entamée 4, fromage à pâte dure 14, viande crue 2…).

Note aussi où se trouve chaque aliment, pour afficher le frigo tel qu'il est rangé :
"place" vaut "etagere" (étagères du frigo), "bac" (bac à légumes en bas), "porte" (balconnets de la porte),
"congelateur" ou "placard" ; "shelf" est le numéro d'étagère en partant du haut (1 = la plus haute), null sinon.
Liste les aliments dans l'ordre du frigo : de l'étagère du haut vers le bas, puis le bac, puis la porte.

Réponds avec ce JSON :
{"ingredients": [{"name": "tomates", "amount": "environ 4", "keeps_days": 5, "place": "bac", "shelf": null}]}
Le champ "amount" est une estimation courte, ou une chaîne vide si tu ne sais pas.
"keeps_days" est un nombre entier de jours, ou null pour les produits qui se gardent des mois (conserves, pâtes…)."""

FRIDGE_PLACES = ("etagere", "bac", "porte", "congelateur", "placard")

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


# Niveau de modèle par tâche (mode « économique ») : léger, intermédiaire, ou le modèle choisi (haut de gamme).
TASK_TIERS = {
    "detect": "light",  # reconnaître les aliments sur une photo du frigo
    "ideas": "light",  # idées de recettes avec ce qu'il y a
    "import": "mid",  # lire une page de recette
    "library": "mid",  # nouvelles idées pour la bibliothèque
    "plan": "top",  # planifier la semaine
    "recipe": "top",  # écrire les recettes du menu
    "photo": "top",  # lire une recette photographiée (manuscrite…)
    "nutrition": "light",  # valeurs nutritionnelles d'aliments absents de la table
}
TIER_MODELS = {
    PROVIDER_ANTHROPIC: {"light": "claude-haiku-5-5", "mid": "claude-sonnet-5-5"},
    PROVIDER_OPENAI: {"light": "gpt-5-mini", "mid": "gpt-5-mini"},
}
# Prix en dollars par million de jetons (entrée, sortie), pour estimer la dépense.
PRICES = {
    "claude-fable-5-1": (10, 50),
    "claude-opus-5-5": (4, 20),
    "claude-opus-5": (5, 25),
    "claude-sonnet-5-5": (2, 10),
    "claude-sonnet-5": (2, 10),
    "claude-haiku-5-5": (0.10, 0.50),
    "gpt-5": (1.25, 10),
    "gpt-5-mini": (0.25, 2),
    "gpt-5-nano": (0.05, 0.40),
}
DEFAULT_PRICE = (5, 25)


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Coût estimé d'une demande, en dollars."""
    price_in, price_out = PRICES.get(model, DEFAULT_PRICE)
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000


class AIClient:
    """Client minimal pour les deux fournisseurs."""

    def __init__(self, session: aiohttp.ClientSession, provider: str, api_key: str, model: str | None) -> None:
        self._session = session
        self.provider = provider
        self._api_key = api_key
        self.model = model or DEFAULT_MODELS[provider]
        # « economy » : un modèle adapté à chaque tâche ; « single » : toujours self.model.
        self.mode = "economy"
        # Appelé après chaque demande : (tâche, modèle, coût en dollars).
        self.on_usage: Any = None

    def model_for(self, task: str) -> str:
        if self.mode != "economy":
            return self.model
        tier = TASK_TIERS.get(task, "top")
        return TIER_MODELS.get(self.provider, {}).get(tier, self.model)

    def _record(self, task: str, model: str, usage: dict[str, Any] | None) -> None:
        if not usage or not self.on_usage:
            return
        input_tokens = sum(
            int(usage.get(k) or 0)
            for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "prompt_tokens")
        )
        output_tokens = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
        try:
            self.on_usage(task, model, estimate_cost(model, input_tokens, output_tokens))
        except Exception:  # noqa: BLE001 - le suivi des dépenses ne doit jamais bloquer
            _LOGGER.debug("Suivi des dépenses impossible", exc_info=True)

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

    async def _post(
        self, url: str, headers: dict[str, str], payload: dict[str, Any], timeout: aiohttp.ClientTimeout = TIMEOUT
    ) -> dict[str, Any]:
        try:
            async with self._session.post(url, headers=headers, json=payload, timeout=timeout) as resp:
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

    async def _complete(
        self,
        prompt: str,
        image: tuple[str, str] | None = None,
        images: list[tuple[str, str]] | None = None,
        max_tokens: int = 16000,
        timeout: aiohttp.ClientTimeout = TIMEOUT,
        task: str = "plan",
    ) -> Any:
        """Envoie une demande et renvoie le JSON de la réponse."""
        model = self.model_for(task)
        pictures = list(images or []) + ([image] if image else [])
        if self.provider == PROVIDER_ANTHROPIC:
            content: list[dict[str, Any]] = [_image_part_anthropic(*pic) for pic in pictures]
            content.append({"type": "text", "text": prompt})
            payload: dict[str, Any] = {
                "model": model,
                "max_tokens": max_tokens,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": content}],
            }
            beta = None
            if model in _ANTHROPIC_FALLBACK_MODELS:
                payload["fallbacks"] = "default"
                beta = "server-side-fallback-2026-07-01"
            data = await self._post(f"{ANTHROPIC_URL}/messages", self._anthropic_headers(beta), payload, timeout)
            self._record(task, model, data.get("usage"))
            if data.get("stop_reason") == "max_tokens":
                _LOGGER.warning("Réponse de l'IA coupée (limite de longueur atteinte)")
            if data.get("stop_reason") == "refusal":
                raise AIError("L'IA a refusé cette demande. Essayez avec une autre photo ou une autre formulation.")
            text = "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
        elif self.provider == PROVIDER_OPENAI:
            user_content: list[dict[str, Any]] = [_image_part_openai(*pic) for pic in pictures]
            user_content.append({"type": "text", "text": prompt})
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                "response_format": {"type": "json_object"},
                "max_completion_tokens": max_tokens,
            }
            data = await self._post(f"{OPENAI_URL}/chat/completions", self._openai_headers(), payload, timeout)
            self._record(task, model, data.get("usage"))
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

    async def estimate_foods(self, names: list[str]) -> dict[str, dict[str, Any]]:
        """Valeurs nutritionnelles moyennes pour 100 g d'aliments inconnus de la table."""
        names = [n for n in dict.fromkeys(n.strip() for n in names) if n][:40]
        if not names:
            return {}
        prompt = (
            "Pour chaque aliment ci-dessous (ingrédients de recettes françaises), donne ses valeurs nutritionnelles "
            "moyennes pour 100 g, tel qu'on l'achète (cru s'il se cuisine), d'après les tables de référence (Ciqual, USDA). "
            "Donne aussi le poids moyen d'une pièce en grammes quand on le compte à l'unité (sinon null). "
            "Marque negligible: true pour ce qui ne compte pas (épices, herbes, sel, eau, arômes).\n\n"
            + "\n".join(f"- {n}" for n in names)
            + '\n\nRéponds avec ce JSON :\n{"foods": [{"name": "nom exact de la liste", "kcal": 0, "protein": 0, '
            '"carbs": 0, "fat": 0, "fiber": 0, "piece_g": null, "negligible": false}]}'
        )
        data = await self._complete(prompt, max_tokens=4000, task="nutrition")
        result: dict[str, dict[str, Any]] = {}
        for item in data.get("foods", []) if isinstance(data, dict) else []:
            if isinstance(item, dict) and str(item.get("name") or "").strip():
                result[str(item["name"]).strip()] = item
        return result

    async def detect_ingredients(self, image_b64: str, mime: str) -> list[dict[str, str]]:
        data = await self._complete(DETECT_PROMPT, (image_b64, mime), task="detect")
        result = []
        seen = set()
        for item in data.get("ingredients", []) if isinstance(data, dict) else []:
            if isinstance(item, str):
                item = {"name": item}
            name = str(item.get("name") or "").strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                result.append(
                    {
                        "name": name,
                        "amount": str(item.get("amount") or "").strip(),
                        "keeps_days": _int_or_none(item.get("keeps_days")),
                        "place": item.get("place") if item.get("place") in FRIDGE_PLACES else None,
                        "shelf": _int_or_none(item.get("shelf")),
                    }
                )
        return result

    async def suggest_recipes(
        self,
        ingredients: list[str],
        style: str = "classic",
        count: int = 3,
        servings: int = 4,
        notes: str = "",
        household: str = "",
        priority: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        count = max(1, min(int(count), 6))
        prompt = (
            f"Ingrédients disponibles : {', '.join(ingredients)}.\n"
            "On suppose que le foyer a aussi les basiques : sel, poivre, huile, beurre, farine, sucre, épices courantes.\n"
            f"{STYLE_HINTS.get(style, STYLE_HINTS['classic'])}\n"
            f"Propose {count} recettes pour {servings} personnes qui utilisent au maximum ces ingrédients "
            "et demandent le moins d'achats possible. Étapes claires et numérotables, une action par étape.\n"
        )
        if priority:
            prompt += (
                "À utiliser EN PRIORITÉ, car ils vont bientôt se perdre : " + ", ".join(priority) + ". "
                "Chaque recette doit en utiliser au moins un.\n"
            )
        if household:
            prompt += f"\nProfil du foyer :\n{household}\n"
        if notes.strip():
            prompt += f"Envies pour cette fois : {notes.strip()}\n"
        prompt += f"\nRéponds avec ce JSON :\n{RECIPE_SCHEMA}"
        data = await self._complete(prompt, task="ideas")
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        return [clean_ai_recipe(r) for r in recipes if isinstance(r, dict) and r.get("title")]

    async def extract_recipe(self, page_text: str, url: str) -> dict[str, Any]:
        """Secours quand une page n'expose pas de recette structurée."""
        prompt = (
            "Voici le texte d'une page web qui contient une recette. Extrais-la fidèlement, sans rien inventer.\n"
            "Si la page ne contient pas de recette, renvoie {\"recipes\": []}.\n\n"
            f"Réponds avec ce JSON (une seule recette) :\n{RECIPE_SCHEMA}\n\n--- PAGE ---\n{page_text}"
        )
        data = await self._complete(prompt, task="import")
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        if not recipes:
            raise AIError("Aucune recette trouvée sur cette page.")
        recipe = clean_ai_recipe(recipes[0])
        recipe["source_url"] = url
        return recipe

    async def theme_recipes(
        self,
        theme: str,
        dish_type: str = "",
        count: int = 4,
        servings: int = 4,
        household: str = "",
        month: str = "",
        exclude: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Nouvelles recettes saines sur un thème (anti-inflammatoire, vegan…)."""
        count = max(1, min(int(count), 6))
        prompt = (
            f"Propose {count} recettes {theme.lower() if theme else 'saines et équilibrées'}"
            + (f" de type « {dish_type.lower()} »" if dish_type else "")
            + f" pour {servings} personnes, en France, au mois de {month}.\n"
            "Cuisine saine et gourmande : légumes, légumineuses, céréales complètes, bons gras (huile d'olive, colza,"
            " noix, poissons gras), épices (curcuma avec du poivre, gingembre), peu de sucre et peu de produits transformés.\n"
            "Produits de saison. Recettes réalistes un soir de semaine, 7 étapes au plus, phrases courtes.\n"
            "Dans \"tags\", indique les bienfaits nutritionnels en 2 ou 3 mots chacun (ex. « Oméga-3 », « Fibres »).\n"
        )
        if exclude:
            prompt += "Évite ces recettes, déjà connues : " + ", ".join(exclude[:60]) + ".\n"
        if household:
            prompt += f"\nProfil du foyer :\n{household}\n"
        prompt += f"\nRéponds avec ce JSON :\n{RECIPE_SCHEMA}"
        data = await self._complete(prompt, task="library")
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        return [clean_ai_recipe(r) for r in recipes if isinstance(r, dict) and r.get("title")]

    async def recipe_from_photos(self, images: list[tuple[str, str]]) -> dict[str, Any]:
        """Lit une recette photographiée (livre, fiche manuscrite…)."""
        data = await self._complete(PHOTO_PROMPT, images=images, task="photo")
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        if not recipes or not recipes[0].get("title"):
            raise AIError("Je ne trouve pas de recette sur cette photo. Essayez avec une photo plus nette, bien à plat.")
        return clean_ai_recipe(recipes[0])

    async def plan_week(
        self,
        slots: list[dict[str, Any]],
        servings: int,
        household: str = "",
        budget: int | None = None,
        carnet: list[dict[str, Any]] | None = None,
        leftovers: bool = True,
        notes: str = "",
        month: str = "",
        locked: list[dict[str, Any]] | None = None,
        avoid: list[str] | None = None,
    ) -> dict[str, Any]:
        """Propose le MENU (titres, temps, coût, restes) pour les créneaux demandés.

        Les recettes détaillées sont écrites ensuite, seulement pour les repas gardés
        (voir write_recipe). `locked` : repas déjà choisis, à ne pas changer mais à prendre
        en compte (variété, restes). `avoid` : plats à ne pas reproposer.
        """
        lines = [
            f"Prépare le menu de la semaine pour {servings} personnes, en France, au mois de {month}.",
            "Créneaux à remplir (un repas par créneau, dans cet ordre) :",
        ]
        for slot in slots:
            lines.append(
                f"- {slot['date']} ({slot['day']}) {slot['slot_label']} : {slot['max_time']} minutes maximum en tout"
            )
        if locked:
            lines += ["", "Repas déjà choisis par le foyer (ne les propose pas, mais tiens-en compte pour varier le menu) :"]
            for meal in locked:
                lines.append(f"- {meal['date']} {'midi' if meal['slot'] == 'lunch' else 'soir'} : {meal['title']}")
        if avoid:
            lines += ["", "Ne repropose pas ces plats : " + ", ".join(avoid[:40]) + "."]
        lines += [
            "",
            "Règles :",
            "- Menu varié et équilibré : pas deux fois la même protéine ou le même féculent de suite, des légumes à chaque repas.",
            "- Produits de saison pour ce mois-là en France.",
            "- Respecte le temps maximum de chaque créneau (préparation + cuisson) : rapide en semaine, plus élaboré le week-end.",
            "- Ne détaille PAS les recettes : seulement le nom du plat, une phrase de description, 3 à 6 ingrédients principaux.",
            "- time : temps total en minutes ; estimated_cost : coût du repas en euros, prix de supermarché français.",
        ]
        if budget:
            lines.append(f"- Budget : {budget} € maximum pour l'ensemble de ces repas. Reste en dessous.")
        if leftovers:
            lines.append(
                "- Cuisine des restes : prévois 1 à 3 enchaînements où un plat est cuisiné en plus grande quantité"
                " (sa note le dit : « Préparez-en le double… ») et réutilisé dans un repas suivant, transformé"
                " (poulet rôti → salade de poulet, riz → riz sauté). Ce repas renseigne leftovers_from avec la date"
                " et le créneau du plat d'origine, et sa note dit « Avec les restes de … »."
            )
        if carnet:
            lines.append(
                "- Tu peux reprendre 1 à 3 recettes du carnet du foyer (de préférence les favorites) : indique alors recipe_id. Carnet :"
            )
            for r in carnet:
                lines.append(f"  - id={r['id']} : {r['title']}" + (" (favorite)" if r.get("favorite") else ""))
        if household:
            lines += ["", "Profil du foyer :", household]
        if notes.strip():
            lines += ["", f"Envies pour cette semaine : {notes.strip()}"]
        lines += [
            "",
            "Réponds avec ce JSON :",
            """{"summary": "Deux phrases sur l'esprit de ce menu",
 "meals": [{"date": "2026-11-09", "slot": "dinner", "recipe_id": null, "title": "Poulet rôti aux légumes",
   "description": "Une phrase.", "key_ingredients": ["poulet", "carottes", "pommes de terre"],
   "time": 75, "estimated_cost": 12.5, "leftovers_from": null, "note": ""}]}
slot vaut "lunch" (midi) ou "dinner" (soir). leftovers_from vaut null ou {"date": "...", "slot": "..."}.""",
        ]
        data = await self._complete("\n".join(lines), max_tokens=8000, timeout=LONG_TIMEOUT, task="plan")
        if not isinstance(data, dict):
            raise AIError("La réponse de l'IA était illisible. Réessayez.")
        wanted = {(s["date"], s["slot"]) for s in slots}
        known = {r["id"]: r for r in carnet or []}
        meals = []
        for raw in data.get("meals") or []:
            if not isinstance(raw, dict) or (raw.get("date"), raw.get("slot")) not in wanted:
                continue
            recipe_id = raw.get("recipe_id") if raw.get("recipe_id") in known else None
            title = known[recipe_id]["title"] if recipe_id else str(raw.get("title") or "").strip()
            if not title:
                continue
            source = raw.get("leftovers_from")
            meals.append(
                {
                    "date": raw["date"],
                    "slot": raw["slot"],
                    "recipe_id": recipe_id,
                    "title": title,
                    "description": str(raw.get("description") or "").strip()[:300],
                    "key_ingredients": [str(x).strip() for x in raw.get("key_ingredients") or [] if str(x).strip()][:6],
                    "time": _int_or_none(raw.get("time")),
                    "note": str(raw.get("note") or "").strip()[:200],
                    "leftovers_from": source if isinstance(source, dict) and source.get("date") else None,
                    "estimated_cost": _float_or_none(raw.get("estimated_cost")),
                }
            )
            wanted.discard((raw["date"], raw["slot"]))
        if not meals:
            raise AIError("L'IA n'a pas proposé de menu. Réessayez.")
        meals.sort(key=lambda m: (m["date"], 0 if m["slot"] == "lunch" else 1))
        return {"summary": str(data.get("summary") or "").strip(), "meals": meals}

    async def write_recipe(
        self, meal: dict[str, Any], servings: int, household: str = "", leftovers_title: str = ""
    ) -> dict[str, Any]:
        """Écrit la recette complète d'un repas du menu (après validation)."""
        prompt = (
            f"Écris la recette « {meal['title']} » pour {servings} personnes.\n"
            + (f"Description : {meal.get('description')}\n" if meal.get("description") else "")
            + (f"Ingrédients principaux prévus : {', '.join(meal.get('key_ingredients') or [])}.\n" if meal.get("key_ingredients") else "")
            + (f"Temps total visé : {meal['time']} minutes au maximum.\n" if meal.get("time") else "")
            + (f"Remarque du menu : {meal['note']}\n" if meal.get("note") else "")
            + (
                f"Ce repas réutilise les restes de « {leftovers_title} » : ne mets PAS ces restes dans la liste "
                "des ingrédients, mentionne-les dans les étapes.\n"
                if leftovers_title
                else ""
            )
            + "Recette concise et réaliste : 7 étapes au plus, phrases courtes, quantités pour le nombre de personnes indiqué.\n"
            + (f"\nProfil du foyer :\n{household}\n" if household else "")
            + f"\nRéponds avec ce JSON (une seule recette) :\n{RECIPE_SCHEMA}"
        )
        data = await self._complete(prompt, task="recipe")
        recipes = data.get("recipes", []) if isinstance(data, dict) else []
        if not recipes:
            raise AIError(f"Recette non écrite : {meal['title']}")
        recipe = clean_ai_recipe(recipes[0])
        recipe["title"] = recipe["title"] or meal["title"]
        return recipe


PHOTO_PROMPT = """Ces photos montrent une recette : page de livre, magazine, fiche manuscrite ou écran.
S'il y a plusieurs photos, ce sont les pages successives d'une même recette.
Recopie la recette fidèlement, sans rien inventer ni « améliorer » : mêmes quantités, mêmes étapes, même titre.
Déchiffre l'écriture manuscrite avec soin ; si un mot reste illisible, écris [illisible].
Si une information manque (temps, portions), mets null. Si plusieurs recettes figurent sur la page, prends la principale.
Si ce n'est pas une recette, renvoie {"recipes": []}.

Réponds avec ce JSON (une seule recette) :
""" + RECIPE_SCHEMA


def _float_or_none(value: Any) -> float | None:
    try:
        return round(float(value), 2) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


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
