"""Rappel « liste de courses » quand quelqu'un arrive dans un magasin.

Un magasin des réglages peut être relié à une zone de Home Assistant. Quand une
personne entre dans cette zone et que la liste n'est pas vide, son téléphone
(application Home Assistant) reçoit une notification qui ouvre la liste, rangée
dans l'ordre des rayons de ce magasin.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util, slugify

from .const import PANEL_URL_PATH

if TYPE_CHECKING:
    from . import FrigoData

_LOGGER = logging.getLogger(__name__)

# Pas plus d'un rappel par personne et par magasin dans ce délai.
COOLDOWN = timedelta(minutes=45)


def notify_services_for_person(hass: HomeAssistant, person_id: str) -> list[str]:
    """Services notify.mobile_app_* des téléphones rattachés à une personne."""
    state = hass.states.get(person_id)
    if state is None:
        return []
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    services: list[str] = []
    for tracker in state.attributes.get("device_trackers") or []:
        entry = ent_reg.async_get(tracker)
        if entry is None or entry.platform != "mobile_app" or entry.device_id is None:
            continue
        device = dev_reg.async_get(entry.device_id)
        if device is None:
            continue
        for name in (device.name_by_user, device.name):
            if not name:
                continue
            service = f"mobile_app_{slugify(name)}"
            if hass.services.has_service("notify", service) and service not in services:
                services.append(service)
                break
    return services


@callback
def _is_person(event_data: EventStateChangedData) -> bool:
    return event_data["entity_id"].startswith("person.")


class StoreReminder:
    """Surveille les personnes et prévient à l'arrivée dans un magasin."""

    def __init__(
        self,
        hass: HomeAssistant,
        data: FrigoData,
        shopping_entity: Callable[[], str | None],
    ) -> None:
        self.hass = hass
        self.data = data
        self._shopping_entity = shopping_entity
        self._last: dict[tuple[str, str], Any] = {}
        self._unsub: Callable[[], None] | None = None

    @callback
    def async_start(self) -> Callable[[], None]:
        # On écoute toutes les personnes, y compris celles créées après le démarrage.
        self._unsub = self.hass.bus.async_listen(
            EVENT_STATE_CHANGED, self._handle, event_filter=_is_person
        )
        return self.async_stop

    @callback
    def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    def _store_for_zone_name(self, zone_name: str) -> dict[str, Any] | None:
        for store in self.data.store.settings.get("stores", []):
            zone_id = store.get("zone")
            zone = self.hass.states.get(zone_id) if zone_id else None
            if zone is not None and zone.name == zone_name:
                return store
        return None

    @callback
    def _handle(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None or old is None or old.state == new.state:
            return
        if not self.data.store.settings.get("store_reminder", True):
            return
        store = self._store_for_zone_name(new.state)
        if store is None:
            return
        key = (new.entity_id, store["id"])
        now = dt_util.utcnow()
        if key in self._last and now - self._last[key] < COOLDOWN:
            return
        self._last[key] = now
        self.hass.async_create_task(self._async_notify(new.entity_id, store))

    async def _async_notify(self, person_id: str, store: dict[str, Any]) -> None:
        entity_id = self._shopping_entity()
        if entity_id is None:
            return
        try:
            response = await self.hass.services.async_call(
                "todo",
                "get_items",
                {"status": ["needs_action"]},
                target={"entity_id": entity_id},
                blocking=True,
                return_response=True,
            )
        except HomeAssistantError:
            return
        items = (response or {}).get(entity_id, {}).get("items", [])
        if not items:
            return
        services = notify_services_for_person(self.hass, person_id)
        if not services:
            _LOGGER.info(
                "Rappel magasin : aucun téléphone avec l'app Home Assistant trouvé pour %s", person_id
            )
            return
        names = [item["summary"] for item in items[:4]]
        more = len(items) - len(names)
        preview = ", ".join(names) + (f" et {more} autre{'s' if more > 1 else ''}" if more > 0 else "")
        list_state = self.hass.states.get(entity_id)
        url = f"/{PANEL_URL_PATH}?tab=shopping&store={store['id']}"
        payload = {
            "title": f"🛒 {len(items)} article{'s' if len(items) > 1 else ''} à acheter chez {store['name']}",
            "message": preview,
            "data": {
                "url": url,  # iOS
                "clickAction": url,  # Android
                "tag": f"frigo_malin_store_{store['id']}",
                "group": "frigo_malin",
                "subtitle": list_state.name if list_state else "",
            },
        }
        for service in services:
            try:
                await self.hass.services.async_call("notify", service, payload, blocking=True)
            except HomeAssistantError as err:
                _LOGGER.warning("Rappel magasin : échec de l'envoi via notify.%s : %s", service, err)
