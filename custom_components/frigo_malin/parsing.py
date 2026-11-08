"""Analyse des recettes et des ingrédients.

Ce module n'importe rien de Home Assistant : il est testable seul.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from typing import Any

# --------------------------------------------------------------------------
# Quantités et unités
# --------------------------------------------------------------------------

_FRACTIONS = {
    "½": "1/2",
    "¼": "1/4",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
    "⅛": "1/8",
}

_NUMBER_WORDS = {
    "un": 1,
    "une": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5,
    "six": 6,
    "sept": 7,
    "huit": 8,
    "neuf": 9,
    "dix": 10,
    "douze": 12,
    "demi": 0.5,
    "demie": 0.5,
}

# Variante écrite -> unité normalisée (au singulier).
_UNIT_ALIASES: dict[str, str] = {
    "kg": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "kilogramme": "kg",
    "kilogrammes": "kg",
    "g": "g",
    "gr": "g",
    "grs": "g",
    "gramme": "g",
    "grammes": "g",
    "mg": "mg",
    "l": "l",
    "litre": "l",
    "litres": "l",
    "dl": "dl",
    "cl": "cl",
    "ml": "ml",
    "c. à soupe": "c. à soupe",
    "c.à.s": "c. à soupe",
    "c.à.s.": "c. à soupe",
    "c. a soupe": "c. à soupe",
    "càs": "c. à soupe",
    "cas": "c. à soupe",
    "cs": "c. à soupe",
    "cuillère à soupe": "c. à soupe",
    "cuillères à soupe": "c. à soupe",
    "cuillere a soupe": "c. à soupe",
    "cuilleres a soupe": "c. à soupe",
    "cuil. à soupe": "c. à soupe",
    "c. à café": "c. à café",
    "c.à.c": "c. à café",
    "c.à.c.": "c. à café",
    "c. a cafe": "c. à café",
    "càc": "c. à café",
    "cac": "c. à café",
    "cc": "c. à café",
    "cuillère à café": "c. à café",
    "cuillères à café": "c. à café",
    "cuillere a cafe": "c. à café",
    "cuilleres a cafe": "c. à café",
    "cuil. à café": "c. à café",
}

# Unités « mots » : on accepte le pluriel en -s.
_UNIT_WORDS = [
    "pincée",
    "sachet",
    "boîte",
    "boite",
    "tranche",
    "gousse",
    "verre",
    "bouquet",
    "brin",
    "branche",
    "feuille",
    "botte",
    "filet",
    "noix",
    "noisette",
    "poignée",
    "tasse",
    "cube",
    "pot",
    "paquet",
    "morceau",
    "bol",
    "zeste",
    "trait",
    "barquette",
    "rouleau",
]
for _word in _UNIT_WORDS:
    _UNIT_ALIASES.setdefault(_word, "boîte" if _word == "boite" else _word)
    plural = _word if _word.endswith(("s", "x")) else _word + "s"
    if _word == "morceau":
        plural = "morceaux"
    _UNIT_ALIASES.setdefault(plural, "boîte" if _word == "boite" else _word)

_SORTED_UNITS = sorted(_UNIT_ALIASES, key=len, reverse=True)

# Abréviations qui ne prennent jamais de « s ».
_ABBREVIATIONS = {"kg", "g", "mg", "l", "dl", "cl", "ml", "c. à soupe", "c. à café"}

_NUMBER_RE = re.compile(
    r"^\s*(?P<num>\d+\s+\d+/\d+|\d+(?:[.,]\d+)?\s*/\s*\d+|\d+(?:[.,]\d+)?)"
    r"(?:\s*(?:à|a|-|–|ou)\s*\d+(?:[.,]\d+)?)?"
)


def _to_number(text: str) -> float | None:
    text = text.strip().replace(",", ".")
    try:
        if " " in text:  # « 1 1/2 »
            whole, frac = text.split(None, 1)
            return float(whole) + _to_number(frac)  # type: ignore[operator]
        if "/" in text:
            num, den = text.split("/", 1)
            den_f = float(den)
            return float(num) / den_f if den_f else None
        return float(text)
    except (TypeError, ValueError):
        return None


def _strip_of(text: str) -> str:
    """Retire « de », « d' », « des » en tête de nom."""
    return re.sub(r"^(?:de\s+la\s+|de\s+l['’]|de\s+|d['’]\s*|des\s+|du\s+)", "", text, flags=re.I)


