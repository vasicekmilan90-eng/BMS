from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.restore_state import RestoreEntity
from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    switches = [
        BMSSwitch(entry, "Hlavní vypínač",          "hlavni_vypinac",      False),
        BMSSwitch(entry, "Použití předpovědi",       "pouziti_predpovedi",  False),
        BMSSwitch(entry, "Vliv: Vítr",               "vliv_vitr",           True),
        BMSSwitch(entry, "Vliv: Srážky",             "vliv_srazky",         True),
        BMSSwitch(entry, "Vliv: Vlhkost",            "vliv_vlhkost",        True),
        BMSSwitch(entry, "Vliv: Oblačnost",          "vliv_oblacnost",      True),
        BMSSwitch(entry, "Vliv: Pozice slunce",      "vliv_slunce",         True),
        BMSSwitch(entry, "Protimrazová ochrana",     "frost_protection",    True),
        BMSSwitch(entry, "Noční mód",                "night_mode",          True),
        BMSSwitch(entry, "Letní bypass",             "letni_bypass",        False),
        # Per-vliv forecast přepínače
        BMSSwitch(entry, "Vítr: použít předpověď",      "vitr_predpoved",     False),
        BMSSwitch(entry, "Srážky: použít předpověď",    "srazky_predpoved",   False),
        BMSSwitch(entry, "Vlhkost: použít předpověď",   "vlhkost_predpoved",  False),
        BMSSwitch(entry, "Oblačnost: použít předpověď", "oblacnost_predpoved",False),
    ]
    async_add_entities(switches)


class BMSSwitch(SwitchEntity, RestoreEntity):
    def __init__(self, entry, name, key, default_on: bool = False):
        self._entry = entry
        self._default_on = default_on
        self._attr_name = f"BMS {name}"
        self.entity_id = f"switch.bms_{key}"
        self._attr_unique_id = f"{entry.entry_id}_{key}_sw"
        self._attr_is_on = default_on
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "BMS Regulátor",
        }

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None:
            self._attr_is_on = last.state == "on"
        self.async_write_ha_state()

    async def async_turn_on(self, **kwargs):
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        self._attr_is_on = False
        self.async_write_ha_state()