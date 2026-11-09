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
            "usage": {"input_tokens": 1_000_000, "output_tokens": 100_000},
            "content": [
                {"type": "thinking", "thinking": ""},
                {"type": "text", "text": json.dumps({"ingredients": [{"name": "tomates", "amount": "4"}, {"name": "Tomates"}]})},
            ],
        },
    )
    detected = await ws("fridge/detect", image="aGVsbG8=", mime="image/jpeg")
    assert detected["success"], detected
    assert detected["result"]["ingredients"] == [{"name": "tomates", "amount": "4", "keeps_days": None}]
    # 1 M de jetons en entrée et 100 k en sortie avec Haiku : 0,15 $ ≈ 0,14 €.
    usage = (await ws("config"))["result"]["usage"]
    assert usage == {"eur": 0.14, "calls": 1}
    sent = aioclient_mock.mock_calls[-1][2]
    # Mode économique : la photo du frigo passe par le modèle léger (sans repli serveur, réservé aux grands modèles).
    assert sent["model"] == "claude-haiku-5-5"
    assert sent["messages"][0]["content"][0]["type"] == "image"
    assert "fallbacks" not in sent

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


async def test_settings_photo_and_sensor(hass: HomeAssistant, hass_ws_client, aioclient_mock) -> None:
    from datetime import timedelta

    from homeassistant.util import dt as dt_util

    await _setup(hass)
    await _clear_list(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    saved = await ws(
        "settings/save",
        settings={"members": [{"name": "A", "age": "adult"}, {"name": "B", "age": "adult"}, {"name": "C", "age": "child"}]},
    )
    assert saved["success"], saved
    assert saved["result"]["default_servings"] == 3
    config = await ws("config")
    assert len(config["result"]["settings"]["members"]) == 3
    assert config["result"]["default_servings"] == 3

    # Photo d'une page de livre -> recette (non enregistrée tant qu'on ne valide pas).
    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": json.dumps({"recipes": [{
                "title": "Tarte aux pommes de mamie", "servings": 6,
                "ingredients": [{"quantity": 4, "unit": "", "name": "pommes"}], "steps": ["Étaler la pâte", "Cuire"],
            }]})}],
        },
    )
    photo = await ws("recipes/from_photo", images=[{"image": "aGVsbG8=", "mime": "image/jpeg"}, {"image": "aGVsbG8="}])
    assert photo["success"], photo
    assert photo["result"]["recipe"]["title"] == "Tarte aux pommes de mamie"
    sent = aioclient_mock.mock_calls[-1][2]
    assert [b["type"] for b in sent["messages"][0]["content"]] == ["image", "image", "text"]

    # Capteur « prochain repas ».
    state = hass.states.get("sensor.frigo_malin_prochain_repas")
    assert state is not None and state.state == "Rien de prévu"
    recipe = (await ws("recipes/save", recipe={**photo["result"]["recipe"], "image": "https://img.example/tarte.jpg"}))["result"]["recipe"]
    tomorrow = (dt_util.now() + timedelta(days=1)).date().isoformat()
    await ws("plan/add", date=tomorrow, slot="dinner", recipe_id=recipe["id"])
    await hass.async_block_till_done()
    state = hass.states.get("sensor.frigo_malin_prochain_repas")
    assert state.state == "Tarte aux pommes de mamie"
    assert state.attributes["label"] == "Demain soir"
    assert state.attributes["servings"] == 3  # portions du foyer (2 adultes + 1 enfant)
    assert state.attributes["entity_picture"] == "https://img.example/tarte.jpg"
    assert state.attributes["url"].startswith("/frigo-malin?recipe=")


