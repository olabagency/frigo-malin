"""Commandes websocket utilisées par l'interface du panneau."""

from __future__ import annotations

import asyncio
import base64
import binascii
import logging
from datetime import date
from typing import TYPE_CHECKING, Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .ai import AIError
from .const import (
    CONF_AUTO_SHOPPING,
    CONF_DEFAULT_SERVINGS,
    CONF_EXCLUDED,
    CONF_MODEL,
    CONF_PROVIDER,
    CONF_SHOPPING_ENTITY,
    DEFAULT_EXCLUDED,
    DEFAULT_MODELS,
    DEFAULT_SERVINGS,
    DEFAULT_SHOPPING_ENTITY,
    DOMAIN,
    SLOTS,
    VERSION,
)
from .drive import CONNECTORS
from .timers import async_cancel_timer, async_start_timer
from .todo import OWN_LIST_ENTITY
from .importer import RecipeImportError, async_import_recipe
from .household import household_context, household_servings
from .library import THEMES, TYPES, load_library
from .parsing import (
    aggregate_shopping,
    merge_into_list,
    parse_excluded,
    parse_list_text,
    shopping_item,
    shopping_key,
    subtract_from_list,
)

if TYPE_CHECKING:
    from . import FrigoData

_LOGGER = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _data(hass: HomeAssistant) -> FrigoData:
    data = hass.data.get(DOMAIN)
    if data is None:
        raise HomeAssistantError("Frigo Malin n'est pas configuré")
    return data


def _options(data: FrigoData) -> dict[str, Any]:
    return {**data.entry.data, **data.entry.options}


def _servings_default(data: FrigoData) -> int:
    """Portions par défaut : celles du foyer s'il est décrit, sinon le réglage de l'intégration."""
    fallback = int(_options(data).get(CONF_DEFAULT_SERVINGS) or DEFAULT_SERVINGS)
    return household_servings(data.store.settings, fallback)


def _decode_image(image: str) -> str:
    """Vérifie une image envoyée en base64 et la renvoie sans l'en-tête data:."""
    if image.startswith("data:"):
        image = image.split(",", 1)[-1]
    try:
        size = len(base64.b64decode(image, validate=True))
    except (binascii.Error, ValueError) as err:
        raise vol.Invalid("Image illisible") from err
    if size > MAX_IMAGE_BYTES:
        raise vol.Invalid("Image trop lourde")
    return image


def _shopping_entity(hass: HomeAssistant, data: FrigoData) -> str | None:
    """Liste de courses utilisée : celle choisie dans l'app, sinon dans les options,
    sinon la « Liste de courses » de HA, sinon la liste intégrée à Frigo Malin."""
    candidates = [
        data.store.settings.get("shopping_entity"),
        _options(data).get(CONF_SHOPPING_ENTITY),
        DEFAULT_SHOPPING_ENTITY,
        OWN_LIST_ENTITY,
    ]
    for entity_id in candidates:
        if entity_id and hass.states.get(entity_id):
            return entity_id
    return None


def _shopping_info(hass: HomeAssistant, data: FrigoData) -> dict[str, Any]:
    entity_id = _shopping_entity(hass, data)
    state = hass.states.get(entity_id) if entity_id else None
    return {"entity_id": entity_id, "name": state.name if state else None, "builtin": entity_id == OWN_LIST_ENTITY}


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as err:
        raise vol.Invalid("Date invalide") from err


