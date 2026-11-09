"""Constantes de Frigo Malin."""

from __future__ import annotations

DOMAIN = "frigo_malin"
# Version de l'intégration. Ne pas modifier à la main : utiliser scripts/bump_version.py.
VERSION = "1.12.0"

# Fournisseurs d'IA
CONF_PROVIDER = "provider"
CONF_API_KEY = "api_key"
CONF_MODEL = "model"

PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_OPENAI = "openai"
PROVIDERS = [PROVIDER_ANTHROPIC, PROVIDER_OPENAI]

DEFAULT_MODELS = {
    PROVIDER_ANTHROPIC: "claude-opus-5-5",
    PROVIDER_OPENAI: "gpt-5-mini",
}

# Options
CONF_SHOPPING_ENTITY = "shopping_list_entity"
CONF_AUTO_SHOPPING = "auto_shopping"
CONF_EXCLUDED = "excluded_ingredients"
CONF_DEFAULT_SERVINGS = "default_servings"

DEFAULT_SHOPPING_ENTITY = "todo.shopping_list"
DEFAULT_EXCLUDED = "sel, poivre, eau"
DEFAULT_SERVINGS = 4

# Panneau
PANEL_URL_PATH = "frigo-malin"
PANEL_TITLE = "Frigo Malin par Adri"
# Nom court affiché dans la barre latérale de Home Assistant.
SIDEBAR_TITLE = "Frigo Malin"
PANEL_ICON = "mdi:fridge-outline"
PANEL_COMPONENT = "frigo-malin-panel"
STATIC_URL = "/frigo_malin_static"

# Stockage : augmenter STORAGE_MINOR_VERSION pour un ajout de champ compatible,
# STORAGE_VERSION pour un changement de structure, et prévoir la migration dans store.py.
STORAGE_KEY = f"{DOMAIN}.data"
STORAGE_VERSION = 1
STORAGE_MINOR_VERSION = 4

CHANGELOG_URL = "https://github.com/olabagency/frigo-malin/blob/main/CHANGELOG.md"

# Créneaux du menu de la semaine
SLOTS = ["lunch", "dinner"]