async def test_plan_week_with_leftovers(hass: HomeAssistant, hass_ws_client, aioclient_mock) -> None:
    """Planification en deux temps : le menu d'abord, les recettes seulement pour les repas gardés."""
    await _setup(hass)
    await _clear_list(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    favourite = (await ws("recipes/save", recipe={"title": "Gratin", "servings": 4, "ingredients": ["1 kg de pommes de terre"], "steps": ["Cuire"]}))["result"]["recipe"]
    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps({
            "summary": "Un menu d'automne.",
            "meals": [
                {"date": "2026-11-15", "slot": "dinner", "recipe_id": None, "title": "Poulet rôti", "time": 75,
                 "estimated_cost": 12, "key_ingredients": ["poulet"], "note": "Préparez-en le double pour lundi."},
                {"date": "2026-11-16", "slot": "dinner", "recipe_id": None, "title": "Salade de poulet", "time": 20,
                 "estimated_cost": 6, "leftovers_from": {"date": "2026-11-15", "slot": "dinner"},
                 "note": "Avec les restes du poulet rôti."},
                {"date": "2026-11-17", "slot": "dinner", "recipe_id": favourite["id"]},
                {"date": "2026-11-18", "slot": "dinner", "title": "Hors créneau"},
            ],
        })}]},
    )
    proposal = await ws(
        "plan/generate",
        slots=[{"date": "2026-11-15", "slot": "dinner"}, {"date": "2026-11-16", "slot": "dinner"}, {"date": "2026-11-17", "slot": "dinner"}],
        budget=40,
        locked=[{"date": "2026-11-14", "slot": "lunch", "title": "Quiche"}],
        avoid=["Lasagnes"],
    )
    assert proposal["success"], proposal
    meals = proposal["result"]["meals"]
    assert [m["title"] for m in meals] == ["Poulet rôti", "Salade de poulet", "Gratin"]
    assert meals[1]["leftovers_from"] == {"date": "2026-11-15", "slot": "dinner"}
    sent = aioclient_mock.mock_calls[-1][2]
    prompt = sent["messages"][0]["content"][-1]["text"]
    assert sent["model"] == "claude-opus-5-5"  # planifier : le modèle le plus puissant
    assert "novembre" in prompt and "40 €" in prompt and "Cuisine des restes" in prompt and favourite["id"] in prompt
    assert "Quiche" in prompt and "Lasagnes" in prompt and "Ne détaille PAS" in prompt

    # On retire le 2e repas avant de valider : sa recette n'est jamais écrite.
    kept = [meals[0], meals[2]]
    written = []

    async def fake_write(meal, servings, household="", leftovers_title=""):
        written.append(meal["title"])
        return {"title": meal["title"], "servings": servings, "ingredients": [{"quantity": 2, "unit": "", "name": "poulets"}], "steps": ["Rôtir"]}

    with patch("custom_components.frigo_malin.ai.AIClient.write_recipe", side_effect=fake_write):
        applied = await ws("plan/apply", meals=kept, servings=4)
    assert applied["success"], applied
    assert written == ["Poulet rôti"]  # le Gratin vient du carnet
    assert len(applied["result"]["entries"]) == 2
    assert applied["result"]["entries"][0]["note"] == "Préparez-en le double pour lundi."
    assert sorted(await _todo_items(hass)) == ["Pommes de terre (1 kg)", "Poulets (2)"]
    recipes = (await ws("recipes/list"))["result"]["recipes"]
    assert {r["title"] for r in recipes} == {"Gratin", "Poulet rôti"}