def _plan_items(data: FrigoData, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    batch = []
    for entry in entries:
        recipe = data.store.recipes.get(entry["recipe_id"])
        if not recipe:
            continue
        base = recipe.get("servings") or _servings_default(data)
        batch.append((recipe["ingredients"], entry["servings"] / base, recipe["title"]))
    excluded = parse_excluded(_options(data).get(CONF_EXCLUDED, DEFAULT_EXCLUDED))
    return aggregate_shopping(batch, excluded)


# Fonction « description sur un article » des listes todo (TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM).
_TODO_SET_DESCRIPTION = 64


async def _add_to_list(
    hass: HomeAssistant, data: FrigoData, items: list[dict[str, Any]]
) -> dict[str, Any]:
    """Ajoute des ingrédients à la liste de courses en fusionnant avec ce qui y est déjà.

    `items` : {"name", "quantity", "unit"} et, en option, "recipes" (titres des recettes).
    """
    entity_id = _shopping_entity(hass, data)
    if entity_id is None:
        raise HomeAssistantError(
            "Aucune liste de courses disponible. Choisissez-en une dans ⚙️ Réglages du foyer "
            "(Portions et liste de courses)."
        )
    target = {"entity_id": entity_id}
    try:
        response = await hass.services.async_call(
            "todo", "get_items", {"status": ["needs_action"]}, target=target, blocking=True, return_response=True
        )
        existing = (response or {}).get(entity_id, {}).get("items", [])
    except HomeAssistantError:
        existing = []

    state = hass.states.get(entity_id)
    supports_description = bool(state and int(state.attributes.get("supported_features", 0)) & _TODO_SET_DESCRIPTION)
    recipes_by_key = {shopping_key(i["name"]): i.get("recipes") or [] for i in items}

    added, updated, skipped = [], [], []
    for op in merge_into_list(existing, items):
        if op["op"] == "add":
            payload: dict[str, Any] = {"item": op["text"]}
            recipes = recipes_by_key.get(shopping_key(parse_list_text(op["text"])["name"]))
            if supports_description and recipes:
                payload["description"] = "Pour : " + ", ".join(recipes)
            await hass.services.async_call("todo", "add_item", payload, target=target, blocking=True)
            added.append(op["text"])
        elif op["op"] == "update":
            await hass.services.async_call(
                "todo", "update_item", {"item": op["uid"], "rename": op["text"]}, target=target, blocking=True
            )
            updated.append(op["text"])
        else:
            skipped.append(op["text"])
    return {
        "list_name": state.name if state else entity_id,
        "added": added,
        "updated": updated,
        "skipped": skipped,
    }


def _error(connection: websocket_api.ActiveConnection, msg_id: int, err: Exception) -> None:
    connection.send_error(msg_id, "frigo_malin_error", str(err))


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    for command in (
        ws_config,
        ws_recipes_list,
        ws_recipes_save,
        ws_recipes_patch,
        ws_recipes_delete,
        ws_recipes_import,
        ws_fridge_detect,
        ws_fridge_suggest,
        ws_plan_list,
        ws_plan_add,
        ws_plan_update,
        ws_plan_delete,
        ws_plan_shopping_impact,
        ws_plan_move,
        ws_plan_copy,
        ws_shopping_preview,
        ws_shopping_add,
        ws_shopping_suggestions,
        ws_settings_save,
        ws_recipes_from_photo,
        ws_plan_generate,
        ws_plan_apply,
        ws_library_list,
        ws_library_ideas,
        ws_timer_start,
        ws_timer_cancel,
    ):
        websocket_api.async_register_command(hass, command)


# ---------------------------------------------------------------------- réglages


@websocket_api.websocket_command({vol.Required("type"): "frigo_malin/config"})
@callback
def ws_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    options = _options(data)
    connection.send_result(
        msg["id"],
        {
            "version": VERSION,
            "provider": options[CONF_PROVIDER],
            "model": options.get(CONF_MODEL) or DEFAULT_MODELS[options[CONF_PROVIDER]],
            "default_servings": _servings_default(data),
            "auto_shopping": bool(options.get(CONF_AUTO_SHOPPING, True)),
            "shopping_list": _shopping_info(hass, data),
            "drives": [{"key": key, "name": cls.name} for key, cls in CONNECTORS.items()],
            "settings": data.store.settings,
            "usage": data.store.usage_this_month(),
            "is_admin": connection.user.is_admin,
            "entry_id": data.entry.entry_id,
        },
    )


# ---------------------------------------------------------------------- recettes


@websocket_api.websocket_command({vol.Required("type"): "frigo_malin/recipes/list"})
@callback
def ws_recipes_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    recipes = sorted(_data(hass).store.recipes.values(), key=lambda r: r["title"].lower())
    connection.send_result(msg["id"], {"recipes": recipes})


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/recipes/save", vol.Required("recipe"): dict}
)
@callback
def ws_recipes_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    try:
        recipe = data.store.save_recipe(msg["recipe"], _servings_default(data))
    except ValueError as err:
        _error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"recipe": recipe})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/recipes/patch",
        vol.Required("recipe_id"): str,
        vol.Optional("favorite"): bool,
        vol.Optional("notes"): str,
    }
)
@callback
def ws_recipes_patch(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    store = _data(hass).store
    if msg["recipe_id"] not in store.recipes:
        connection.send_error(msg["id"], "not_found", "Recette introuvable")
        return
    recipe = store.patch_recipe(msg["recipe_id"], favorite=msg.get("favorite"), notes=msg.get("notes"))
    connection.send_result(msg["id"], {"recipe": recipe})


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/recipes/delete", vol.Required("recipe_id"): str}
)
@callback
def ws_recipes_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _data(hass).store.delete_recipe(msg["recipe_id"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/recipes/import", vol.Required("url"): str}
)
@websocket_api.async_response
async def ws_recipes_import(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    data = _data(hass)
    try:
        recipe = await async_import_recipe(async_get_clientsession(hass), data.ai, msg["url"])
    except RecipeImportError as err:
        _error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"recipe": recipe})


