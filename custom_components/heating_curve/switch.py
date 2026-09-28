from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import STATE_ON, EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import HeatingCurveConfigEntry
from .coordinator import BMSRegulator
from .entity import BMSEntity
from .settings import SWITCH_SETTINGS, SwitchSetting

_PRIMARY = {"hlavni_vypinac"}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HeatingCurveConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities(BMSSwitch(entry.runtime_data, setting) for setting in SWITCH_SETTINGS)


class BMSSwitch(BMSEntity, SwitchEntity, RestoreEntity):
    def __init__(self, regulator: BMSRegulator, setting: SwitchSetting) -> None:
        super().__init__(regulator, "switch", setting.key, f"{setting.key}_sw")
        if setting.key not in _PRIMARY:
            self._attr_entity_category = EntityCategory.CONFIG

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.regulator.async_register_setting_entity(self._key, self)
        if not self.regulator.has_stored_setting(self._key):
            last = await self.async_get_last_state()
            if last is not None and last.state in ("on", "off"):
                self.regulator.async_set_setting(self._key, last.state == STATE_ON, recompute=False)

    @property
    def is_on(self) -> bool:
        return bool(self.regulator.settings[self._key])

    async def async_turn_on(self, **kwargs: Any) -> None:
        self.regulator.async_set_setting(self._key, True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        self.regulator.async_set_setting(self._key, False)
        self.async_write_ha_state()
