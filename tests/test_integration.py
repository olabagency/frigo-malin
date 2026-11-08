"""Tests de bout en bout : configuration, panneau, carnet, menu et liste de courses."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.frigo_malin.ai import InvalidAuth
from custom_components.frigo_malin.const import DOMAIN

from .test_parsing import MARMITON_LIKE

ENTRY_DATA = {"provider": "anthropic", "api_key": "sk-test", "model": "claude-opus-5-5"}


async def test_config_flow(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"provider": "openai"})
    assert result["step_id"] == "credentials"

    with patch("custom_components.frigo_malin.config_flow.AIClient.validate", AsyncMock(side_effect=InvalidAuth)):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {"api_key": "bad"})
    assert result["errors"] == {"base": "invalid_auth"}

    with (
        patch("custom_components.frigo_malin.config_flow.AIClient.validate", AsyncMock()),
        patch("custom_components.frigo_malin.async_setup_entry", AsyncMock(return_value=True)),
    ):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {"api_key": "sk-ok", "model": ""})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"provider": "openai", "api_key": "sk-ok", "model": "gpt-5-mini"}


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    shopping = MockConfigEntry(domain="shopping_list")
    shopping.add_to_hass(hass)
    assert await hass.config_entries.async_setup(shopping.entry_id)

    entry = MockConfigEntry(domain=DOMAIN, data=ENTRY_DATA)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _clear_list(hass: HomeAssistant) -> None:
    """La liste de courses de HA est enregistrée sur disque : on repart d'une liste vide."""
    result = await hass.services.async_call(
        "todo", "get_items", target={"entity_id": "todo.shopping_list"}, blocking=True, return_response=True
    )
    uids = [item["uid"] for item in result["todo.shopping_list"]["items"]]
    if uids:
        await hass.services.async_call(
            "todo", "remove_item", {"item": uids}, target={"entity_id": "todo.shopping_list"}, blocking=True
        )


async def _todo_items(hass: HomeAssistant) -> list[str]:
    result = await hass.services.async_call(
        "todo", "get_items", target={"entity_id": "todo.shopping_list"}, blocking=True, return_response=True
    )
    return [item["summary"] for item in result["todo.shopping_list"]["items"]]


async def test_panel_recipes_plan_and_shopping(hass: HomeAssistant, hass_ws_client) -> None:
    entry = await _setup(hass)
    assert "frigo-malin" in hass.data["frontend_panels"]
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    config = await ws("config")
    assert config["success"]
    assert config["result"]["shopping_list"]["entity_id"] == "todo.shopping_list"

    saved = await ws(
        "recipes/save",
        recipe={
            "title": "Gratin",
            "servings": 4,
            "ingredients": ["1 kg de pommes de terre", "50 cl de crème", "sel"],
            "steps": "Couper\nEnfourner",
        },
    )
    assert saved["success"], saved
    recipe = saved["result"]["recipe"]
    assert recipe["ingredients"][0] == {"quantity": 1.0, "unit": "kg", "name": "pommes de terre"}
    assert recipe["steps"] == ["Couper", "Enfourner"]

    patched = await ws("recipes/patch", recipe_id=recipe["id"], favorite=True, notes="Top")
    assert patched["result"]["recipe"]["favorite"] is True

    await _clear_list(hass)

    # Planifier pour 2 personnes : les quantités sont divisées par deux, le sel est ignoré.
    added = await ws("plan/add", date="2026-11-09", slot="dinner", recipe_id=recipe["id"], servings=2)
    assert added["success"], added
    assert added["result"]["added"] == ["Crème (25 cl)", "Pommes de terre (500 g)"]
    assert added["result"]["entry"]["in_shopping_list"] is True
    assert sorted(await _todo_items(hass)) == ["Crème (25 cl)", "Pommes de terre (500 g)"]

    listed = await ws("plan/list", start="2026-11-09", end="2026-11-15")
    assert len(listed["result"]["entries"]) == 1

    preview = await ws("shopping/preview", start="2026-11-09", end="2026-11-15", only_new=True)
    assert preview["result"]["items"] == []
    preview = await ws("shopping/preview", start="2026-11-09", end="2026-11-15")
    assert [i["text"] for i in preview["result"]["items"]] == ["Crème (25 cl)", "Pommes de terre (500 g)"]

    shop = await ws("shopping/add", items=["Beurre"], entry_ids=[])
    assert shop["result"]["added"] == 1

    # Replanifier la même recette : les quantités s'additionnent au lieu de créer des doublons.
    await ws("plan/add", date="2026-11-10", slot="lunch", recipe_id=recipe["id"], servings=2)
    assert sorted(await _todo_items(hass)) == ["Beurre", "Crème (50 cl)", "Pommes de terre (1 kg)"]

    deleted = await ws("recipes/delete", recipe_id=recipe["id"])
    assert deleted["success"]
    listed = await ws("plan/list", start="2026-11-09", end="2026-11-15")
    assert listed["result"]["entries"] == []

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert "frigo-malin" not in hass.data["frontend_panels"]