# ---------------------------------------------------------------------- frigo


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/fridge/detect",
        vol.Required("image"): str,
        vol.Optional("mime", default="image/jpeg"): vol.In(ALLOWED_MIME),
    }
)
@websocket_api.async_response
async def ws_fridge_detect(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    image = msg["image"]
    if image.startswith("data:"):
        image = image.split(",", 1)[-1]
    try:
        size = len(base64.b64decode(image, validate=True))
    except (binascii.Error, ValueError):
        connection.send_error(msg["id"], "invalid_format", "Image illisible")
        return
    if size > MAX_IMAGE_BYTES:
        connection.send_error(msg["id"], "invalid_format", "Image trop lourde")
        return
    try:
        ingredients = await _data(hass).ai.detect_ingredients(image, msg["mime"])
    except AIError as err:
        _error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"ingredients": ingredients})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/fridge/suggest",
        vol.Required("ingredients"): [str],
        vol.Optional("style", default="classic"): vol.In(["classic", "creative"]),
        vol.Optional("count", default=3): vol.All(int, vol.Range(min=1, max=6)),
        vol.Optional("servings"): vol.All(int, vol.Range(min=1, max=30)),
        vol.Optional("notes", default=""): str,
    }
)
@websocket_api.async_response
async def ws_fridge_suggest(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    data = _data(hass)
    ingredients = [i.strip() for i in msg["ingredients"] if i.strip()]
    if not ingredients:
        connection.send_error(msg["id"], "invalid_format", "La liste d'ingrédients est vide")
        return
    try:
        recipes = await data.ai.suggest_recipes(
            ingredients,
            style=msg["style"],
            count=msg["count"],
            servings=msg.get("servings") or _servings_default(data),
            notes=msg["notes"],
            household=household_context(data.store.settings),
        )
    except AIError as err:
        _error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"recipes": recipes})


# ---------------------------------------------------------------------- menu


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/list",
        vol.Required("start"): _parse_date,
        vol.Required("end"): _parse_date,
    }
)
@callback
def ws_plan_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    entries = _data(hass).store.plan_between(msg["start"], msg["end"])
    connection.send_result(msg["id"], {"entries": entries})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/add",
        vol.Required("date"): _parse_date,
        vol.Required("slot"): vol.In(SLOTS),
        vol.Required("recipe_id"): str,
        vol.Optional("servings"): vol.All(int, vol.Range(min=1, max=30)),
        vol.Optional("note", default=""): str,
    }
)
@websocket_api.async_response
async def ws_plan_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    try:
        servings = msg.get("servings") or _servings_default(data)
        entry = data.store.add_plan(msg["date"], msg["slot"], msg["recipe_id"], servings, msg["note"])
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Recette introuvable")
        return

    result: dict[str, Any] = {"entry": entry, "added": [], "list_name": None, "shopping_error": None}
    if _options(data).get(CONF_AUTO_SHOPPING, True):
        try:
            summary = await _add_to_list(hass, data, _plan_items(data, [entry]))
            result["list_name"] = summary["list_name"]
            result["added"] = summary["added"] + summary["updated"]
            result["entry"] = data.store.update_plan(entry["id"], in_shopping_list=True)
        except HomeAssistantError as err:
            result["shopping_error"] = str(err)
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/update",
        vol.Required("entry_id"): str,
        vol.Optional("servings"): vol.All(int, vol.Range(min=1, max=30)),
        vol.Optional("date"): cv.date,
        vol.Optional("slot"): vol.In(SLOTS),
    }
)
@callback
def ws_plan_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    store = _data(hass).store
    if msg["entry_id"] not in store.plan:
        connection.send_error(msg["id"], "not_found", "Repas introuvable")
        return
    entry = store.update_plan(
        msg["entry_id"],
        servings=msg.get("servings"),
        date=msg["date"].isoformat() if msg.get("date") else None,
        slot=msg.get("slot"),
    )
    connection.send_result(msg["id"], {"entry": entry})


