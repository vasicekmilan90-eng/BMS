"""Společný základ entit BMS regulátoru."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DEVICE_NAME, DOMAIN

if TYPE_CHECKING:
    from .coordinator import BMSRegulator


class BMSEntity(Entity):
    """Entita zařízení „BMS Regulátor“ napojená na regulátor.

    entity_id se při prvním přidání nastaví na `<platforma>.bms_<klíč>` (stará karta s ním počítá).
    """

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, regulator: BMSRegulator, platform: str, key: str, unique_suffix: str | None = None) -> None:
        self.regulator = regulator
        self._key = key
        self._platform_name = platform
        self._attr_translation_key = key
        self.entity_id = f"{platform}.bms_{key}"
        entry_id = regulator.entry.entry_id
        self._attr_unique_id = f"{entry_id}_{unique_suffix or key}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry_id)}, name=DEVICE_NAME)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.regulator.async_register_entity(f"{self._platform_name}.{self._key}", self)
        self.async_on_remove(self.regulator.async_add_listener(self._handle_regulator_update))

    @callback
    def _handle_regulator_update(self) -> None:
        self.async_write_ha_state()
