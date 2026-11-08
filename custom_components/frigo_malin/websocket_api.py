"""Commandes websocket utilisées par l'interface du panneau."""

from __future__ import annotations

import base64
import binascii
from datetime import date
from typing import TYPE_CHECKING, Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

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
from .importer import RecipeImportError, async_import_recipe
from .parsing import aggregate_shopping, parse_excluded

if TYPE_CHECKING:
    from . import FrigoData

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
    return int(_options(data).get(CONF_DEFAULT_SERVINGS) or DEFAULT_SERVINGS)


def _shopping_entity(hass: HomeAssistant, data: FrigoData) -> str | None:
    entity_id = _options(data).get(CONF_SHOPPING_ENTITY) or DEFAULT_SHOPPING_ENTITY
    return entity_id if hass.states.get(entity_id) else None


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


async def _add_to_list(hass: HomeAssistant, data: FrigoData, texts: list[str]) -> str:
    entity_id = _shopping_entity(hass, data)
    if entity_id is None:
        raise HomeAssistantError(
            "Aucune liste de courses trouvée. Ajoutez l'intégration « Liste de courses » "
            "ou choisissez une liste dans les options de Frigo Malin."
        )
    for text in texts:
        await hass.services.async_call(
            "todo", "add_item", {"item": text}, target={"entity_id": entity_id}, blocking=True
        )
    state = hass.states.get(entity_id)
    return state.name if state else entity_id


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
        ws_shopping_preview,
        ws_shopping_add,
    ):
        websocket_api.async_register_command(hass, command)


# ---------------------------------------------------------------------- réglages


@websocket_api.websocket_command({vol.Required("type"): "frigo_malin/config"})
@callback
def ws_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    options = _options(data)
    entity_id = _shopping_entity(hass, data)
    state = hass.states.get(entity_id) if entity_id else None
    connection.send_result(
        msg["id"],
        {
            "version": VERSION,
            "provider": options[CONF_PROVIDER],
            "model": options.get(CONF_MODEL) or DEFAULT_MODELS[options[CONF_PROVIDER]],
            "default_servings": _servings_default(data),
            "auto_shopping": bool(options.get(CONF_AUTO_SHOPPING, True)),
            "shopping_list": {"entity_id": entity_id, "name": state.name if state else None},
            "drives": [{"key": key, "name": cls.name} for key, cls in CONNECTORS.items()],
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
    }
)
@websocket_api.async_response
async def ws_plan_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    try:
        entry = data.store.add_plan(msg["date"], msg["slot"], msg["recipe_id"], msg.get("servings"))
    except KeyError:
        connection.send_error(msg["id"], "not_found", "Recette introuvable")
        return

    result: dict[str, Any] = {"entry": entry, "added": [], "list_name": None, "shopping_error": None}
    if _options(data).get(CONF_AUTO_SHOPPING, True):
        texts = [item["text"] for item in _plan_items(data, [entry])]
        try:
            result["list_name"] = await _add_to_list(hass, data, texts)
            result["added"] = texts
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


@websocket_api.websocket_command(
    {vol.Required("type"): "frigo_malin/plan/delete", vol.Required("entry_id"): str}
)
@callback
def ws_plan_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    _data(hass).store.delete_plan(msg["entry_id"])
    connection.send_result(msg["id"], {})


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
    }
)
@websocket_api.async_response
async def ws_shopping_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    data = _data(hass)
    texts = [t.strip() for t in msg["items"] if t.strip()]
    try:
        list_name = await _add_to_list(hass, data, texts)
    except HomeAssistantError as err:
        _error(connection, msg["id"], err)
        return
    for entry_id in msg["entry_ids"]:
        if entry_id in data.store.plan:
            data.store.update_plan(entry_id, in_shopping_list=True)
    connection.send_result(msg["id"], {"added": len(texts), "list_name": list_name})