async def _list_items(hass: HomeAssistant, entity_id: str) -> list[dict[str, Any]]:
    try:
        response = await hass.services.async_call(
            "todo", "get_items", {"status": ["needs_action"]}, target={"entity_id": entity_id},
            blocking=True, return_response=True,
        )
    except HomeAssistantError:
        return []
    return (response or {}).get(entity_id, {}).get("items", [])


async def _meal_shopping_ops(hass: HomeAssistant, data: FrigoData, entry: dict[str, Any]) -> list[dict[str, Any]]:
    """Ce qu'il faudrait retirer de la liste si on supprime ce repas."""
    entity_id = _shopping_entity(hass, data)
    if not entry.get("in_shopping_list") or entity_id is None:
        return []
    return subtract_from_list(await _list_items(hass, entity_id), _plan_items(data, [entry]))


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/plan/shopping_impact", vol.Required("entry_id"): str}
)
@websocket_api.async_response
async def ws_plan_shopping_impact(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Articles de la liste qui viennent de ce repas (pour proposer de les retirer)."""
    data = _data(hass)
    entry = data.store.plan.get(msg["entry_id"])
    ops = await _meal_shopping_ops(hass, data, entry) if entry else []
    connection.send_result(msg["id"], {"items": [op["text"] for op in ops], "count": len(ops)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/delete",
        vol.Required("entry_id"): str,
        vol.Optional("remove_shopping", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_plan_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    entry = data.store.plan.get(msg["entry_id"])
    removed, updated = [], []
    if entry and msg["remove_shopping"]:
        entity_id = _shopping_entity(hass, data)
        for op in await _meal_shopping_ops(hass, data, entry):
            if op["op"] == "remove":
                await hass.services.async_call(
                    "todo", "remove_item", {"item": [op["uid"]]}, target={"entity_id": entity_id}, blocking=True
                )
                removed.append(op["text"])
            else:
                await hass.services.async_call(
                    "todo", "update_item", {"item": op["uid"], "rename": op["text"]},
                    target={"entity_id": entity_id}, blocking=True,
                )
                updated.append(op["text"])
    data.store.delete_plan(msg["entry_id"])
    connection.send_result(msg["id"], {"removed": removed, "updated": updated})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/move",
        vol.Required("entry_id"): str,
        vol.Required("date"): _parse_date,
        vol.Required("slot"): vol.In(SLOTS),
    }
)
@callback
def ws_plan_move(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Déplace un repas (échange avec celui du créneau visé). La liste de courses ne change pas."""
    store = _data(hass).store
    if msg["entry_id"] not in store.plan:
        connection.send_error(msg["id"], "not_found", "Repas introuvable")
        return
    connection.send_result(msg["id"], {"changed": store.move_plan(msg["entry_id"], msg["date"], msg["slot"])})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/copy",
        vol.Required("meals"): [
            {
                vol.Required("recipe_id"): str,
                vol.Required("date"): _parse_date,
                vol.Required("slot"): vol.In(SLOTS),
                vol.Optional("servings"): vol.All(int, vol.Range(min=1, max=30)),
                vol.Optional("note", default=""): str,
            }
        ],
    }
)
@websocket_api.async_response
async def ws_plan_copy(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Reprend des repas d'une autre semaine ; leurs ingrédients vont dans la liste de courses."""
    data = _data(hass)
    entries = [
        data.store.add_plan(m["date"], m["slot"], m["recipe_id"], m.get("servings") or _servings_default(data), m["note"])
        for m in msg["meals"]
        if m["recipe_id"] in data.store.recipes
    ]
    result: dict[str, Any] = {"entries": entries, "added": [], "list_name": None, "shopping_error": None}
    if entries and _options(data).get(CONF_AUTO_SHOPPING, True):
        try:
            summary = await _add_to_list(hass, data, _plan_items(data, entries))
            result["added"] = summary["added"] + summary["updated"]
            result["list_name"] = summary["list_name"]
            result["entries"] = [data.store.update_plan(e["id"], in_shopping_list=True) for e in entries]
        except HomeAssistantError as err:
            result["shopping_error"] = str(err)
    connection.send_result(msg["id"], result)


# ---------------------------------------------------------------------- courses


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/shopping/preview",
        vol.Required("start"): _parse_date,
        vol.Required("end"): _parse_date,
        vol.Optional("only_new", default=False): bool,
    }
)
@callback
def ws_shopping_preview(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    data = _data(hass)
    entries = data.store.plan_between(msg["start"], msg["end"])
    if msg["only_new"]:
        entries = [e for e in entries if not e.get("in_shopping_list")]
    entity_id = _shopping_entity(hass, data)
    state = hass.states.get(entity_id) if entity_id else None
    connection.send_result(
        msg["id"],
        {
            "items": _plan_items(data, entries),
            "entry_ids": [e["id"] for e in entries],
            "list_name": state.name if state else None,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/shopping/add",
        vol.Required("items"): [str],
        vol.Optional("entry_ids", default=[]): [str],
        vol.Optional("quick", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_shopping_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Ajoute des articles écrits librement (« 2 kg de pommes », « lait ») ou issus du menu."""
    data = _data(hass)
    texts = [t.strip() for t in msg["items"] if t.strip()]
    parsed = [shopping_item(parse_list_text(t)) for t in texts]
    parsed = [item for item in parsed if item["name"]]
    try:
        summary = await _add_to_list(hass, data, parsed)
    except HomeAssistantError as err:
        _error(connection, msg["id"], err)
        return
    for entry_id in msg["entry_ids"]:
        if entry_id in data.store.plan:
            data.store.update_plan(entry_id, in_shopping_list=True)
    if msg["quick"]:
        data.store.record_shopping([item["name"] for item in parsed])
    connection.send_result(
        msg["id"],
        {
            "added": len(summary["added"]) + len(summary["updated"]),
            "new": summary["added"],
            "updated": summary["updated"],
            "skipped": summary["skipped"],
            "list_name": summary["list_name"],
        },
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/shopping/suggestions", vol.Optional("limit", default=12): int}
)
@callback
def ws_shopping_suggestions(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Articles souvent ajoutés à la main, pour l'ajout rapide."""
    connection.send_result(msg["id"], {"suggestions": _data(hass).store.shopping_suggestions(msg["limit"])})


# ---------------------------------------------------------------------- réglages du foyer


@websocket_api.websocket_command({vol.Required("type"): "frigo_malin/settings/save", vol.Required("settings"): dict})
@callback
def ws_settings_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    settings = data.store.save_settings(msg["settings"])
    data.ai.mode = settings.get("ai_mode", "economy")
    connection.send_result(
        msg["id"],
        {"settings": settings, "default_servings": _servings_default(data), "shopping_list": _shopping_info(hass, data)},
    )


# ---------------------------------------------------------------------- photo d'une recette


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/recipes/from_photo",
        vol.Required("images"): vol.All(
            [{vol.Required("image"): str, vol.Optional("mime", default="image/jpeg"): vol.In(ALLOWED_MIME)}],
            vol.Length(min=1, max=4),
        ),
    }
)
@websocket_api.async_response
async def ws_recipes_from_photo(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Lit une recette photographiée (page de livre, fiche manuscrite…) : 1 à 4 pages."""
    try:
        images = [(_decode_image(i["image"]), i["mime"]) for i in msg["images"]]
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    try:
        recipe = await _data(hass).ai.recipe_from_photos(images)
    except AIError as err:
        _error(connection, msg["id"], err)
        return
    recipe["origin"] = "photo"
    connection.send_result(msg["id"], {"recipe": recipe})


# ---------------------------------------------------------------------- planifier la semaine

DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/generate",
        vol.Required("slots"): vol.All(
            [{vol.Required("date"): _parse_date, vol.Required("slot"): vol.In(SLOTS)}], vol.Length(min=1, max=21)
        ),
        vol.Optional("servings"): vol.All(int, vol.Range(min=1, max=30)),
        vol.Optional("budget"): vol.Any(None, vol.All(int, vol.Range(min=5, max=2000))),
        vol.Optional("use_carnet", default=True): bool,
        vol.Optional("leftovers", default=True): bool,
        vol.Optional("notes", default=""): str,
        # Repas gardés (🔒) : on ne les change pas, l'IA en tient compte.
        vol.Optional("locked", default=[]): [dict],
        # Plats à ne pas reproposer (remplacer un repas).
        vol.Optional("avoid", default=[]): [str],
    }
)
@websocket_api.async_response
async def ws_plan_generate(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Propose un menu pour les créneaux choisis. Rien n'est enregistré avant plan/apply."""
    data = _data(hass)
    settings = data.store.settings
    slots = []
    for item in sorted(msg["slots"], key=lambda x: (x["date"], SLOTS.index(x["slot"]))):
        day = item["date"]
        weekend = day.weekday() >= 5
        slots.append(
            {
                "date": day.isoformat(),
                "slot": item["slot"],
                "day": DAY_NAMES[day.weekday()],
                "slot_label": "midi" if item["slot"] == "lunch" else "soir",
                "max_time": settings["time_weekend"] if weekend else settings["time_weekday"],
            }
        )
    carnet = []
    if msg["use_carnet"]:
        recipes = sorted(data.store.recipes.values(), key=lambda r: (not r.get("favorite"), r["title"].lower()))
        carnet = [{"id": r["id"], "title": r["title"], "favorite": r.get("favorite")} for r in recipes[:80]]
    budget = msg.get("budget", settings.get("budget_week"))
    try:
        proposal = await data.ai.plan_week(
            slots,
            servings=msg.get("servings") or _servings_default(data),
            household=household_context(settings),
            budget=budget,
            carnet=carnet,
            leftovers=msg["leftovers"],
            notes=msg["notes"],
            month=MONTHS[msg["slots"][0]["date"].month - 1],
            locked=[
                {"date": str(m.get("date")), "slot": m.get("slot"), "title": str(m.get("title") or "")}
                for m in msg["locked"]
                if m.get("title")
            ],
            avoid=msg["avoid"],
        )
    except AIError as err:
        _error(connection, msg["id"], err)
        return
    for meal in proposal["meals"]:
        if meal["recipe_id"]:
            recipe = data.store.recipes[meal["recipe_id"]]
            meal["time"] = (recipe.get("prep_time") or 0) + (recipe.get("cook_time") or 0) or meal["time"]
            meal["description"] = meal["description"] or recipe.get("description", "")
    proposal["budget"] = budget
    connection.send_result(msg["id"], proposal)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/plan/apply",
        vol.Required("meals"): [dict],
        vol.Optional("servings"): vol.All(int, vol.Range(min=1, max=30)),
    }
)
@websocket_api.async_response
async def ws_plan_apply(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Enregistre le menu proposé : nouvelles recettes dans le carnet, repas au menu, courses."""
    data = _data(hass)
    servings = msg.get("servings") or _servings_default(data)
    household = household_context(data.store.settings)
    meals = [m for m in msg["meals"] if m.get("title") or m.get("recipe_id") in data.store.recipes]
    titles = {(m.get("date"), m.get("slot")): m.get("title") for m in meals}

    # Les recettes des repas gardés sont écrites maintenant, plusieurs à la fois.
    limit = asyncio.Semaphore(4)

    async def write(meal: dict[str, Any]) -> dict[str, Any] | None:
        if meal.get("recipe_id") in data.store.recipes:
            return None
        if isinstance(meal.get("recipe"), dict) and meal["recipe"].get("title"):
            return meal["recipe"]
        source = meal.get("leftovers_from") or {}
        async with limit:
            try:
                return await data.ai.write_recipe(
                    meal, servings, household, leftovers_title=titles.get((source.get("date"), source.get("slot")), "") or ""
                )
            except AIError as err:
                _LOGGER.warning("Planification : %s", err)
                return False  # type: ignore[return-value]

    written = await asyncio.gather(*(write(m) for m in meals))
    entries, failed = [], []
    for meal, recipe in zip(meals, written, strict=True):
        try:
            day = _parse_date(str(meal.get("date")))
        except vol.Invalid:
            continue
        slot = meal.get("slot") if meal.get("slot") in SLOTS else "dinner"
        if recipe is False:
            failed.append(meal.get("title"))
            continue
        recipe_id = meal.get("recipe_id")
        if recipe is not None:
            raw = {k: v for k, v in recipe.items() if k not in ("uses", "missing")}
            recipe_id = data.store.save_recipe({**raw, "origin": "ai"}, servings)["id"]
        entries.append(data.store.add_plan(day, slot, recipe_id, servings, str(meal.get("note") or "")))

    result: dict[str, Any] = {"entries": entries, "added": [], "list_name": None, "shopping_error": None, "failed": failed}
    if entries and _options(data).get(CONF_AUTO_SHOPPING, True):
        try:
            summary = await _add_to_list(hass, data, _plan_items(data, entries))
            result["added"] = summary["added"] + summary["updated"]
            result["list_name"] = summary["list_name"]
            result["entries"] = [data.store.update_plan(e["id"], in_shopping_list=True) for e in entries]
        except HomeAssistantError as err:
            result["shopping_error"] = str(err)
    connection.send_result(msg["id"], result)


# ---------------------------------------------------------------------- bibliothèque de recettes saines


async def _library(hass: HomeAssistant) -> list[dict[str, Any]]:
    key = f"{DOMAIN}_library"
    if key not in hass.data:
        hass.data[key] = await hass.async_add_executor_job(load_library)
    return hass.data[key]


@websocket_api.websocket_command({vol.Required("type"): "frigo_malin/library/list"})
@websocket_api.async_response
async def ws_library_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    recipes = await _library(hass)
    connection.send_result(msg["id"], {"recipes": recipes, "themes": THEMES, "types": TYPES})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/library/ideas",
        vol.Optional("theme", default=""): vol.Any("", vol.In(list(THEMES))),
        vol.Optional("dish_type", default=""): vol.Any("", vol.In(list(TYPES))),
        vol.Optional("count", default=4): vol.All(int, vol.Range(min=1, max=6)),
    }
)
@websocket_api.async_response
async def ws_library_ideas(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Nouvelles recettes saines générées par l'IA sur un thème, adaptées au foyer."""
    data = _data(hass)
    library = await _library(hass)
    known = [r["title"] for r in library] + [r["title"] for r in data.store.recipes.values()]
    try:
        recipes = await data.ai.theme_recipes(
            THEMES.get(msg["theme"], ""),
            TYPES.get(msg["dish_type"], ""),
            count=msg["count"],
            servings=_servings_default(data),
            household=household_context(data.store.settings),
            month=MONTHS[dt_util.now().month - 1],
            exclude=known,
        )
    except AIError as err:
        _error(connection, msg["id"], err)
        return
    for recipe in recipes:
        recipe["benefits"] = recipe.pop("tags", [])[:4]
        recipe["tags"] = [THEMES[msg["theme"]]] if msg["theme"] else []
        recipe["origin"] = "ai"
    connection.send_result(msg["id"], {"recipes": recipes})


# ---------------------------------------------------------------- minuteurs du mode cuisine


@websocket_api.websocket_command(
    {
        vol.Required("type"): "frigo_malin/timer/start",
        vol.Required("timer_id"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Required("seconds"): vol.All(int, vol.Range(min=1, max=12 * 3600)),
        vol.Optional("label", default=""): vol.All(str, vol.Length(max=120)),
        vol.Optional("recipe", default=""): vol.All(str, vol.Length(max=200)),
    }
)
@callback
def ws_timer_start(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Programme une notification sur le téléphone à la fin d'un minuteur."""
    services = async_start_timer(
        hass, connection.user.id, msg["timer_id"], msg["seconds"], msg["label"], msg["recipe"]
    )
    connection.send_result(msg["id"], {"notify": services})


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/timer/cancel", vol.Required("timer_id"): str}
)
@callback
def ws_timer_cancel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    async_cancel_timer(hass, connection.user.id, msg["timer_id"])
    connection.send_result(msg["id"], {})
