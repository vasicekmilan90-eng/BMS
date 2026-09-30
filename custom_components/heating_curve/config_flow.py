"""Config flow pro BMS regulátor."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigEntryState, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_OUTDOOR_SENSOR, CONF_THERMOSTAT, CONF_WEATHER, DEVICE_NAME, DOMAIN
from .settings import ALL_SETTINGS, NumberSetting, SwitchSetting

DATA_SCHEMA = vol.Schema({
    vol.Required(CONF_THERMOSTAT): selector.EntitySelector(
        selector.EntitySelectorConfig(domain="climate")),
    vol.Required(CONF_OUTDOOR_SENSOR): selector.EntitySelector(
        selector.EntitySelectorConfig(domain="sensor", device_class="temperature")),
    vol.Required(CONF_WEATHER): selector.EntitySelector(
        selector.EntitySelectorConfig(domain="weather")),
})


class HeatingCurveFlow(ConfigFlow, domain=DOMAIN):
    """Průvodce nastavením BMS regulátoru."""

    VERSION = 1
    MINOR_VERSION = 2

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title=DEVICE_NAME, data=user_input)
        return self.async_show_form(step_id="user", data_schema=DATA_SCHEMA)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            return self.async_update_reload_and_abort(entry, data_updates=user_input)
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(DATA_SCHEMA, entry.data),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return BMSOptionsFlow()


# Nastavení regulace dostupná i v Možnostech integrace (stejné hodnoty jako entity number/switch/select)
OPTION_KEYS = (
    "limit_min", "limit_max", "safe_temp", "safe_curve_temp",
    "prepocet_rezim", "prepocet_interval", "prepocet_delta",
    "pouziti_predpovedi", "predpoved_hodin",
    "slunce_rezim", "slunce_orientace", "slunce_predpoved", "slunce_predpoved_hodin",
)


def _selector(key: str) -> Any:
    setting = ALL_SETTINGS[key]
    if isinstance(setting, NumberSetting):
        return selector.NumberSelector(selector.NumberSelectorConfig(
            min=setting.min, max=setting.max, step=setting.step,
            unit_of_measurement=setting.unit, mode=selector.NumberSelectorMode.BOX,
        ))
    if isinstance(setting, SwitchSetting):
        return selector.BooleanSelector()
    return selector.SelectSelector(selector.SelectSelectorConfig(
        options=list(setting.options), translation_key=key,
    ))


class BMSOptionsFlow(OptionsFlow):
    """Nastavení regulace v Možnostech integrace."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self.config_entry.state is not ConfigEntryState.LOADED:
            return self.async_abort(reason="not_loaded")
        regulator = self.config_entry.runtime_data
        if user_input is not None:
            for key, value in user_input.items():
                regulator.async_set_setting(key, value)
            return self.async_create_entry(data={})
        schema = vol.Schema({vol.Required(key, default=regulator.settings[key]): _selector(key) for key in OPTION_KEYS})
        return self.async_show_form(step_id="init", data_schema=schema)
