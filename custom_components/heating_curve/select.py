from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import HeatingCurveConfigEntry
from .coordinator import BMSRegulator
from .entity import BMSEntity
from .settings import SELECT_SETTINGS, SelectSetting


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HeatingCurveConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    regulator = entry.runtime_data
    async_add_entities([
        BMSProfileSelect(regulator),
        *(BMSSettingSelect(regulator, setting) for setting in SELECT_SETTINGS),
    ])


class BMSProfileSelect(BMSEntity, SelectEntity):
    """Aktivní profil křivky (stav drží úložiště regulátoru)."""

    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "select", "profil_krivky", "profile_select")

    @property
    def options(self) -> list[str]:
        return self.regulator.profile_names

    @property
    def current_option(self) -> str | None:
        return self.regulator.data["active_profile"]

    async def async_select_option(self, option: str) -> None:
        await self.regulator.async_load_profile(option)


class BMSSettingSelect(BMSEntity, SelectEntity, RestoreEntity):
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, regulator: BMSRegulator, setting: SelectSetting) -> None:
        super().__init__(regulator, "select", setting.key)
        self._attr_options = list(setting.options)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.regulator.async_register_setting_entity(self._key, self)
        if not self.regulator.has_stored_setting(self._key):
            last = await self.async_get_last_state()
            if last is not None and last.state in self._attr_options:
                self.regulator.async_set_setting(self._key, last.state, recompute=False)

    @property
    def current_option(self) -> str:
        return self.regulator.settings[self._key]

    async def async_select_option(self, option: str) -> None:
        self.regulator.async_set_setting(self._key, option)
        self.async_write_ha_state()
