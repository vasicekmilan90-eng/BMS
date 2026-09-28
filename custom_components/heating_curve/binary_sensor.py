from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HeatingCurveConfigEntry
from .coordinator import BMSRegulator
from .entity import BMSEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HeatingCurveConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([BMSProblemSensor(entry.runtime_data)])


class BMSProblemSensor(BMSEntity, BinarySensorEntity):
    """Souhrnný indikátor problému regulace (výpadek senzoru, předpovědi, termostatu, úložiště)."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "binary_sensor", "problem")

    @property
    def is_on(self) -> bool:
        return bool(self.regulator.problems)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"problems": self.regulator.problems}
