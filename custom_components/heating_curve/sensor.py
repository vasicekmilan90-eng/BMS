from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import HeatingCurveConfigEntry
from .const import DEFAULT_STARRED, TEMP_SOURCE_SAFE, TEMP_SOURCE_SENSOR, TEMP_SOURCE_WEATHER
from .coordinator import BMSRegulator
from .entity import BMSEntity

_C, _KMH, _MMH, _PCT, _DEG = "°C", "km/h", "mm/h", "%", "°"

# klíč hodnoty → (jednotka, device class)
DIAG_SENSORS: dict[str, tuple[str, SensorDeviceClass | None]] = {
    "applied_out_temp":       (_C, SensorDeviceClass.TEMPERATURE),
    "raw_outdoor_temp":       (_C, SensorDeviceClass.TEMPERATURE),
    "curve_temp":             (_C, SensorDeviceClass.TEMPERATURE),
    "total_correction":       (_C, None),
    "clamped_temp":           (_C, SensorDeviceClass.TEMPERATURE),
    "actual_wind":            (_KMH, SensorDeviceClass.WIND_SPEED),
    "actual_rain":            (_MMH, SensorDeviceClass.PRECIPITATION_INTENSITY),
    "actual_clouds":          (_PCT, None),
    "actual_humidity":        (_PCT, SensorDeviceClass.HUMIDITY),
    "forecast_wind":          (_KMH, SensorDeviceClass.WIND_SPEED),
    "forecast_rain":          (_MMH, SensorDeviceClass.PRECIPITATION_INTENSITY),
    "forecast_clouds":        (_PCT, None),
    "forecast_humidity":      (_PCT, SensorDeviceClass.HUMIDITY),
    "forecast_temp":          (_C, SensorDeviceClass.TEMPERATURE),
    "sun_elevation":          (_DEG, None),
    "sun_azimuth":            (_DEG, None),
    "actual_sun_elevation":   (_DEG, None),
    "actual_sun_azimuth":     (_DEG, None),
    "forecast_sun_elevation": (_DEG, None),
    "forecast_sun_azimuth":   (_DEG, None),
    "corr_wind":              (_C, None),
    "corr_rain":              (_C, None),
    "corr_humidity":          (_C, None),
    "corr_clouds":            (_C, None),
    "corr_sun":               (_C, None),
}

TEMP_SOURCE_LABELS = {
    TEMP_SOURCE_SENSOR:  "Senzor",
    TEMP_SOURCE_WEATHER: "Weather entita",
    TEMP_SOURCE_SAFE:    "Bezpečná teplota",
}
TEMP_SOURCE_ICONS = {
    TEMP_SOURCE_SENSOR:  "mdi:thermometer",
    TEMP_SOURCE_WEATHER: "mdi:weather-partly-cloudy",
    TEMP_SOURCE_SAFE:    "mdi:shield-alert",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HeatingCurveConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    regulator = entry.runtime_data
    async_add_entities([
        BMSResultSensor(regulator),
        *(BMSValueSensor(regulator, key, unit, dc) for key, (unit, dc) in DIAG_SENSORS.items()),
        BMSStorageStatusSensor(regulator),
        BMSTempSourceSensor(regulator),
        BMSBoostSensor(regulator),
        BMSWeatherSensor(regulator),
        BMSInfluencesLogSensor(regulator),
    ])


class BMSSensor(BMSEntity, SensorEntity):
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, regulator: BMSRegulator, key: str) -> None:
        super().__init__(regulator, "sensor", key)


