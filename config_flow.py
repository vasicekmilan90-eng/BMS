import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector
from .const import *

class HeatingCurveFlow(config_entries.ConfigFlow, domain=DOMAIN):
    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="BMS Regulátor", data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_THERMOSTAT): selector.EntitySelector(selector.EntitySelectorConfig(domain="climate")),
                vol.Required(CONF_OUTDOOR_SENSOR): selector.EntitySelector(selector.EntitySelectorConfig(domain="sensor", device_class="temperature")),
                vol.Required(CONF_WEATHER): selector.EntitySelector(selector.EntitySelectorConfig(domain="weather")),
                vol.Required(CONF_SUN): selector.EntitySelector(selector.EntitySelectorConfig(domain="sun")),
            })
        )