async def test_fridge_and_import(hass: HomeAssistant, hass_ws_client, aioclient_mock) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={
            "stop_reason": "end_turn",
            "content": [
                {"type": "thinking", "thinking": ""},
                {"type": "text", "text": json.dumps({"ingredients": [{"name": "tomates", "amount": "4"}, {"name": "Tomates"}]})},
            ],
        },
    )
    detected = await ws("fridge/detect", image="aGVsbG8=", mime="image/jpeg")
    assert detected["success"], detected
    assert detected["result"]["ingredients"] == [{"name": "tomates", "amount": "4"}]
    sent = aioclient_mock.mock_calls[-1][2]
    assert sent["model"] == "claude-opus-5-5"
    assert sent["messages"][0]["content"][0]["type"] == "image"
    assert sent["fallbacks"] == "default"

    aioclient_mock.clear_requests()
    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={
            "stop_reason": "end_turn",
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "recipes": [
                                {
                                    "title": "Salade de tomates",
                                    "servings": 2,
                                    "ingredients": [{"quantity": 4, "unit": "", "name": "tomates"}],
                                    "steps": ["Couper", "Assaisonner"],
                                    "uses": ["tomates"],
                                    "missing": [],
                                }
                            ]
                        }
                    ),
                }
            ],
        },
    )
    suggested = await ws("fridge/suggest", ingredients=["tomates"], style="creative", count=1)
    assert suggested["success"], suggested
    assert suggested["result"]["recipes"][0]["title"] == "Salade de tomates"

    aioclient_mock.clear_requests()
    aioclient_mock.post("https://api.anthropic.com/v1/messages", status=401, json={})
    refused = await ws("fridge/suggest", ingredients=["tomates"])
    assert not refused["success"]
    assert "Clé API" in refused["error"]["message"]

    aioclient_mock.get("https://www.marmiton.org/recettes/quiche", text=MARMITON_LIKE)
    imported = await ws("recipes/import", url="https://www.marmiton.org/recettes/quiche")
    assert imported["success"], imported
    assert imported["result"]["recipe"]["title"] == "Quiche lorraine"

    bad = await ws("recipes/import", url="ftp://exemple")
    assert not bad["success"]


async def test_update_is_announced(hass: HomeAssistant, hass_storage) -> None:
    """Après une mise à jour, une notification HA annonce la nouvelle version, une seule fois."""
    from custom_components.frigo_malin.const import STORAGE_KEY, VERSION

    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": {"last_version": "0.9.0", "recipes": [{"id": "r1", "title": "Ancienne", "ingredients": [], "steps": []}], "plan": []},
    }
    entry = await _setup(hass)
    notifications = hass.data["persistent_notification"]
    assert "frigo_malin_update" in notifications
    assert VERSION in notifications["frigo_malin_update"]["message"]
    assert entry.runtime_data.store.recipes["r1"]["title"] == "Ancienne"

    await hass.async_block_till_done()
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.runtime_data.store.last_version == VERSION


async def test_first_install_is_silent(hass: HomeAssistant) -> None:
    await _setup(hass)
    assert "frigo_malin_update" not in hass.data.get("persistent_notification", {})


async def test_quick_add_merges_and_suggests(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    await _clear_list(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    first = await ws("shopping/add", items=["lait", "2 kg de pommes", "œufs"], quick=True)
    assert first["success"], first
    assert first["result"]["new"] == ["Lait", "Pommes (2 kg)", "Œufs"]

    second = await ws("shopping/add", items=["Lait", "pommes (500 g)", "pain"], quick=True)
    assert second["result"]["new"] == ["Pain"]
    assert second["result"]["updated"] == ["Pommes (2,5 kg)"]
    assert second["result"]["skipped"] == ["Lait"]
    assert sorted(await _todo_items(hass)) == ["Lait", "Pain", "Pommes (2,5 kg)", "Œufs"]

    suggestions = await ws("shopping/suggestions")
    names = [s["name"] for s in suggestions["result"]["suggestions"]]
    assert names[:2] == ["Lait", "Pommes"]
    assert set(names) == {"Lait", "Pommes", "Œufs", "Pain"}


async def test_storage_migration_from_1_0(hass: HomeAssistant, hass_storage) -> None:
    """Les données de la 1.0.x (format 1.1) sont converties : l'historique des courses est ajouté."""
    from custom_components.frigo_malin.const import STORAGE_KEY

    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": {"last_version": "1.0.2", "recipes": [], "plan": []},
    }
    entry = await _setup(hass)
    assert entry.runtime_data.store.shopping_history == {}
