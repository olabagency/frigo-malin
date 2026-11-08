"""Capteur « Prochain repas » : ce qu'on mange au prochain repas planifié.

Utilisé par la carte de tableau de bord, et disponible pour vos automatisations
(par exemple une annonce « Ce soir : gratin dauphinois » à 18 h).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import PANEL_URL_PATH

if TYPE_CHECKING:
    from . import FrigoConfigEntry
    from .store import FrigoStore

# Après ces heures, le repas du créneau est considéré comme passé.
SLOT_END = {"lunch": (14, 30), "dinner": (21, 30)}
DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def _slot_label(day: datetime, slot: str, now: datetime) -> str:
    when = "midi" if slot == "lunch" else "soir"
    delta = (day.date() - now.date()).days
    if delta == 0:
        return "Ce midi" if slot == "lunch" else "Ce soir"
    if delta == 1:
        return f"Demain {when}"
    return f"{DAYS[day.weekday()].capitalize()} {when}"


def next_meal(store: FrigoStore, now: datetime) -> dict[str, Any] | None:
    """Premier repas planifié qui n'est pas encore passé, dans les 7 jours."""
    entries = store.plan_between(now.date(), (now + timedelta(days=7)).date())
    for entry in entries:
        recipe = store.recipes.get(entry["recipe_id"])
        if recipe is None:
            continue
        day = datetime.fromisoformat(entry["date"]).replace(tzinfo=now.tzinfo)
        hour, minute = SLOT_END.get(entry["slot"], (23, 59))
        if day.replace(hour=hour, minute=minute) < now:
            continue
        image = recipe.get("image") or ""
        return {
            "entry": entry,
            "recipe": recipe,
            "label": _slot_label(day, entry["slot"], now),
            "image": image if image.startswith(("http://", "https://")) else None,
        }
    return None


async def async_setup_entry(
    hass: HomeAssistant, entry: FrigoConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([NextMealSensor(entry)])


class NextMealSensor(SensorEntity):
    """Nom du prochain repas planifié."""

    _attr_icon = "mdi:silverware-fork-knife"
    _attr_should_poll = False
    _attr_name = "Frigo Malin prochain repas"

    def __init__(self, entry: FrigoConfigEntry) -> None:
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_next_meal"
        self._attr_suggested_object_id = "frigo_malin_prochain_repas"

    async def async_added_to_hass(self) -> None:
        store = self._entry.runtime_data.store
        self.async_on_remove(store.add_listener(self._refresh))
        self.async_on_remove(
            async_track_time_interval(self.hass, lambda _now: self._refresh(), timedelta(minutes=10))
        )
        self._update()

    @callback
    def _refresh(self) -> None:
        self._update()
        self.async_write_ha_state()

    @callback
    def _update(self) -> None:
        store = self._entry.runtime_data.store
        meal = next_meal(store, dt_util.now())
        if meal is None:
            self._attr_native_value = "Rien de prévu"
            self._attr_entity_picture = None
            self._attr_extra_state_attributes = {"planned": False, "url": f"/{PANEL_URL_PATH}?tab=week"}
            return
        recipe, entry = meal["recipe"], meal["entry"]
        self._attr_native_value = recipe["title"][:255]
        self._attr_entity_picture = meal["image"]
        self._attr_extra_state_attributes = {
            "planned": True,
            "label": meal["label"],
            "date": entry["date"],
            "slot": entry["slot"],
            "servings": entry["servings"],
            "recipe_id": recipe["id"],
            "description": recipe.get("description") or "",
            "prep_time": recipe.get("prep_time"),
            "cook_time": recipe.get("cook_time"),
            "image": meal["image"],
            "note": entry.get("note") or "",
            "url": f"/{PANEL_URL_PATH}?recipe={recipe['id']}&servings={entry['servings']}",
        }
