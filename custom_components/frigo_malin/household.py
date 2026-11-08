"""Réglages du foyer : profils, préférences de cuisine et magasins.

Ce module n'importe rien de Home Assistant : il est testable seul.
"""

from __future__ import annotations

import math
from typing import Any
from uuid import uuid4

AGES = {
    "adult": ("adulte", 1.0),
    "teen": ("adolescent", 1.0),
    "child": ("enfant (4-11 ans)", 0.5),
    "toddler": ("tout-petit (1-3 ans)", 0.25),
}
DIETS = {
    "omnivore": "mange de tout",
    "flexitarian": "flexitarien (peu de viande)",
    "vegetarian": "végétarien",
    "vegan": "végétalien (vegan)",
    "pescetarian": "pescétarien (poisson mais pas de viande)",
    "no_pork": "ne mange pas de porc",
    "halal": "halal",
}
# Les 14 allergènes à déclaration obligatoire en Europe.
ALLERGENS = {
    "gluten": "gluten",
    "crustaceans": "crustacés",
    "eggs": "œufs",
    "fish": "poisson",
    "peanuts": "arachides",
    "soy": "soja",
    "milk": "lait et lactose",
    "nuts": "fruits à coque",
    "celery": "céleri",
    "mustard": "moutarde",
    "sesame": "sésame",
    "sulphites": "sulfites",
    "lupin": "lupin",
    "molluscs": "mollusques",
}
SPICE = {"mild": "pas épicé du tout", "medium": "légèrement épicé", "hot": "aime les plats relevés"}
EQUIPMENT = {
    "oven": "four",
    "microwave": "micro-ondes",
    "airfryer": "friteuse sans huile (airfryer)",
    "multicooker": "robot cuiseur (type Thermomix / Cookeo)",
    "pressure_cooker": "autocuiseur",
    "slow_cooker": "mijoteuse",
    "bbq": "barbecue / plancha",
    "steamer": "cuiseur vapeur",
}
CUISINES = {
    "french": "française",
    "italian": "italienne",
    "asian": "asiatique",
    "mediterranean": "méditerranéenne",
    "mexican": "mexicaine",
    "indian": "indienne",
    "middle_eastern": "orientale",
    "comfort": "plats réconfortants",
}
GOALS = {
    "balanced": "équilibré",
    "light": "léger",
    "protein": "riche en protéines",
    "budget": "petit budget",
    "quick": "rapide",
    "seasonal": "de saison et local",
    "zero_waste": "anti-gaspi",
}
AISLE_KEYS = ["fruits", "pain", "viande", "frais", "epicerie", "surgeles", "boissons", "maison", "autres"]
PLAN_SLOTS = ["lunch_weekday", "dinner_weekday", "lunch_weekend", "dinner_weekend"]

DEFAULT_SETTINGS: dict[str, Any] = {
    "members": [],
    "time_weekday": 30,
    "time_weekend": 75,
    "budget_week": None,
    "equipment": ["oven", "microwave"],
    "cuisines": [],
    "goals": ["balanced", "seasonal"],
    "notes": "",
    "plan_slots": {"lunch_weekday": False, "dinner_weekday": True, "lunch_weekend": True, "dinner_weekend": True},
    "stores": [],
    "store_reminder": True,
    # Portions par défaut choisies à la main (None : calculées d'après le foyer).
    "servings": None,
    # Liste de courses choisie dans l'app (None : automatique).
    "shopping_entity": None,
}


def _choice(value: Any, allowed: dict[str, Any] | list[str], default: str) -> str:
    return value if value in allowed else default


def _choices(values: Any, allowed: dict[str, Any] | list[str]) -> list[str]:
    seen: list[str] = []
    for value in values or []:
        if value in allowed and value not in seen:
            seen.append(value)
    return seen


def _int(value: Any, low: int, high: int, default: int | None) -> int | None:
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def normalize_member(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id") or uuid4().hex),
        "name": str(raw.get("name") or "").strip()[:40] or "Quelqu'un",
        "age": _choice(raw.get("age"), AGES, "adult"),
        "diet": _choice(raw.get("diet"), DIETS, "omnivore"),
        "allergies": _choices(raw.get("allergies"), ALLERGENS),
        "dislikes": str(raw.get("dislikes") or "").strip()[:200],
        "spice": _choice(raw.get("spice"), SPICE, "medium"),
    }


