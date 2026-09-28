from __future__ import annotations

from homeassistant.components.number import NumberMode, RestoreNumber
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HeatingCurveConfigEntry
from .coordinator import BMSRegulator
from .entity import BMSEntity
from .settings import NUMBER_SETTINGS, NumberSetting


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HeatingCurveConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities(BMSNumber(entry.runtime_data, setting) for setting in NUMBER_SETTINGS)


class BMSNumber(BMSEntity, RestoreNumber):
    _attr_entity_category = EntityCategory.CONFIG
    _attr_mode = NumberMode.BOX

    def __init__(self, regulator: BMSRegulator, setting: NumberSetting) -> None:
        super().__init__(regulator, "number", setting.key)
        self._setting = setting
        self._attr_native_min_value = setting.min
        self._attr_native_max_value = setting.max
        self._attr_native_step = setting.step
        self._attr_native_unit_of_measurement = setting.unit

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.regulator.async_register_setting_entity(self._key, self)
        # Migrace ze starých verzí: hodnota zatím není v úložišti → vezme se z obnoveného stavu
        if not self.regulator.has_stored_setting(self._key):
            last = await self.async_get_last_number_data()
            value = last.native_value if last is not None else None
            if value is None and (state := await self.async_get_last_state()) is not None:
                value = state.state
            try:
                if value is not None:
                    self.regulator.async_set_setting(self._key, value, recompute=False)
            except (TypeError, ValueError):
                pass

    @property
    def native_value(self) -> float:
        return self.regulator.settings[self._key]

    async def async_set_native_value(self, value: float) -> None:
        self.regulator.async_set_setting(self._key, value)
        self.async_write_ha_state()