def parse_ingredient(line: str) -> dict[str, Any]:
    """Transforme « 200 g de farine » en {quantity: 200, unit: 'g', name: 'farine'}."""
    raw = " ".join(str(line).split())
    text = raw
    for symbol, repl in _FRACTIONS.items():
        text = text.replace(symbol, f" {repl}")
    text = re.sub(r"(\d)\s+(\d/\d)", r"\1 \2", text).strip()
    text = re.sub(r"^[-•*·]\s*", "", text)

    quantity: float | None = None
    match = _NUMBER_RE.match(text)
    if match:
        quantity = _to_number(match.group("num"))
        text = text[match.end() :].strip()
    else:
        first, _, rest = text.partition(" ")
        if first.lower() in _NUMBER_WORDS and rest:
            quantity = float(_NUMBER_WORDS[first.lower()])
            text = rest.strip()

    unit = ""
    lowered = text.lower()
    for alias in _SORTED_UNITS:
        if lowered.startswith(alias):
            after = lowered[len(alias) : len(alias) + 1]
            if after in ("", " ", ".", ",", "'", "’") or alias.endswith("."):
                if alias in ("cas", "cc", "cs") and quantity is None:
                    continue
                rest = text[len(alias) :].lstrip(" .,")
                if not _strip_of(rest).strip():
                    # « 3 noix » : le mot est l'ingrédient, pas une unité.
                    break
                unit = _UNIT_ALIASES[alias]
                text = rest
                break

    name = _strip_of(text).strip(" ,;:") if (unit or quantity is not None) else text.strip()
    if not name:
        name = raw
    return {"quantity": quantity, "unit": unit, "name": name}


def normalize_ingredient(item: Any) -> dict[str, Any] | None:
    """Accepte une chaîne ou un dict et renvoie un ingrédient propre."""
    if isinstance(item, str):
        if not item.strip():
            return None
        return parse_ingredient(item)
    if isinstance(item, dict):
        name = str(item.get("name") or "").strip()
        if not name:
            return None
        quantity = item.get("quantity")
        if isinstance(quantity, str):
            quantity = _to_number(quantity) if quantity.strip() else None
        elif quantity is not None:
            try:
                quantity = float(quantity)
            except (TypeError, ValueError):
                quantity = None
        unit = str(item.get("unit") or "").strip()
        unit = _UNIT_ALIASES.get(unit.lower(), unit)
        return {"quantity": quantity, "unit": unit, "name": name}
    return None


def format_number(value: float) -> str:
    """1.5 -> « 1,5 », 2.0 -> « 2 »."""
    if abs(value - round(value)) < 0.01:
        return str(int(round(value)))
    for den, sym in ((2, "1/2"), (4, "1/4"), (3, "1/3")):
        if value < 1 and abs(value - 1 / den) < 0.01:
            return sym
    return f"{value:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def format_unit(unit: str, quantity: float | None) -> str:
    if not unit or unit in _ABBREVIATIONS or quantity is None or quantity <= 1:
        return unit
    if unit.endswith(("s", "x")):
        return unit
    if unit.endswith("eau"):
        return unit + "x"
    return unit + "s"


