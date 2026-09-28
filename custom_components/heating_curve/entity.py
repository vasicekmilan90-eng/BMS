"""Společný základ entit BMS regulátoru."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DEVICE_NAME, DOMAIN


class BMSEntity(Entity):
    """Entita patřící k zařízení „BMS Regulátor“.

    entity_id je pevně daný (např. number.bms_limit_min) — karta i profily s ním počítají.
    """

    _attr_has_entity_name = True

    def __init__(self, entry: ConfigEntry, platform: str, key: str, name: str) -> None:
        self._entry = entry
        self._key = key
        self._attr_name = name
        self.entity_id = f"{platform}.bms_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=DEVICE_NAME,
        )