async def test_store_reminder(hass: HomeAssistant, hass_ws_client) -> None:
    from homeassistant.helpers import device_registry as dr, entity_registry as er
    from pytest_homeassistant_custom_component.common import async_mock_service

    await _setup(hass)
    await _clear_list(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    # Un téléphone (app HA) rattaché à une personne, une zone « Leclerc ».
    phone_entry = MockConfigEntry(domain="mobile_app")
    phone_entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=phone_entry.entry_id, identifiers={("mobile_app", "pixel")}, name="Pixel 7"
    )
    er.async_get(hass).async_get_or_create(
        "device_tracker", "mobile_app", "pixel", device_id=device.id, suggested_object_id="pixel_7"
    )
    calls = async_mock_service(hass, "notify", "mobile_app_pixel_7")
    hass.states.async_set("zone.leclerc", "0", {"friendly_name": "Leclerc"})
    hass.states.async_set("person.adrien", "not_home", {"device_trackers": ["device_tracker.pixel_7"]})

    settings = (await ws("settings/save", settings={"stores": [{"name": "Leclerc Saint-Jean", "zone": "zone.leclerc"}]}))["result"]["settings"]
    store_id = settings["stores"][0]["id"]

    # Liste vide : pas de rappel.
    hass.states.async_set("person.adrien", "Leclerc", {"device_trackers": ["device_tracker.pixel_7"]})
    await hass.async_block_till_done()
    assert calls == []

    await ws("shopping/add", items=["lait", "pain"])
    hass.states.async_set("person.adrien", "not_home", {"device_trackers": ["device_tracker.pixel_7"]})
    # On neutralise le délai entre deux rappels pour simuler une nouvelle visite.
    from custom_components.frigo_malin import reminder as reminder_module

    with patch.object(reminder_module, "COOLDOWN", reminder_module.timedelta(0)):
        hass.states.async_set("person.adrien", "Leclerc", {"device_trackers": ["device_tracker.pixel_7"]})
        await hass.async_block_till_done()
    assert len(calls) == 1
    data = calls[0].data
    assert data["title"] == "🛒 2 articles à acheter chez Leclerc Saint-Jean"
    assert data["message"] == "Lait, Pain"
    assert data["data"]["clickAction"] == f"/frigo-malin?tab=shopping&store={store_id}"


async def test_library_and_ideas(hass: HomeAssistant, hass_ws_client, aioclient_mock) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    library = await ws("library/list")
    assert library["success"], library
    recipes = library["result"]["recipes"]
    assert len(recipes) >= 40
    soup = next(r for r in recipes if r["library_id"] == "soupe-lentilles-corail-curcuma")

    # Ajouter une recette de la bibliothèque au carnet : nouvel identifiant, lien et bienfaits conservés.
    saved = await ws("recipes/save", recipe={k: v for k, v in soup.items() if k not in ("themes", "allergens", "months")})
    assert saved["success"], saved
    recipe = saved["result"]["recipe"]
    assert recipe["id"] != soup["id"] and not recipe["id"].startswith("lib-")
    assert recipe["library_id"] == "soupe-lentilles-corail-curcuma"
    assert recipe["benefits"] == soup["benefits"]

    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps({"recipes": [{
            "title": "Bowl sarrasin et saumon", "servings": 2, "tags": ["Oméga-3", "Fibres"],
            "ingredients": [{"quantity": 150, "unit": "g", "name": "sarrasin"}], "steps": ["Cuire", "Servir"],
        }]})}]},
    )
    ideas = await ws("library/ideas", theme="anti_inflammatory", dish_type="main", count=2)
    assert ideas["success"], ideas
    idea = ideas["result"]["recipes"][0]
    assert idea["benefits"] == ["Oméga-3", "Fibres"]
    assert idea["tags"] == ["Anti-inflammatoire"]
    prompt = aioclient_mock.mock_calls[-1][2]["messages"][0]["content"][-1]["text"]
    assert "anti-inflammatoire" in prompt and "plat" in prompt and "Soupe de lentilles corail" in prompt


