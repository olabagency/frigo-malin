"""Stockage local du carnet de recettes et du menu de la semaine."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULT_SERVINGS, SLOTS, STORAGE_KEY, STORAGE_MINOR_VERSION, STORAGE_VERSION
from .household import normalize_settings
from .parsing import normalize_ingredient, shopping_key


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


class _MigratingStore(Store[dict[str, Any]]):
    """Met à jour les données enregistrées par une ancienne version de Frigo Malin."""

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        data = dict(old_data)
        if old_major_version == 1 and old_minor_version < 2:
            # 1.1.0 : historique des articles ajoutés à la liste de courses.
            data.setdefault("shopping_history", {})
        if old_major_version == 1 and old_minor_version < 3:
            # 1.2.0 : réglages du foyer (profils, préférences, magasins).
            data.setdefault("settings", normalize_settings(None))
        if old_major_version == 1 and old_minor_version < 4:
            # 1.4.0 : liste de courses intégrée.
            data.setdefault("shopping_items", [])
        if old_major_version > STORAGE_VERSION:
            raise NotImplementedError("Données créées par une version plus récente de Frigo Malin")
        return data


class FrigoStore:
    """Données persistantes dans .storage/frigo_malin.data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = _MigratingStore(hass, STORAGE_VERSION, STORAGE_KEY, minor_version=STORAGE_MINOR_VERSION)
        self.recipes: dict[str, dict[str, Any]] = {}
        self.plan: dict[str, dict[str, Any]] = {}
        # Dernière version de l'intégration qui a ouvert ces données (pour annoncer les mises à jour).
        self.last_version: str | None = None
        # Articles ajoutés à la main, pour proposer des suggestions : clé -> {name, count, last}.
        self.shopping_history: dict[str, dict[str, Any]] = {}
        self.settings: dict[str, Any] = normalize_settings(None)
        # Articles de la liste de courses intégrée (todo.frigo_malin_courses).
        self.shopping_items: list[dict[str, Any]] = []
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.recipes = {r["id"]: r for r in data.get("recipes", [])}
        self.plan = {e["id"]: e for e in data.get("plan", [])}
        self.last_version = data.get("last_version")
        self.shopping_history = data.get("shopping_history", {})
        self.settings = normalize_settings(data.get("settings"))
        self.shopping_items = data.get("shopping_items", [])

    def set_last_version(self, version: str) -> None:
        self.last_version = version
        self._save()

    def _data(self) -> dict[str, Any]:
        return {
            "last_version": self.last_version,
            "recipes": list(self.recipes.values()),
            "plan": list(self.plan.values()),
            "shopping_history": self.shopping_history,
            "settings": self.settings,
            "shopping_items": self.shopping_items,
        }

    def save_shopping_items(self) -> None:
        self._save()

    # ------------------------------------------------------------------ réglages

    def save_settings(self, raw: dict[str, Any]) -> dict[str, Any]:
        self.settings = normalize_settings(raw)
        self._save()
        return self.settings

    def add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Appelé à chaque modification (menu, recettes…). Renvoie de quoi se désabonner."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener) if listener in self._listeners else None

    # ------------------------------------------------------------------ courses

    def record_shopping(self, names: list[str]) -> None:
        """Retient les articles ajoutés à la main, pour les suggérer ensuite."""
        now = dt_util.utcnow().isoformat()
        for name in names:
            key = shopping_key(name)
            if not key:
                continue
            entry = self.shopping_history.setdefault(key, {"name": name, "count": 0})
            entry["name"] = name
            entry["count"] += 1
            entry["last"] = now
        # On garde les 200 articles les plus utilisés.
        if len(self.shopping_history) > 200:
            keep = sorted(self.shopping_history.items(), key=lambda kv: kv[1]["count"], reverse=True)[:200]
            self.shopping_history = dict(keep)
        self._save()

    def shopping_suggestions(self, limit: int = 12) -> list[dict[str, Any]]:
        items = sorted(
            self.shopping_history.values(), key=lambda e: (e["count"], e.get("last", "")), reverse=True
        )
        return [{"name": e["name"], "count": e["count"]} for e in items[:limit]]

    def _save(self) -> None:
        self._store.async_delay_save(self._data, 1)
        for listener in list(self._listeners):
            listener()

    # ------------------------------------------------------------------ recettes

    def save_recipe(self, raw: dict[str, Any], default_servings: int = DEFAULT_SERVINGS) -> dict[str, Any]:
        recipe_id = raw.get("id")
        # Une recette de la bibliothèque (« lib-… ») ou inconnue devient une nouvelle recette du carnet.
        if not recipe_id or recipe_id not in self.recipes:
            recipe_id = uuid4().hex
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
            "library_id": str(raw.get("library_id") or existing.get("library_id") or "") or None,
            "benefits": _str_list(raw.get("benefits", existing.get("benefits")))[:6],
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

    def add_plan(
        self, day: date, slot: str, recipe_id: str, servings: int | None, note: str = ""
    ) -> dict[str, Any]:
        if recipe_id not in self.recipes:
            raise KeyError(recipe_id)
        entry = {
            "id": uuid4().hex,
            "date": day.isoformat(),
            "slot": slot if slot in SLOTS else SLOTS[-1],
            "recipe_id": recipe_id,
            "servings": _int(servings, self.recipes[recipe_id].get("servings") or DEFAULT_SERVINGS),
            "in_shopping_list": False,
            "note": str(note or "")[:200],
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
