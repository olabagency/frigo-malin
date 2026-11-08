"""Frigo Malin : photo du frigo, carnet de recettes et menu de la semaine."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom, persistent_notification
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .ai import AIClient
from .const import (
    CHANGELOG_URL,
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
from .reminder import StoreReminder
from .store import FrigoStore
from .websocket_api import _shopping_entity, async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"
UPDATE_NOTIFICATION_ID = f"{DOMAIN}_update"
PLATFORMS = [Platform.SENSOR, Platform.TODO]
CARD_URL = f"{STATIC_URL}/frigo-malin-card.js?v={VERSION}"


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

    # Carte de tableau de bord « Ce soir on mange… », proposée dans le sélecteur de cartes.
    frontend.add_extra_js_url(hass, CARD_URL)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    reminder = StoreReminder(hass, entry.runtime_data, lambda: _shopping_entity(hass, entry.runtime_data))
    entry.async_on_unload(reminder.async_start())

    _announce_update(hass, store)

    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


def _announce_update(hass: HomeAssistant, store: FrigoStore) -> None:
    """Prévient dans HA quand une nouvelle version vient d'être installée."""
    previous = store.last_version
    if previous == VERSION:
        return
    if previous is not None:
        _LOGGER.info("Frigo Malin mis à jour de %s vers %s", previous, VERSION)
        persistent_notification.async_create(
            hass,
            f"Frigo Malin est passé de la version {previous} à la version **{VERSION}**.\n\n"
            f"[Voir les nouveautés]({CHANGELOG_URL})\n\n"
            "Si l'écran de Frigo Malin semble inchangé sur votre téléphone, fermez puis rouvrez l'app.",
            title="Frigo Malin mis à jour",
            notification_id=UPDATE_NOTIFICATION_ID,
        )
    store.set_last_version(VERSION)


async def async_migrate_entry(hass: HomeAssistant, entry: FrigoConfigEntry) -> bool:
    """Adapte la configuration créée par une ancienne version.

    Pour une future évolution des réglages : augmenter VERSION ou MINOR_VERSION
    dans config_flow.py et ajouter ici l'étape correspondante.
    """
    if entry.version > 1:
        # Configuration créée par une version plus récente : on ne sait pas la lire.
        return False
    return True


async def _async_reload(hass: HomeAssistant, entry: FrigoConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: FrigoConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    frontend.remove_extra_js_url(hass, CARD_URL)
    hass.data.pop(DOMAIN, None)
    return True
