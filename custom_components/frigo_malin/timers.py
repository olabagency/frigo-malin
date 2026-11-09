"""Minuteurs du mode cuisine, gardés par Home Assistant.

Un minuteur lancé dans le panneau est aussi programmé ici. À la fin, les
téléphones de la personne qui l'a lancé (app Home Assistant) reçoivent une
notification, même écran verrouillé ou app fermée.
"""

from __future__ import annotations

from collections.abc import Callable
import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later

from .const import DOMAIN, PANEL_URL_PATH
from .reminder import notify_services_for_person

_LOGGER = logging.getLogger(__name__)
MAX_SECONDS = 12 * 3600


def _timers(hass: HomeAssistant) -> dict[tuple[str, str], Callable[[], None]]:
    return hass.data.setdefault(f"{DOMAIN}_timers", {})


def persons_for_user(hass: HomeAssistant, user_id: str) -> list[str]:
    return [s.entity_id for s in hass.states.async_all("person") if s.attributes.get("user_id") == user_id]


@callback
def async_cancel_timer(hass: HomeAssistant, user_id: str, timer_id: str) -> None:
    cancel = _timers(hass).pop((user_id, timer_id), None)
    if cancel:
        cancel()


@callback
def async_start_timer(
    hass: HomeAssistant, user_id: str, timer_id: str, seconds: int, label: str, recipe: str
) -> list[str]:
    """Programme la notification de fin. Renvoie les services notify qui seront utilisés."""
    async_cancel_timer(hass, user_id, timer_id)
    services = [svc for person in persons_for_user(hass, user_id) for svc in notify_services_for_person(hass, person)]
    if not services:
        return []

    async def _ring(_now: Any) -> None:
        _timers(hass).pop((user_id, timer_id), None)
        url = f"/{PANEL_URL_PATH}?resume=cook"
        payload = {
            "title": "⏰ C'est prêt !",
            "message": f"{recipe} · {label}" if recipe else label,
            "data": {
                "url": url,  # iPhone
                "clickAction": url,  # Android
                "tag": f"frigo_malin_timer_{timer_id}",
                "group": "frigo_malin_timers",
                # iPhone : passe le mode Concentration et sonne.
                "push": {"sound": "default", "interruption-level": "time-sensitive"},
                # Android : notification prioritaire qui sonne et vibre.
                "priority": "high",
                "ttl": 0,
                "channel": "Frigo Malin minuteurs",
                "importance": "high",
                "vibrationPattern": "400, 200, 400, 200, 400",
            },
        }
        for service in services:
            try:
                await hass.services.async_call("notify", service, payload, blocking=True)
            except HomeAssistantError as err:
                _LOGGER.warning("Minuteur : échec de la notification via notify.%s : %s", service, err)

    _timers(hass)[(user_id, timer_id)] = async_call_later(hass, min(seconds, MAX_SECONDS), _ring)
    return services
