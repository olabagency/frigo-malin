"""Statistiques des repas : calories et macronutriments par jour, plats et aliments les plus mangés.

On considère comme mangés les repas du menu dont le jour est passé (ou aujourd'hui) ;
les jours suivants de la semaine sont « prévus ». Valeurs par personne (une portion).

Ce module n'importe rien de Home Assistant : il est testable seul.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from typing import Any

from .nutrition import MACROS, compute, food_key, match_food

MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _empty() -> dict[str, float]:
    return dict.fromkeys(MACROS, 0.0)


def meal_stats(
    plan: list[dict[str, Any]], recipes: dict[str, dict[str, Any]], foods: dict[str, Any], today: date, period: str = "week"
) -> dict[str, Any]:
    """period : « week » (lundi → dimanche), « month » (30 derniers jours) ou « year » (12 derniers mois)."""
    if period == "year":
        start = date(today.year - 1, today.month, 1) + timedelta(days=32)
        start = start.replace(day=1)
        end = today
    elif period == "month":
        start, end = today - timedelta(days=29), today
    else:
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)

    cache: dict[str, dict[str, Any]] = {}

    def nutrition(recipe: dict[str, Any]) -> dict[str, Any]:
        if recipe["id"] not in cache:
            cache[recipe["id"]] = compute(recipe.get("ingredients") or [], recipe.get("servings"), foods)
        return cache[recipe["id"]]

    per_day: dict[str, dict[str, float]] = {}
    meals_per_day: Counter[str] = Counter()
    top_recipes: Counter[str] = Counter()
    top_foods: Counter[str] = Counter()
    food_names: dict[str, str] = {}
    for entry in plan:
        day = date.fromisoformat(entry["date"])
        if not start <= day <= end:
            continue
        recipe = recipes.get(entry["recipe_id"])
        if recipe is None:
            continue
        n = nutrition(recipe)
        totals = per_day.setdefault(entry["date"], _empty())
        for key in MACROS:
            totals[key] += float(n.get(key) or 0)
        meals_per_day[entry["date"]] += 1
        if day <= today:
            top_recipes[recipe["id"]] += 1
            for ing in recipe.get("ingredients") or []:
                name = str(ing.get("name") or "").strip()
                food = match_food(name)
                if not name or (food and food.get("neg")):
                    continue
                key = food_key(name)
                top_foods[key] += 1
                food_names.setdefault(key, name[:1].upper() + name[1:])

    def bar(label: str, days: list[date], short: str) -> dict[str, Any]:
        eaten = [d for d in days if d <= today and d.isoformat() in per_day]
        total = _empty()
        for d in eaten:
            for key in MACROS:
                total[key] += per_day[d.isoformat()][key]
        avg = {k: round(v / len(eaten)) if eaten else 0 for k, v in total.items()}
        planned = [d for d in days if d > today and d.isoformat() in per_day]
        if not eaten and planned:
            ptotal = _empty()
            for d in planned:
                for key in MACROS:
                    ptotal[key] += per_day[d.isoformat()][key]
            avg = {k: round(v / len(planned)) for k, v in ptotal.items()}
        return {
            "label": label,
            "short": short,
            "date": days[0].isoformat(),
            **avg,
            "meals": sum(meals_per_day[d.isoformat()] for d in days),
            "state": "eaten" if eaten else "planned" if planned else "empty",
            "today": today in days,
        }

    bars: list[dict[str, Any]] = []
    if period == "year":
        cursor = start
        while cursor <= end:
            nxt = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
            days = [cursor + timedelta(days=i) for i in range((nxt - cursor).days)]
            bars.append(bar(f"{MONTHS[cursor.month - 1]} {cursor.year}", days, MONTHS[cursor.month - 1].rstrip(".")[:4]))
            cursor = nxt
    else:
        names = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
        day = start
        while day <= end:
            short = names[day.weekday()][0].upper() if period == "week" else str(day.day)
            bars.append(bar(f"{names[day.weekday()]} {day.day}", [day], short))
            day += timedelta(days=1)

    # Moyenne par jour sur les jours passés qui ont des repas prévus.
    eaten_days = [d for d, _ in per_day.items() if date.fromisoformat(d) <= today]
    average = _empty()
    for d in eaten_days:
        for key in MACROS:
            average[key] += per_day[d][key]
    average = {k: round(v / len(eaten_days)) if eaten_days else 0 for k, v in average.items()}
    return {
        "period": period,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "bars": bars,
        "average": average,
        "days_with_meals": len(eaten_days),
        "meals": sum(top_recipes.values()),
        "top_recipes": [
            {"id": rid, "title": recipes[rid]["title"], "count": c, "image": recipes[rid].get("image") or ""} for rid, c in top_recipes.most_common(5)
        ],
        "top_foods": [{"name": food_names[k], "count": c} for k, c in top_foods.most_common(8)],
    }