async def test_builtin_list_and_default_servings(hass: HomeAssistant, hass_ws_client) -> None:
    """Sans l'intégration « Liste de courses » de HA : Frigo Malin utilise sa propre liste."""
    entry = MockConfigEntry(domain=DOMAIN, data=ENTRY_DATA)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("todo.shopping_list") is None
    assert hass.states.get("todo.frigo_malin_courses") is not None

    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    config = (await ws("config"))["result"]
    assert config["shopping_list"] == {"entity_id": "todo.frigo_malin_courses", "name": "Frigo Malin courses", "builtin": True}

    # Portions par défaut choisies à la main : 2.
    saved = await ws("settings/save", settings={"servings": 2})
    assert saved["result"]["default_servings"] == 2

    recipe = (await ws("recipes/save", recipe={"title": "Gratin", "servings": 4, "ingredients": ["1 kg de pommes de terre"], "steps": ["Cuire"]}))["result"]["recipe"]
    added = await ws("plan/add", date="2026-11-12", slot="dinner", recipe_id=recipe["id"])
    assert added["success"], added
    assert added["result"]["shopping_error"] is None
    assert added["result"]["entry"]["servings"] == 2  # sans portions précisées : celles du foyer
    assert added["result"]["list_name"] == "Frigo Malin courses"

    added2 = await ws("plan/add", date="2026-11-13", slot="dinner", recipe_id=recipe["id"], servings=2)
    assert added2["result"]["entry"]["servings"] == 2

    result = await hass.services.async_call(
        "todo", "get_items", target={"entity_id": "todo.frigo_malin_courses"}, blocking=True, return_response=True
    )
    items = result["todo.frigo_malin_courses"]["items"]
    assert [i["summary"] for i in items] == ["Pommes de terre (1 kg)"]
    assert items[0]["description"] == "Pour : Gratin"

    # Cocher, puis vider le panier, via les services standard de HA.
    await hass.services.async_call(
        "todo", "update_item", {"item": items[0]["uid"], "status": "completed"},
        target={"entity_id": "todo.frigo_malin_courses"}, blocking=True,
    )
    assert hass.states.get("todo.frigo_malin_courses").state == "0"
    await hass.services.async_call(
        "todo", "remove_completed_items", target={"entity_id": "todo.frigo_malin_courses"}, blocking=True
    )
    assert entry.runtime_data.store.shopping_items == []

    # Une liste choisie dans l'app a la priorité.
    hass.states.async_set("todo.courses_famille", "0", {"friendly_name": "Courses famille"})
    saved = await ws("settings/save", settings={"servings": 2, "shopping_entity": "todo.courses_famille"})
    assert saved["result"]["shopping_list"]["entity_id"] == "todo.courses_famille"


async def test_cook_timer_notifies_phone(hass: HomeAssistant, hass_ws_client, hass_admin_user) -> None:
    """Un minuteur du mode cuisine prévient le téléphone de la personne, même app fermée."""
    from datetime import timedelta

    from homeassistant.helpers import device_registry as dr, entity_registry as er
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import async_fire_time_changed, async_mock_service

    await _setup(hass)
    phone_entry = MockConfigEntry(domain="mobile_app")
    phone_entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=phone_entry.entry_id, identifiers={("mobile_app", "iphone")}, name="iPhone d'Adri"
    )
    er.async_get(hass).async_get_or_create(
        "device_tracker", "mobile_app", "iphone", device_id=device.id, suggested_object_id="iphone"
    )
    calls = async_mock_service(hass, "notify", "mobile_app_iphone_d_adri")
    client = await hass_ws_client(hass)
    hass.states.async_set(
        "person.adri", "home", {"user_id": hass_admin_user.id, "device_trackers": ["device_tracker.iphone"]}
    )

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    started = await ws("timer/start", timer_id="t1", seconds=60, label="Étape 2 · 1 min", recipe="Gratin")
    assert started["success"], started
    assert started["result"]["notify"] == ["mobile_app_iphone_d_adri"]

    # Un minuteur annulé ne sonne pas.
    await ws("timer/start", timer_id="t2", seconds=30, label="Annulé")
    await ws("timer/cancel", timer_id="t2")

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=61))
    await hass.async_block_till_done()
    assert len(calls) == 1
    assert calls[0].data["title"] == "⏰ C'est prêt !"
    assert calls[0].data["message"] == "Gratin · Étape 2 · 1 min"
    assert calls[0].data["data"]["url"] == "/frigo-malin?resume=cook"
    assert calls[0].data["data"]["push"]["interruption-level"] == "time-sensitive"


