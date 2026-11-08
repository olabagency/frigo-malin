"""Stockage local du carnet de recettes et du menu de la semaine."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULT_SERVINGS, SLOTS, STORAGE_KEY, STORAGE_VERSION
from .parsing import normalize_ingredient


def _int(value: Any, default: int | None = None) -> int | None:
    try:
        number = int(float(value))
        return number if number > 0 else default
    except (TypeError, ValueError):
        return default


def _str_list(value: Any) -> list[str]:
    if isinstance(value, str):
        value = value.splitlines()
    return [str(v).strip() for v in value or [] if str(v).strip()]


class FrigoStore:
    """Données persistantes dans .storage/frigo_malin.data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.recipes: dict[str, dict[str, Any]] = {}
        self.plan: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.recipes = {r["id"]: r for r in data.get("recipes", [])}
        self.plan = {e["id"]: e for e in data.get("plan", [])}

    def _data(self) -> dict[str, Any]:
        return {"recipes": list(self.recipes.values()), "plan": list(self.plan.values())}

    def _save(self) -> None:
        self._store.async_delay_save(self._data, 1)

    # ------------------------------------------------------------------ recettes

    def save_recipe(self, raw: dict[str, Any], default_servings: int = DEFAULT_SERVINGS) -> dict[str, Any]:
        recipe_id = raw.get("id") or uuid4().hex
        existing = self.recipes.get(recipe_id, {})
        now = dt_util.utcnow().isoformat()
        title = str(raw.get("title") or "").strip()
        if not title:
            raise ValueError("Le titre est obligatoire")
        ingredients = raw.get("ingredients") or []
        if isinstance(ingredients, str):
            ingredients = ingredients.splitlines()
        recipe = {
            "id": recipe_id,
            "title": title,
            "description": str(raw.get("description") or "").strip(),
            "image": str(raw.get("image") or "").strip(),
            "servings": _int(raw.get("servings"), default_servings),
            "prep_time": _int(raw.get("prep_time")),
            "cook_time": _int(raw.get("cook_time")),
            "ingredients": [i for i in (normalize_ingredient(x) for x in ingredients) if i],
            "steps": _str_list(raw.get("steps")),
            "tags": _str_list(raw.get("tags"))[:12],
            "favorite": bool(raw.get("favorite", existing.get("favorite", False))),
            "notes": str(raw.get("notes", existing.get("notes", "")) or ""),
            "source_url": str(raw.get("source_url") or existing.get("source_url") or ""),
            "origin": raw.get("origin") or existing.get("origin") or "manual",
            "created_at": existing.get("created_at", now),
            "updated_at": now,
        }
        self.recipes[recipe_id] = recipe
        self._save()
        return recipe

    def patch_recipe(self, recipe_id: str, **changes: Any) -> dict[str, Any]:
        recipe = self.recipes[recipe_id]
        for key in ("favorite", "notes"):
            if key in changes and changes[key] is not None:
                recipe[key] = bool(changes[key]) if key == "favorite" else str(changes[key])
        recipe["updated_at"] = dt_util.utcnow().isoformat()
        self._save()
        return recipe

    def delete_recipe(self, recipe_id: str) -> None:
        self.recipes.pop(recipe_id, None)
        for entry_id in [e["id"] for e in self.plan.values() if e["recipe_id"] == recipe_id]:
            self.plan.pop(entry_id)
        self._save()

    # ------------------------------------------------------------------ menu

    def plan_between(self, start: date, end: date) -> list[dict[str, Any]]:
        entries = [e for e in self.plan.values() if start.isoformat() <= e["date"] <= end.isoformat()]
        return sorted(entries, key=lambda e: (e["date"], SLOTS.index(e["slot"]) if e["slot"] in SLOTS else 9))

    def add_plan(self, day: date, slot: str, recipe_id: str, servings: int | None) -> dict[str, Any]:
        if recipe_id not in self.recipes:
            raise KeyError(recipe_id)
        entry = {
            "id": uuid4().hex,
            "date": day.isoformat(),
            "slot": slot if slot in SLOTS else SLOTS[-1],
            "recipe_id": recipe_id,
            "servings": _int(servings, self.recipes[recipe_id].get("servings") or DEFAULT_SERVINGS),
            "in_shopping_list": False,
        }
        self.plan[entry["id"]] = entry
        self._save()
        return entry

    def update_plan(self, entry_id: str, **changes: Any) -> dict[str, Any]:
        entry = self.plan[entry_id]
        if changes.get("servings") is not None:
            entry["servings"] = _int(changes["servings"], entry["servings"])
        if changes.get("date"):
            entry["date"] = changes["date"]
        if changes.get("slot") in SLOTS:
            entry["slot"] = changes["slot"]
        if changes.get("in_shopping_list") is not None:
            entry["in_shopping_list"] = bool(changes["in_shopping_list"])
        self._save()
        return entry

    def delete_plan(self, entry_id: str) -> None:
        self.plan.pop(entry_id, None)
        self._save()
