"""Frigo Malin : photo du frigo, carnet de recettes et menu de la semaine."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .ai import AIClient
from .const import (
    CONF_API_KEY,
    CONF_MODEL,
    CONF_PROVIDER,
    DOMAIN,
    PANEL_COMPONENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL,
    VERSION,
)
from .store import FrigoStore
from .websocket_api import async_register_websocket_api

FRONTEND_DIR = Path(__file__).parent / "frontend"


@dataclass
class FrigoData:
    """Objets partagés pendant que l'intégration tourne."""

    entry: ConfigEntry
    store: FrigoStore
    ai: AIClient


type FrigoConfigEntry = ConfigEntry[FrigoData]


async def async_setup_entry(hass: HomeAssistant, entry: FrigoConfigEntry) -> bool:
    store = FrigoStore(hass)
    await store.async_load()

    options = {**entry.data, **entry.options}
    ai = AIClient(
        async_get_clientsession(hass),
        entry.data[CONF_PROVIDER],
        entry.data[CONF_API_KEY],
        options.get(CONF_MODEL),
    )
    entry.runtime_data = FrigoData(entry=entry, store=store, ai=ai)
    hass.data[DOMAIN] = entry.runtime_data

    domain_flags = hass.data.setdefault(f"{DOMAIN}_flags", set())
    if "static" not in domain_flags:
        # Un chemin statique ne peut pas être retiré : on ne l'enregistre qu'une fois.
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), cache_headers=False)]
        )
        async_register_websocket_api(hass)
        domain_flags.add("static")

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL}/frigo-malin-panel.js?v={VERSION}",
        embed_iframe=False,
        require_admin=False,
        config={},
    )

    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: FrigoConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: FrigoConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    hass.data.pop(DOMAIN, None)
    return True
