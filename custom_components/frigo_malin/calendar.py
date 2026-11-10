"""Calendrier « Menu Frigo Malin » : les repas du menu dans le calendrier de Home Assistant.

Chaque repas est un événement qui commence quand il faut se mettre aux fourneaux
(heure du repas moins le temps de la recette) et se termine à l'heure du repas.
Les heures des repas se règlent dans Réglages → Repas et menus.
Utilisable dans les automatisations : déclencheur « Calendrier », décalage « -30 min »…
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import PANEL_URL_PATH

if TYPE_CHECKING:
    from . import FrigoConfigEntry
    from .store import FrigoStore

SLOT_NAMES = {"lunch": "midi", "dinner": "soir"}
DEFAULT_COOK_MINUTES = 30


def meal_time(settings: dict[str, Any], slot: str) -> tuple[int, int]:
    raw = settings.get("lunch_time" if slot == "lunch" else "dinner_time") or ("12:00" if slot == "lunch" else "19:30")
    hour, minute = (int(x) for x in str(raw).split(":"))
    return hour, minute


def meal_events(store: FrigoStore, start: date, end: date) -> list[CalendarEvent]:
    """Événements des repas prévus entre deux dates (incluses)."""
    tz = dt_util.get_default_time_zone()
    events: list[CalendarEvent] = []
    for entry in store.plan_between(start, end):
        recipe = store.recipes.get(entry["recipe_id"])
        if recipe is None:
            continue
        hour, minute = meal_time(store.settings, entry["slot"])
        day = date.fromisoformat(entry["date"])
        at_table = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
        cook = (recipe.get("prep_time") or 0) + (recipe.get("cook_time") or 0) or DEFAULT_COOK_MINUTES
        begin = at_table - timedelta(minutes=max(15, cook))
        details = [f"À table à {hour:02d}:{minute:02d} ({SLOT_NAMES.get(entry['slot'], '')})", f"Pour {entry['servings']} personnes"]
        if recipe.get("prep_time"):
            details.append(f"Préparation {recipe['prep_time']} min")
        if recipe.get("cook_time"):
            details.append(f"Cuisson {recipe['cook_time']} min")
        if entry.get("note"):
            details.append(entry["note"])
        if recipe.get("description"):
            details.append(recipe["description"])
        events.append(
            CalendarEvent(
                start=begin,
                end=at_table,
                summary=f"🍽️ {recipe['title']}",
                description="\n".join(details),
                location=f"/{PANEL_URL_PATH}?recipe={recipe['id']}&servings={entry['servings']}",
                uid=entry["id"],
            )
        )
    events.sort(key=lambda e: e.start)
    return events


async def async_setup_entry(
    hass: HomeAssistant, entry: FrigoConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([MenuCalendar(entry)])


class MenuCalendar(CalendarEntity):
    """Le menu de la semaine, repas par repas."""

    _attr_icon = "mdi:silverware-fork-knife"
    _attr_should_poll = False
    _attr_name = "Frigo Malin menu"

    def __init__(self, entry: FrigoConfigEntry) -> None:
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_menu_calendar"
        self._attr_suggested_object_id = "frigo_malin_menu"
        self._event: CalendarEvent | None = None

    @property
    def event(self) -> CalendarEvent | None:
        """Repas en cours de préparation, sinon le prochain."""
        return self._event

    async def async_added_to_hass(self) -> None:
        store = self._entry.runtime_data.store
        self.async_on_remove(store.add_listener(self._refresh))
        self.async_on_remove(
            async_track_time_interval(self.hass, lambda _now: self._refresh(), timedelta(minutes=5))
        )
        self._update()

    @callback
    def _refresh(self) -> None:
        self._update()
        self.async_write_ha_state()

    @callback
    def _update(self) -> None:
        now = dt_util.now()
        store = self._entry.runtime_data.store
        upcoming = [e for e in meal_events(store, now.date(), (now + timedelta(days=8)).date()) if e.end > now]
        self._event = upcoming[0] if upcoming else None

    async def async_get_events(self, hass: HomeAssistant, start_date: datetime, end_date: datetime) -> list[CalendarEvent]:
        store = self._entry.runtime_data.store
        events = meal_events(store, (start_date - timedelta(days=1)).date(), end_date.date())
        return [e for e in events if e.end > start_date and e.start < end_date]