class BMSResultSensor(BMSSensor):
    """Výsledná teplota topení — hlavní výstup regulátoru."""

    _attr_entity_category = None
    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = _C
    _unrecorded_attributes = frozenset({"calc_log", "clamp_log", "starred_profiles", "schedules", "thermostat"})

    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "calc_temp")

    @property
    def available(self) -> bool:
        return self.regulator.available

    @property
    def native_value(self) -> float | None:
        result = self.regulator.result
        return None if result is None else round(result.result, 1)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        reg = self.regulator
        result = reg.result
        values = reg.values
        safe_since = reg.safe_since
        return {
            "calc_log": reg.data["calc_log"],
            "clamp_log": reg.data["clamp_log"],
            "safe_since_min": round((dt_util.utcnow().timestamp() - safe_since) / 60) if safe_since else 0,
            "night_active": bool(result and result.night_active),
            "frost_active": bool(result and result.frost_active),
            "boost_active": reg.boost_amount != 0.0,
            "bypass_active": bool(result and result.bypass_active),
            "starred_profiles": reg.data.get("starred", DEFAULT_STARRED),
            "schedules": reg.data["schedules"],
            "thermostat": reg.last_write,
            **{k: values.get(k) for k in (
                "actual_wind", "actual_rain", "actual_clouds", "actual_humidity",
                "forecast_wind", "forecast_rain", "forecast_clouds", "forecast_humidity", "forecast_temp",
                "actual_sun_elevation", "actual_sun_azimuth", "forecast_sun_elevation", "forecast_sun_azimuth",
            )},
        }


class BMSValueSensor(BMSSensor):
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, regulator: BMSRegulator, key: str, unit: str, device_class: SensorDeviceClass | None) -> None:
        super().__init__(regulator, key)
        self._attr_native_unit_of_measurement = unit
        self._attr_device_class = device_class

    @property
    def native_value(self) -> float | None:
        return self.regulator.values.get(self._key)


class BMSStorageStatusSensor(BMSSensor):
    _unrecorded_attributes = frozenset({"points"})

    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "curve_storage_status")

    @property
    def native_value(self) -> str:
        points = self.regulator.data["curve"]
        if len(points) < 2:
            return "ERROR"
        return "OK" if self.regulator.store.ok else "FALLBACK"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        points = self.regulator.data["curve"]
        return {"point_count": len(points), "storage_ok": self.regulator.store.ok, "points": points}


class BMSTempSourceSensor(BMSSensor):
    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "temp_source")

    @property
    def native_value(self) -> str:
        return TEMP_SOURCE_LABELS.get(self.regulator.temp_source, "—")

    @property
    def icon(self) -> str:
        return TEMP_SOURCE_ICONS.get(self.regulator.temp_source, "mdi:thermometer-alert")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        source = self.regulator.temp_source
        return {
            "source_key": source,
            "is_fallback": source != TEMP_SOURCE_SENSOR,
            "safe_temp": self.regulator.settings["safe_temp"],
        }


class BMSBoostSensor(BMSSensor):
    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "boost_status")

    @property
    def native_value(self) -> str:
        amount = self.regulator.boost_amount
        if amount == 0.0:
            return "inactive"
        return "boost" if amount > 0 else "reduction"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        boost = self.regulator.data["boost"]
        active = self.regulator.boost_amount != 0.0
        until_ts = boost.get("until", 0) if active else 0
        remaining = max(0, int((until_ts - dt_util.utcnow().timestamp()) / 60)) if active else 0
        return {
            "active": active,
            "amount": boost.get("amount", 0) if active else 0,
            "until_ts": until_ts,
            "remaining_min": remaining,
        }


class BMSWeatherSensor(BMSSensor):
    _unrecorded_attributes = frozenset({"hourly_chart_data"})

    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "weather_status")

    @property
    def native_value(self) -> str:
        return "forecast_ok" if self.regulator.forecast_ok else "no_forecast"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        values = self.regulator.values
        return {
            **{k: values.get(k) for k in (
                "actual_wind", "actual_rain", "actual_clouds", "actual_humidity",
                "forecast_wind", "forecast_rain", "forecast_clouds", "forecast_humidity", "forecast_temp",
            )},
            "hourly_chart_data": self.regulator.chart_forecast(-0.5, 48),
        }


class BMSInfluencesLogSensor(BMSSensor):
    """Historie (-24 h) a předpověď (+24 h) vlivů pro graf karty."""

    _unrecorded_attributes = frozenset({"history", "forecast", "ts_generated"})

    def __init__(self, regulator: BMSRegulator) -> None:
        super().__init__(regulator, "influences_log")

    @property
    def native_value(self) -> str:
        forecast = self.regulator.chart_forecast(-1, 26)
        return f"{len(self.regulator.data['history'])}h+{len(forecast)}fc"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "history": self.regulator.data["history"],
            "forecast": self.regulator.chart_forecast(-1, 26),
            "ts_generated": int(dt_util.utcnow().timestamp()),
        }
