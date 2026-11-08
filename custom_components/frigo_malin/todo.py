"""Liste de courses intégrée à Frigo Malin.

Utilisée quand aucune autre liste n'est choisie ou trouvée : Frigo Malin
fonctionne ainsi sans installer l'intégration « Liste de courses » de HA.
C'est une vraie liste Home Assistant (todo.frigo_malin_courses), visible aussi
dans l'onglet « À faire » de HA et utilisable dans les automatisations.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

if TYPE_CHECKING:
    from . import FrigoConfigEntry
    from .store import FrigoStore

OWN_LIST_ENTITY = "todo.frigo_malin_courses"


async def async_setup_entry(
    hass: HomeAssistant, entry: FrigoConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([FrigoShoppingList(entry)])


class FrigoShoppingList(TodoListEntity):
    """Liste de courses stockée avec les données de Frigo Malin."""

    _attr_name = "Frigo Malin courses"
    _attr_icon = "mdi:cart-outline"
    _attr_should_poll = False
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.MOVE_TODO_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, entry: FrigoConfigEntry) -> None:
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_shopping_list"
        self._attr_suggested_object_id = "frigo_malin_courses"

    @property
    def _store(self) -> FrigoStore:
        return self._entry.runtime_data.store

    async def async_added_to_hass(self) -> None:
        self._refresh_items()

    @callback
    def _refresh_items(self) -> None:
        self._attr_todo_items = [
            TodoItem(
                uid=item["uid"],
                summary=item["summary"],
                status=TodoItemStatus(item["status"]),
                description=item.get("description") or None,
            )
            for item in self._store.shopping_items
        ]

    @callback
    def _changed(self) -> None:
        self._store.save_shopping_items()
        self._refresh_items()
        self.async_write_ha_state()

    def _find(self, uid: str | None) -> dict:
        for item in self._store.shopping_items:
            if item["uid"] == uid:
                return item
        raise HomeAssistantError(f"Article introuvable : {uid}")

    async def async_create_todo_item(self, item: TodoItem) -> None:
        self._store.shopping_items.append(
            {
                "uid": uuid4().hex,
                "summary": item.summary or "",
                "status": TodoItemStatus(item.status or TodoItemStatus.NEEDS_ACTION).value,
                "description": item.description or "",
            }
        )
        self._changed()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        current = self._find(item.uid)
        if item.summary is not None:
            current["summary"] = item.summary
        if item.status is not None:
            current["status"] = TodoItemStatus(item.status).value
        if item.description is not None:
            current["description"] = item.description
        self._changed()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        wanted = set(uids)
        self._store.shopping_items[:] = [i for i in self._store.shopping_items if i["uid"] not in wanted]
        self._changed()

    async def async_move_todo_item(self, uid: str, previous_uid: str | None = None) -> None:
        items = self._store.shopping_items
        moving = self._find(uid)
        items.remove(moving)
        index = 0
        if previous_uid is not None:
            index = items.index(self._find(previous_uid)) + 1
        items.insert(index, moving)
        self._changed()