def format_ingredient(ing: dict[str, Any]) -> str:
    """Texte lisible pour une liste de courses : « Farine (200 g) »."""
    name = str(ing.get("name") or "").strip()
    name = name[:1].upper() + name[1:]
    quantity = ing.get("quantity")
    unit = ing.get("unit") or ""
    if quantity is None and not unit:
        return name
    parts = []
    if quantity is not None:
        parts.append(format_number(quantity))
    if unit:
        parts.append(format_unit(unit, quantity))
    return f"{name} ({' '.join(parts)})"


# --------------------------------------------------------------------------
# Liste de courses
# --------------------------------------------------------------------------

_TO_BASE = {"kg": ("g", 1000), "g": ("g", 1), "mg": ("g", 0.001), "l": ("ml", 1000), "dl": ("ml", 100), "cl": ("ml", 10), "ml": ("ml", 1)}


def _fold(text: str) -> str:
    text = text.lower().replace("œ", "oe").replace("æ", "ae")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"\(.*?\)", "", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    words = [w[:-1] if len(w) > 3 and w.endswith(("s", "x")) else w for w in text.split()]
    return " ".join(words)


def parse_excluded(text: str) -> list[str]:
    return [_fold(part) for part in re.split(r"[,;\n]", text or "") if part.strip()]


def _is_excluded(name: str, excluded: list[str]) -> bool:
    folded = _fold(name)
    return any(folded == ex or folded.startswith(ex + " ") for ex in excluded if ex)


def _display_unit(quantity: float, unit: str) -> tuple[float, str]:
    if unit == "g" and quantity >= 1000:
        return quantity / 1000, "kg"
    if unit == "ml":
        if quantity >= 1000:
            return quantity / 1000, "l"
        if quantity >= 10 and abs(quantity / 10 - round(quantity / 10)) < 0.01:
            return quantity / 10, "cl"
    return quantity, unit