def normalize_store(raw: dict[str, Any]) -> dict[str, Any]:
    aisles = _choices(raw.get("aisles"), AISLE_KEYS)
    aisles += [key for key in AISLE_KEYS if key not in aisles]
    zone = str(raw.get("zone") or "").strip()
    return {
        "id": str(raw.get("id") or uuid4().hex),
        "name": str(raw.get("name") or "").strip()[:40] or "Mon magasin",
        "zone": zone if zone.startswith("zone.") else None,
        "aisles": aisles,
    }


def normalize_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw or {}
    slots = raw.get("plan_slots") or {}
    budget = raw.get("budget_week")
    return {
        "members": [normalize_member(m) for m in raw.get("members") or [] if isinstance(m, dict)][:12],
        "time_weekday": _int(raw.get("time_weekday"), 10, 240, DEFAULT_SETTINGS["time_weekday"]),
        "time_weekend": _int(raw.get("time_weekend"), 10, 360, DEFAULT_SETTINGS["time_weekend"]),
        "budget_week": _int(budget, 10, 2000, None) if budget not in (None, "") else None,
        "equipment": _choices(raw.get("equipment", DEFAULT_SETTINGS["equipment"]), EQUIPMENT),
        "cuisines": _choices(raw.get("cuisines"), CUISINES),
        "goals": _choices(raw.get("goals", DEFAULT_SETTINGS["goals"]), GOALS),
        "notes": str(raw.get("notes") or "").strip()[:500],
        "plan_slots": {
            key: bool(slots.get(key, DEFAULT_SETTINGS["plan_slots"][key])) for key in PLAN_SLOTS
        },
        "stores": [normalize_store(s) for s in raw.get("stores") or [] if isinstance(s, dict)][:10],
        "store_reminder": bool(raw.get("store_reminder", True)),
        "servings": _int(raw.get("servings"), 1, 20, None) if raw.get("servings") not in (None, "") else None,
        "shopping_entity": raw.get("shopping_entity")
        if isinstance(raw.get("shopping_entity"), str) and raw["shopping_entity"].startswith("todo.")
        else None,
    }


def household_servings(settings: dict[str, Any], default: int) -> int:
    """Portions par défaut : le réglage choisi, sinon le foyer (un enfant compte pour ½), sinon `default`."""
    if settings.get("servings"):
        return int(settings["servings"])
    members = settings.get("members") or []
    if not members:
        return default
    total = sum(AGES[m["age"]][1] for m in members)
    return max(1, math.ceil(total - 0.01))


def household_context(settings: dict[str, Any]) -> str:
    """Texte à donner à l'IA pour qu'elle adapte ses propositions au foyer."""
    lines: list[str] = []
    members = settings.get("members") or []
    if members:
        lines.append(f"Le foyer compte {len(members)} personne(s) :")
        for m in members:
            parts = [AGES[m["age"]][0], DIETS[m["diet"]], SPICE[m["spice"]]]
            if m["allergies"]:
                parts.append("ALLERGIE à : " + ", ".join(ALLERGENS[a] for a in m["allergies"]))
            if m["dislikes"]:
                parts.append("n'aime pas : " + m["dislikes"])
            lines.append(f"- {m['name']} : " + " ; ".join(parts))
        allergies = sorted({ALLERGENS[a] for m in members for a in m["allergies"]})
        if allergies:
            lines.append(
                "RÈGLE ABSOLUE : aucune recette ne doit contenir ces allergènes, même en trace ou en option : "
                + ", ".join(allergies)
                + "."
            )
        diets = {m["diet"] for m in members}
        if diets & {"vegan"}:
            lines.append("Au moins une personne est vegan : chaque plat doit avoir une version vegan sans cuisine séparée compliquée.")
        elif diets & {"vegetarian"}:
            lines.append("Au moins une personne est végétarienne : privilégie des plats végétariens ou facilement déclinables.")
        if diets & {"no_pork", "halal"}:
            lines.append("Pas de porc (ni lardons, jambon, chorizo, gélatine de porc).")
        if any(m["age"] in ("child", "toddler") for m in members):
            lines.append("Il y a des enfants : saveurs douces, textures simples, pas d'alcool non cuit, piment à part.")
    equipment = settings.get("equipment") or []
    if equipment:
        lines.append("Équipement disponible : " + ", ".join(EQUIPMENT[e] for e in equipment) + ".")
    if settings.get("cuisines"):
        lines.append("Cuisines appréciées : " + ", ".join(CUISINES[c] for c in settings["cuisines"]) + ".")
    if settings.get("goals"):
        lines.append("Objectifs : " + ", ".join(GOALS[g] for g in settings["goals"]) + ".")
    if settings.get("notes"):
        lines.append("Autres consignes du foyer : " + settings["notes"])
    return "\n".join(lines)