async def test_remove_meal_and_its_shopping(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    await _clear_list(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    gratin = (await ws("recipes/save", recipe={"title": "Gratin", "servings": 4, "ingredients": ["1 kg de pommes de terre", "50 cl de crème"], "steps": ["Cuire"]}))["result"]["recipe"]
    soupe = (await ws("recipes/save", recipe={"title": "Soupe", "servings": 4, "ingredients": ["500 g de pommes de terre", "2 poireaux"], "steps": ["Cuire"]}))["result"]["recipe"]
    first = (await ws("plan/add", date="2026-11-12", slot="dinner", recipe_id=gratin["id"], servings=4))["result"]["entry"]
    await ws("plan/add", date="2026-11-13", slot="dinner", recipe_id=soupe["id"], servings=4)
    assert sorted(await _todo_items(hass)) == ["Crème (50 cl)", "Poireaux (2)", "Pommes de terre (1,5 kg)"]

    impact = await ws("plan/shopping_impact", entry_id=first["id"])
    assert impact["result"]["count"] == 2

    deleted = await ws("plan/delete", entry_id=first["id"], remove_shopping=True)
    assert deleted["success"], deleted
    assert deleted["result"]["removed"] == ["Crème (50 cl)"]
    assert deleted["result"]["updated"] == ["Pommes de terre (500 g)"]
    assert sorted(await _todo_items(hass)) == ["Poireaux (2)", "Pommes de terre (500 g)"]


async def test_move_and_copy_meals(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    await _clear_list(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    a = (await ws("recipes/save", recipe={"title": "Gratin", "servings": 4, "ingredients": ["1 kg de pommes de terre"], "steps": ["Cuire"]}))["result"]["recipe"]
    b = (await ws("recipes/save", recipe={"title": "Soupe", "servings": 4, "ingredients": ["2 poireaux"], "steps": ["Cuire"]}))["result"]["recipe"]
    ea = (await ws("plan/add", date="2026-11-09", slot="dinner", recipe_id=a["id"], servings=4))["result"]["entry"]
    eb = (await ws("plan/add", date="2026-11-10", slot="dinner", recipe_id=b["id"], servings=4))["result"]["entry"]
    items_before = sorted(await _todo_items(hass))

    # Déplacer le gratin sur le soir de la soupe : les deux s'échangent, la liste ne bouge pas.
    moved = await ws("plan/move", entry_id=ea["id"], date="2026-11-10", slot="dinner")
    assert moved["success"], moved
    plan = {e["recipe_id"]: (e["date"], e["slot"]) for e in (await ws("plan/list", start="2026-11-09", end="2026-11-15"))["result"]["entries"]}
    assert plan == {a["id"]: ("2026-11-10", "dinner"), b["id"]: ("2026-11-09", "dinner")}
    assert sorted(await _todo_items(hass)) == items_before

    # Vers un créneau libre : simple déplacement.
    await ws("plan/move", entry_id=eb["id"], date="2026-11-11", slot="lunch")
    plan = {e["recipe_id"]: (e["date"], e["slot"]) for e in (await ws("plan/list", start="2026-11-09", end="2026-11-15"))["result"]["entries"]}
    assert plan[b["id"]] == ("2026-11-11", "lunch")

    # Reprendre deux repas la semaine suivante : les courses suivent.
    await _clear_list(hass)
    copied = await ws(
        "plan/copy",
        meals=[
            {"recipe_id": a["id"], "date": "2026-11-17", "slot": "dinner", "servings": 2},
            {"recipe_id": b["id"], "date": "2026-11-18", "slot": "lunch", "servings": 4},
        ],
    )
    assert copied["success"], copied
    assert len(copied["result"]["entries"]) == 2
    assert sorted(await _todo_items(hass)) == ["Poireaux (2)", "Pommes de terre (500 g)"]


async def test_fridge_memory(hass: HomeAssistant, hass_ws_client, aioclient_mock) -> None:
    from datetime import timedelta

    from homeassistant.util import dt as dt_util

    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    # La photo renvoie une durée de conservation estimée par l'IA.
    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps({"ingredients": [
            {"name": "salade", "amount": "1", "keeps_days": 2}, {"name": "yaourts", "amount": "4", "keeps_days": 10},
            {"name": "pâtes", "amount": "", "keeps_days": None}]})}]},
    )
    detected = (await ws("fridge/detect", image="aGVsbG8="))["result"]["ingredients"]
    assert detected[0]["keeps_days"] == 2

    saved = (await ws("fridge/memory/save", items=detected, mode="replace"))["result"]
    today = dt_util.now().date()
    assert [i["name"] for i in saved["items"]] == ["salade", "yaourts", "pâtes"]  # le plus urgent d'abord
    assert saved["items"][0]["expires"] == (today + timedelta(days=2)).isoformat()
    assert saved["items"][2]["expires"] is None

    # Compléter : un aliment déjà connu est mis à jour, les autres restent.
    merged = (await ws("fridge/memory/save", items=[{"name": "Salade", "keeps_days": 3}, {"name": "beurre"}], mode="merge"))["result"]
    assert sorted(i["name"] for i in merged["items"]) == ["Salade", "beurre", "pâtes", "yaourts"]
    # Remplacer : seule la nouvelle photo compte.
    replaced = (await ws("fridge/memory/save", items=[{"name": "lait"}], mode="replace"))["result"]
    assert [i["name"] for i in replaced["items"]] == ["lait"]

    # Après avoir cuisiné, les ingrédients utilisés sortent du frigo.
    await ws("fridge/memory/save", items=[{"name": "tomates"}, {"name": "crème fraîche"}, {"name": "lait"}], mode="replace")
    consumed = (await ws("fridge/memory/consume", names=["Tomates", "crème fraîche épaisse", "farine"]))["result"]
    assert sorted(consumed["removed"]) == ["crème fraîche", "tomates"]
    assert [i["name"] for i in consumed["items"]] == ["lait"]

    # Mémoire trop ancienne (réglage : 5 jours) : oubliée.
    entry.runtime_data.store.fridge["updated"] = (dt_util.utcnow() - timedelta(days=6)).isoformat()
    assert (await ws("fridge/memory"))["result"]["items"] == []
    # « Jusqu'à la prochaine photo » : jamais oubliée.
    await ws("settings/save", settings={"fridge_days": 0})
    assert [i["name"] for i in (await ws("fridge/memory"))["result"]["items"]] == ["lait"]
    await ws("fridge/memory/clear")
    assert (await ws("fridge/memory"))["result"]["items"] == []

    # Les idées utilisent d'abord ce qui va se perdre.
    aioclient_mock.clear_requests()
    aioclient_mock.post(
        "https://api.anthropic.com/v1/messages",
        json={"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps({"recipes": []})}]},
    )
    await ws("fridge/suggest", ingredients=["salade", "yaourts"], priority=["salade"])
    prompt = aioclient_mock.mock_calls[-1][2]["messages"][0]["content"][-1]["text"]
    assert "EN PRIORITÉ" in prompt and "salade" in prompt


async def test_nutrition_is_attached_and_completed(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass)

    async def ws(msg_type: str, **payload):
        await client.send_json_auto_id({"type": f"frigo_malin/{msg_type}", **payload})
        return await client.receive_json()

    saved = (await ws("recipes/save", recipe={"title": "Bowl", "servings": 2, "ingredients": ["200 g de riz", "2 bok choy"], "steps": ["Cuire"]}))["result"]["recipe"]
    assert saved["nutrition"]["kcal"] == 350
    assert saved["nutrition"]["unknown"] == ["bok choy"]

    estimate = AsyncMock(return_value={"bok choy": {"name": "bok choy", "kcal": 13, "protein": 1.5, "carbs": 2, "fat": 0.2, "fiber": 1, "piece_g": 300}})
    with patch("custom_components.frigo_malin.ai.AIClient.estimate_foods", estimate):
        res = await ws("nutrition/complete", names=["bok choy"], ingredients=saved["ingredients"], servings=2)
        assert res["success"], res
        assert res["result"]["added"] == 1
        assert res["result"]["nutrition"]["unknown"] == []
        # Déjà connu : l'IA n'est pas rappelée.
        await ws("nutrition/complete", names=["bok choy"])
    assert estimate.await_count == 1

    listed = (await ws("recipes/list"))["result"]["recipes"]
    bowl = next(r for r in listed if r["title"] == "Bowl")
    assert bowl["nutrition"]["kcal"] == 350 + 39 and bowl["nutrition"]["ai"]
    library = (await ws("library/list"))["result"]["recipes"]
    assert all("nutrition" in r for r in library)
