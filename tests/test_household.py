"""Profils du foyer : portions et consignes données à l'IA."""

from custom_components.frigo_malin.household import household_context, household_servings, normalize_settings


def test_normalize_drops_unknown_values():
    settings = normalize_settings(
        {
            "members": [{"name": "Léa", "age": "child", "diet": "martien", "allergies": ["peanuts", "kryptonite"]}],
            "stores": [{"name": "Leclerc", "zone": "zone.leclerc", "aisles": ["frais", "fruits", "inconnu"]}],
            "budget_week": "",
        }
    )
    lea = settings["members"][0]
    assert lea["diet"] == "omnivore"
    assert lea["allergies"] == ["peanuts"]
    store = settings["stores"][0]
    assert store["aisles"][:2] == ["frais", "fruits"]
    assert len(store["aisles"]) == 9
    assert settings["budget_week"] is None


def test_household_servings():
    settings = normalize_settings(
        {"members": [{"age": "adult"}, {"age": "adult"}, {"age": "child"}, {"age": "toddler"}]}
    )
    assert household_servings(settings, 4) == 3  # 1 + 1 + 0,5 + 0,25 = 2,75 -> 3
    assert household_servings(normalize_settings({}), 4) == 4


def test_household_context_mentions_allergies_and_diets():
    settings = normalize_settings(
        {
            "members": [
                {"name": "Adrien", "diet": "omnivore", "spice": "hot"},
                {"name": "Léa", "age": "child", "diet": "vegetarian", "allergies": ["nuts"], "dislikes": "les épinards"},
            ],
            "equipment": ["airfryer"],
            "notes": "Pas de coriandre",
        }
    )
    text = household_context(settings)
    assert "RÈGLE ABSOLUE" in text and "fruits à coque" in text
    assert "végétarien" in text
    assert "enfants" in text
    assert "les épinards" in text
    assert "airfryer" in text
    assert "Pas de coriandre" in text
