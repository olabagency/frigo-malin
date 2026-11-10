"""Historique des courses : ce qui a été acheté, quand, et les habitudes qu'on en tire.

Un article coché dans la liste de courses (dans l'app, dans Home Assistant ou ailleurs)
compte comme acheté. Le suivi regarde la liste à chaque changement et retient les
articles qui viennent de passer « fait ».

Les fonctions d'analyse n'importent rien de Home Assistant : elles sont testables seules.
"""

from __future__ import annotations

import asyncio
from collections import Counter, defaultdict
from collections.abc import Callable
from datetime import datetime, timedelta
import logging
import math
import re
from statistics import median
from typing import TYPE_CHECKING, Any

from .parsing import shopping_key

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

    from . import FrigoData

_LOGGER = logging.getLogger(__name__)

MAX_PURCHASES = 4000


def purchase_label(summary: str) -> str:
    """« Pommes de terre (1 kg) » -> « Pommes de terre »."""
    text = re.sub(r"\s*\(.*?\)\s*", " ", str(summary or "")).strip()
    return (text[:1].upper() + text[1:])[:60] if text else ""


def _at(entry: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(entry["at"])


def history(purchases: list[dict[str, Any]], now: datetime, days: int | None) -> dict[str, Any]:
    """Achats d'une période, regroupés par jour, avec quelques chiffres."""
    since = now - timedelta(days=days) if days else None
    items = [p for p in purchases if since is None or _at(p) >= since]
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in sorted(items, key=lambda x: x["at"], reverse=True):
        by_day[_at(p).astimezone(now.tzinfo).date().isoformat()].append({"name": p["name"], "at": p["at"]})
    counts = Counter(p["key"] for p in items)
    names = {p["key"]: p["name"] for p in items}
    span_days = days or max(1, (now - min((_at(p) for p in items), default=now)).days + 1)
    weeks = max(1.0, span_days / 7)
    return {
        "days": [{"date": d, "items": v} for d, v in by_day.items()],
        "stats": {
            "items": len(items),
            "trips": len(by_day),
            "distinct": len(counts),
            "per_week": round(len(items) / weeks, 1),
        },
        "top": [{"name": names[k], "count": c} for k, c in counts.most_common(10)],
    }


def habits(purchases: list[dict[str, Any]], now: datetime, limit: int = 30) -> list[dict[str, Any]]:
    """Articles achetés régulièrement : tous les combien de jours, et depuis quand.

    `due` vaut 1 quand le délai habituel est écoulé (0,5 à mi-chemin, 2 pour un retard du double).
    """
    by_key: dict[str, list[datetime]] = defaultdict(list)
    names: dict[str, str] = {}
    for p in purchases:
        by_key[p["key"]].append(_at(p))
        names[p["key"]] = p["name"]
    result = []
    for key, dates in by_key.items():
        days = sorted({d.astimezone(now.tzinfo).date() for d in dates})
        if len(days) < 2:
            continue
        gaps = [(b - a).days for a, b in zip(days, days[1:]) if (b - a).days > 0]
        if not gaps:
            continue
        every = max(1.0, float(median(gaps)))
        since = (now.date() - days[-1]).days
        result.append(
            {
                "key": key,
                "name": names[key],
                "count": len(dates),
                "every": round(every),
                "since": since,
                "due": round(since / every, 2),
            }
        )
    result.sort(key=lambda h: (-min(h["due"], 3), -h["count"]))
    return result[:limit]


def suggestions(
    purchases: list[dict[str, Any]], quick: dict[str, dict[str, Any]], now: datetime, limit: int = 16
) -> list[dict[str, Any]]:
    """Ajout rapide : d'abord ce qui « devrait » être racheté, puis les habitués.

    Score = retard sur le rythme habituel (achats réguliers) + fréquence (achats et ajouts à la main).
    """
    scored: dict[str, dict[str, Any]] = {}
    for h in habits(purchases, now, limit=200):
        due = h["due"]
        score = (3 * min(due, 2) if due >= 0.75 else due) + math.log1p(h["count"])
        reason = f"tous les {h['every']} j · il y a {h['since']} j" if due >= 0.75 else ""
        scored[h["key"]] = {"name": h["name"], "score": score, "due": due >= 0.75, "reason": reason}
    bought = Counter(p["key"] for p in purchases)
    names = {p["key"]: p["name"] for p in purchases}
    for key, count in bought.items():
        if key not in scored:
            scored[key] = {"name": names[key], "score": math.log1p(count), "due": False, "reason": ""}
    for key, entry in quick.items():
        bonus = 0.6 * math.log1p(entry.get("count", 0))
        if key in scored:
            scored[key]["score"] += bonus
        else:
            scored[key] = {"name": entry["name"], "score": bonus, "due": False, "reason": ""}
    ranked = sorted(scored.values(), key=lambda x: -x["score"])
    return [{"name": x["name"], "due": x["due"], "reason": x["reason"]} for x in ranked[:limit]]


class PurchaseTracker:
    """Repère les articles cochés dans la liste de courses et les ajoute à l'historique."""

    def __init__(self, hass: HomeAssistant, data: FrigoData, entity: Callable[[], str | None]) -> None:
        self.hass = hass
        self.data = data
        self._entity = entity
        self._done: dict[str, set[str]] = {}
        self._timer: asyncio.TimerHandle | None = None

    def async_start(self) -> Callable[[], None]:
        from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, EVENT_STATE_CHANGED
        from homeassistant.core import callback

        @callback
        def _changed(event) -> None:
            if event.data.get("entity_id") == self._entity():
                self._schedule()

        remove = self.hass.bus.async_listen(EVENT_STATE_CHANGED, _changed)
        if self.hass.is_running:
            self._schedule(0.5)
        else:
            self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, lambda _e: self._schedule(1))

        def _stop() -> None:
            remove()
            if self._timer:
                self._timer.cancel()

        return _stop

    def _schedule(self, delay: float = 2.0) -> None:
        # Plusieurs coches d'affilée : une seule lecture de la liste.
        if self._timer:
            self._timer.cancel()
        self._timer = self.hass.loop.call_later(delay, lambda: self.hass.async_create_task(self.async_check()))

    async def async_check(self) -> None:
        from homeassistant.exceptions import HomeAssistantError
        from homeassistant.util import dt as dt_util

        entity_id = self._entity()
        if not entity_id:
            return
        try:
            response = await self.hass.services.async_call(
                "todo", "get_items", {"status": ["completed"]}, target={"entity_id": entity_id}, blocking=True, return_response=True
            )
        except HomeAssistantError as err:
            _LOGGER.debug("Historique des courses : liste illisible (%s)", err)
            return
        items = (response or {}).get(entity_id, {}).get("items", [])
        done = {str(i.get("uid")): i.get("summary") or "" for i in items if i.get("uid")}
        previous = self._done.get(entity_id)
        self._done[entity_id] = set(done)
        if previous is None:
            # Première lecture : ce qui est déjà coché n'est pas un nouvel achat.
            return
        new = [done[uid] for uid in done if uid not in previous]
        if new:
            self.data.store.add_purchases(new, dt_util.now())
