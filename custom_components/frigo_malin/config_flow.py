"""Configuration de Frigo Malin depuis l'interface de Home Assistant."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .ai import AIClient, AIError, InvalidAuth
from .const import (
    CONF_API_KEY,
    CONF_AUTO_SHOPPING,
    CONF_DEFAULT_SERVINGS,
    CONF_EXCLUDED,
    CONF_MODEL,
    CONF_PROVIDER,
    CONF_SHOPPING_ENTITY,
    DEFAULT_EXCLUDED,
    DEFAULT_MODELS,
    DEFAULT_SERVINGS,
    DEFAULT_SHOPPING_ENTITY,
    DOMAIN,
    PROVIDERS,
)

PROVIDER_SELECTOR = SelectSelector(
    SelectSelectorConfig(options=PROVIDERS, mode=SelectSelectorMode.LIST, translation_key="provider")
)
PASSWORD = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))


async def _validate(hass, provider: str, api_key: str, model: str | None) -> dict[str, str]:
    client = AIClient(async_get_clientsession(hass), provider, api_key, model)
    try:
        await client.validate()
    except InvalidAuth:
        return {"base": "invalid_auth"}
    except AIError:
        return {"base": "cannot_connect"}
    return {}


class FrigoMalinConfigFlow(ConfigFlow, domain=DOMAIN):
    """Étapes : choix du fournisseur, puis clé API."""

    VERSION = 1
    MINOR_VERSION = 1

    def __init__(self) -> None:
        self._provider: str | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            self._provider = user_input[CONF_PROVIDER]
            return await self.async_step_credentials()
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {vol.Required(CONF_PROVIDER, default=PROVIDERS[0]): PROVIDER_SELECTOR}
            ),
        )

    async def async_step_credentials(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        assert self._provider
        errors: dict[str, str] = {}
        if user_input is not None:
            model = (user_input.get(CONF_MODEL) or "").strip() or DEFAULT_MODELS[self._provider]
            errors = await _validate(self.hass, self._provider, user_input[CONF_API_KEY], model)
            if not errors:
                return self.async_create_entry(
                    title="Frigo Malin par Adri",
                    data={
                        CONF_PROVIDER: self._provider,
                        CONF_API_KEY: user_input[CONF_API_KEY],
                        CONF_MODEL: model,
                    },
                )
        return self.async_show_form(
            step_id="credentials",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_API_KEY): PASSWORD,
                    vol.Optional(CONF_MODEL, default=DEFAULT_MODELS[self._provider]): str,
                }
            ),
            errors=errors,
            description_placeholders={"provider": "Claude (Anthropic)" if self._provider == "anthropic" else "OpenAI"},
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Changer de fournisseur ou de clé sans tout réinstaller."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            provider = user_input[CONF_PROVIDER]
            model = (user_input.get(CONF_MODEL) or "").strip() or DEFAULT_MODELS[provider]
            errors = await _validate(self.hass, provider, user_input[CONF_API_KEY], model)
            if not errors:
                options = {**entry.options}
                options.pop(CONF_MODEL, None)
                return self.async_update_reload_and_abort(
                    entry,
                    data={CONF_PROVIDER: provider, CONF_API_KEY: user_input[CONF_API_KEY], CONF_MODEL: model},
                    options=options,
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_PROVIDER, default=entry.data[CONF_PROVIDER]): PROVIDER_SELECTOR,
                    vol.Required(CONF_API_KEY): PASSWORD,
                    vol.Optional(CONF_MODEL, default=""): str,
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return FrigoMalinOptionsFlow()


class FrigoMalinOptionsFlow(OptionsFlow):
    """Réglages modifiables à tout moment."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        current = {**self.config_entry.data, **self.config_entry.options}
        if user_input is not None:
            user_input[CONF_MODEL] = (user_input.get(CONF_MODEL) or "").strip() or DEFAULT_MODELS[
                current[CONF_PROVIDER]
            ]
            user_input[CONF_DEFAULT_SERVINGS] = int(user_input[CONF_DEFAULT_SERVINGS])
            return self.async_create_entry(data=user_input)

        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_MODEL, default=current.get(CONF_MODEL) or DEFAULT_MODELS[current[CONF_PROVIDER]]
                ): str,
                vol.Optional(
                    CONF_SHOPPING_ENTITY,
                    default=current.get(CONF_SHOPPING_ENTITY, DEFAULT_SHOPPING_ENTITY),
                ): EntitySelector(EntitySelectorConfig(domain="todo")),
                vol.Optional(CONF_AUTO_SHOPPING, default=current.get(CONF_AUTO_SHOPPING, True)): BooleanSelector(),
                vol.Optional(CONF_EXCLUDED, default=current.get(CONF_EXCLUDED, DEFAULT_EXCLUDED)): str,
                vol.Optional(
                    CONF_DEFAULT_SERVINGS, default=current.get(CONF_DEFAULT_SERVINGS, DEFAULT_SERVINGS)
                ): NumberSelector(NumberSelectorConfig(min=1, max=20, step=1, mode=NumberSelectorMode.BOX)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