def aggregate_shopping(
    recipes: list[tuple[list[dict[str, Any]], float, str]],
    excluded: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Regroupe les ingrédients de plusieurs recettes.

    `recipes` : liste de (ingrédients, facteur de portions, titre de la recette).
    """
    excluded = excluded or []
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for ingredients, factor, title in recipes:
        for ing in ingredients:
            name = str(ing.get("name") or "").strip()
            if not name or _is_excluded(name, excluded):
                continue
            unit = ing.get("unit") or ""
            quantity = ing.get("quantity")
            base_unit, mult = _TO_BASE.get(unit, (unit, 1))
            key = (_fold(name), base_unit)
            group = groups.setdefault(
                key,
                {"name": name, "unit": base_unit, "quantity": 0.0, "unknown": False, "recipes": []},
            )
            if quantity is None:
                group["unknown"] = True
            else:
                group["quantity"] += float(quantity) * factor * mult
            if title and title not in group["recipes"]:
                group["recipes"].append(title)

    items = []
    for group in groups.values():
        quantity: float | None = group["quantity"] if group["quantity"] > 0 else None
        unit = group["unit"]
        if quantity is not None:
            quantity, unit = _display_unit(quantity, unit)
        item = {"name": group["name"], "quantity": quantity, "unit": unit if quantity is not None or unit else "", "recipes": group["recipes"]}
        item["text"] = format_ingredient(item)
        items.append(item)
    items.sort(key=lambda i: _fold(i["name"]))
    return items


def parse_list_text(text: str) -> dict[str, Any]:
    """Lit un article de liste : « Tomates (500 g) », « 2 kg de pommes » ou « lait »."""
    text = " ".join(str(text).split())
    match = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", text)
    if match and match.group(1):
        amount = parse_ingredient(f"{match.group(2)} _")
        if amount["name"] == "_" and (amount["quantity"] is not None or amount["unit"]):
            return {"name": match.group(1).strip(), "quantity": amount["quantity"], "unit": amount["unit"]}
        return {"name": text, "quantity": None, "unit": ""}
    return parse_ingredient(text)


def shopping_key(name: str) -> str:
    """Clé pour reconnaître le même article malgré accents, pluriels et majuscules."""
    return _fold(name)


def merge_into_list(
    existing: list[dict[str, Any]], new_items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Décide comment ajouter des articles à une liste qui en contient déjà.

    `existing` : articles non cochés de la liste, {"uid", "summary"}.
    `new_items` : ingrédients {"name", "quantity", "unit"}.
    Renvoie des opérations : {"op": "add", "text"}, {"op": "update", "uid", "text", "previous"}
    ou {"op": "skip", "text"} (déjà sur la liste, sans quantité à ajouter).
    """
    # État courant de chaque article, y compris ceux ajoutés pendant ce même appel.
    current: list[dict[str, Any]] = []
    for item in existing:
        parsed = parse_list_text(item.get("summary") or "")
        current.append({"uid": item.get("uid"), "summary": item.get("summary"), **parsed, "op": None})

    def base(ing: dict[str, Any]) -> tuple[float | None, str]:
        unit = ing.get("unit") or ""
        base_unit, mult = _TO_BASE.get(unit, (unit, 1))
        qty = ing.get("quantity")
        return (float(qty) * mult if qty is not None else None), base_unit

    for ing in new_items:
        name = str(ing.get("name") or "").strip()
        if not name:
            continue
        qty, unit = base(ing)
        key = shopping_key(name)
        same_name = [c for c in current if shopping_key(c["name"]) == key]
        target = None
        for cand in same_name:
            cand_qty, cand_unit = base(cand)
            if qty is None or cand_qty is None or cand_unit == unit:
                target = cand
                break
        if target is None:
            text = format_ingredient(ing)
            current.append({"uid": None, "summary": text, "name": name, "quantity": ing.get("quantity"), "unit": ing.get("unit") or "", "op": "add"})
            continue
        if qty is None:
            if target["op"] is None:
                target["op"] = "skip"
            continue
        target_qty, _ = base(target)
        total = (target_qty or 0) + qty
        shown_qty, shown_unit = _display_unit(total, unit)
        target["quantity"], target["unit"] = shown_qty, shown_unit
        if target["op"] in (None, "skip"):
            target["op"] = "update"

    operations = []
    for item in current:
        text = format_ingredient(item)
        if item["op"] == "add":
            operations.append({"op": "add", "text": text})
        elif item["op"] == "update":
            operations.append({"op": "update", "uid": item["uid"], "text": text, "previous": item["summary"]})
        elif item["op"] == "skip":
            operations.append({"op": "skip", "text": item["summary"]})
    return operations


# --------------------------------------------------------------------------
# Import depuis une page web (schema.org/Recipe)
# --------------------------------------------------------------------------

_LDJSON_RE = re.compile(
    # Guillemets facultatifs : les pages « minifiées » (Marmiton…) écrivent type=application/ld+json.
    r"<script\b[^>]*\btype\s*=\s*[\"']?application/ld\+json[\"']?[^>]*>(.*?)</script\s*>",
    re.I | re.S,
)
_TAG_RE = re.compile(r"<[^>]+>")


def clean_text(value: Any) -> str:
    text = html.unescape(_TAG_RE.sub(" ", str(value or "")))
    return " ".join(text.split())


def parse_duration(value: Any) -> int | None:
    """« PT1H30M » -> 90 minutes."""
    if not value or not isinstance(value, str):
        return None
    match = re.match(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$", value.strip(), re.I)
    if not match:
        return None
    days, hours, minutes, _ = (int(g) if g else 0 for g in match.groups())
    total = days * 1440 + hours * 60 + minutes
    return total or None


def _parse_yield(value: Any) -> int | None:
    if isinstance(value, list):
        for part in value:
            result = _parse_yield(part)
            if result:
                return result
        return None
    if isinstance(value, (int, float)):
        return int(value) or None
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else None


def _type_matches(node: dict[str, Any], wanted: str) -> bool:
    kind = node.get("@type")
    if isinstance(kind, list):
        return wanted in kind
    return kind == wanted


def _find_recipe(node: Any) -> dict[str, Any] | None:
    if isinstance(node, list):
        for child in node:
            found = _find_recipe(child)
            if found:
                return found
    elif isinstance(node, dict):
        if _type_matches(node, "Recipe"):
            return node
        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in node:
                found = _find_recipe(node[key])
                if found:
                    return found
    return None


def _flatten_steps(value: Any) -> list[str]:
    steps: list[str] = []
    if isinstance(value, str):
        for line in re.split(r"\n+|<br\s*/?>|</p>", value):
            text = clean_text(line)
            if text:
                steps.append(text)
    elif isinstance(value, list):
        for item in value:
            steps.extend(_flatten_steps(item))
    elif isinstance(value, dict):
        if "itemListElement" in value:
            steps.extend(_flatten_steps(value["itemListElement"]))
        else:
            text = clean_text(value.get("text") or value.get("name"))
            if text:
                steps.append(text)
    return steps


def _first_image(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return _first_image(value[0])
    if isinstance(value, dict):
        return str(value.get("url") or value.get("contentUrl") or "")
    return ""


def _tags(node: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    for key in ("recipeCategory", "recipeCuisine", "keywords"):
        value = node.get(key)
        parts = value if isinstance(value, list) else re.split(r",", str(value or ""))
        for part in parts:
            text = clean_text(part)
            if text and text.lower() not in (t.lower() for t in tags):
                tags.append(text)
    return tags[:8]


def _load_ldjson(block: str) -> Any:
    """Lit un bloc JSON-LD, même un peu abîmé (retours à la ligne bruts, commentaires, virgules en trop)."""
    text = block.strip()
    text = re.sub(r"^\s*(?:<!--|<!\[CDATA\[)|(?:-->|\]\]>)\s*$", "", text).strip()
    candidates = [text, html.unescape(text)]
    # Virgules en trop avant } ou ], et plusieurs objets collés les uns aux autres.
    fixed = re.sub(r",\s*([}\]])", r"\1", text)
    candidates += [fixed, "[" + re.sub(r"}\s*{", "},{", fixed) + "]"]
    for candidate in candidates:
        try:
            # strict=False accepte les retours à la ligne et tabulations dans les textes.
            return json.loads(candidate, strict=False)
        except ValueError:
            continue
    return None


def count_ldjson(page: str) -> tuple[int, int]:
    """Nombre de blocs JSON-LD dans la page, et nombre de blocs lisibles (pour le journal)."""
    blocks = _LDJSON_RE.findall(page)
    return len(blocks), sum(1 for b in blocks if _load_ldjson(b) is not None)


def extract_recipe_from_html(page: str, url: str = "") -> dict[str, Any] | None:
    """Cherche une recette schema.org dans la page. Renvoie None si absente."""
    for block in _LDJSON_RE.findall(page):
        data = _load_ldjson(block)
        if data is None:
            continue
        node = _find_recipe(data)
        if not node:
            continue
        ingredients = [
            ing
            for ing in (normalize_ingredient(clean_text(i)) for i in node.get("recipeIngredient") or node.get("ingredients") or [])
            if ing
        ]
        return {
            "title": clean_text(node.get("name")) or "Recette importée",
            "description": clean_text(node.get("description"))[:500],
            "image": _first_image(node.get("image")),
            "servings": _parse_yield(node.get("recipeYield")),
            "prep_time": parse_duration(node.get("prepTime")),
            "cook_time": parse_duration(node.get("cookTime")),
            "ingredients": ingredients,
            "steps": _flatten_steps(node.get("recipeInstructions")),
            "tags": _tags(node),
            "source_url": url,
        }
    return None


_CODE_CHARS = re.compile(r"[{};<>=]|\b(?:var|function|const|return|px|rem|margin|padding|display)\b")


def _looks_like_code(line: str) -> bool:
    """Repère les restes de CSS ou de JavaScript dans le texte d'une page."""
    if re.search(r"\{[^{}]*:[^{}]*\}|function\s*\(|=>|\bvar\(--", line):
        return True
    if len(line) < 25:
        return bool(re.search(r"[{}]", line))
    return len(_CODE_CHARS.findall(line)) * 12 > len(line)


def extract_recipe_from_microdata(page: str, url: str = "") -> dict[str, Any] | None:
    """Recette décrite avec des microdonnées (itemprop=...) plutôt qu'en JSON-LD."""

    def items(prop: str) -> list[str]:
        pattern = rf"<(\w+)\b[^>]*\bitemprop\s*=\s*[\"']?{prop}[\"']?[^>]*>(.*?)</\1\s*>"
        return [t for t in (clean_text(m.group(2)) for m in re.finditer(pattern, page, re.I | re.S)) if t]

    def meta(prop: str) -> str:
        m = re.search(rf"<meta\b[^>]*\bitemprop\s*=\s*[\"']?{prop}[\"']?[^>]*\bcontent\s*=\s*[\"']([^\"']*)", page, re.I)
        return html.unescape(m.group(1)) if m else ""

    ingredients = [i for i in (normalize_ingredient(x) for x in items("recipeIngredient") or items("ingredients")) if i]
    if not ingredients:
        return None
    steps = items("recipeInstructions")
    if len(steps) == 1:
        steps = [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-ZÉÈÀ])", steps[0]) if s.strip()]
    title = (items("name") or [""])[0] or meta("name")
    return {
        "title": title or "Recette importée",
        "description": "",
        "image": meta("image"),
        "servings": _parse_yield(meta("recipeYield") or (items("recipeYield") or [""])[0]),
        "prep_time": parse_duration(meta("prepTime")),
        "cook_time": parse_duration(meta("cookTime")),
        "ingredients": ingredients,
        "steps": steps,
        "tags": [],
        "source_url": url,
    }


def html_to_text(page: str, limit: int = 40000) -> str:
    """Texte brut d'une page, pour l'analyse par l'IA en secours.

    Les sites de recettes commencent souvent par des menus et des publicités :
    on garde le titre, puis le passage qui commence un peu avant « ingrédients ».
    """
    title_match = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
    title = clean_text(title_match.group(1)) if title_match else ""
    page = re.sub(r"<!--.*?-->", " ", page, flags=re.S)
    # Une passe par balise : un <script> qui contient le texte « <style> » ne doit pas tout fausser.
    for tag in ("script", "style", "noscript", "template", "svg", "iframe", "header", "footer", "nav", "form", "button", "select"):
        page = re.sub(rf"<{tag}\b[^>]*>.*?</{tag}\s*>", " ", page, flags=re.I | re.S)
        page = re.sub(rf"<{tag}\b[^>]*/>", " ", page, flags=re.I)
    page = re.sub(r"<(br|/p|/li|/h\d|/div|/tr)\b[^>]*>", "\n", page, flags=re.I)
    text = html.unescape(_TAG_RE.sub(" ", page))
    lines = [" ".join(line.split()) for line in text.splitlines()]
    text = "\n".join(line for line in lines if line and not _looks_like_code(line))
    start = 0
    # De préférence un titre « Ingrédients » seul sur sa ligne, sinon la première mention.
    found = re.search(r"^\s*ingr[ée]dients?\b.{0,40}$", text, re.I | re.M) or re.search(r"ingr[ée]dients?", text, re.I)
    if found and len(text) > limit:
        start = max(0, found.start() - 3000)
    body = text[start : start + limit]
    return f"Titre de la page : {title}\n\n{body}" if title else body


# --------------------------------------------------------------------------
# Lecture du JSON renvoyé par l'IA
# --------------------------------------------------------------------------


def extract_json(text: str) -> Any:
    """Récupère le premier objet JSON d'une réponse, même entouré de texte."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except ValueError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError("Réponse de l'IA illisible")
