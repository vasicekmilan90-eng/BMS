"""Testy volitelných senzorů vlivů počasí (místo / vedle entity počasí)."""

from __future__ import annotations

import pytest

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import DATA, DOMAIN, WeatherMock, set_inputs

SENSORS = {"wind_sensor": "sensor.vitr", "rain_sensor": "sensor.srazky"}


def _set_sensors(hass: HomeAssistant, *, wind: str = "5", rain: str = "0.1") -> None:
    hass.states.async_set("sensor.vitr", wind, {"unit_of_measurement": "m/s"})
    hass.states.async_set("sensor.srazky", rain, {"unit_of_measurement": "in/h"})


async def _setup(hass: HomeAssistant, data: dict) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data=data, title="BMS Regulátor", version=1, minor_version=2)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_sensors_take_precedence_over_weather(
    hass: HomeAssistant, weather: WeatherMock, thermostat_calls: list,
) -> None:
    set_inputs(hass)
    _set_sensors(hass)
    entry = await _setup(hass, {**DATA, **SENSORS})
    reg = entry.runtime_data
    assert reg.values["actual_wind"] == pytest.approx(18.0)       # 5 m/s → km/h
    assert reg.values["actual_rain"] == pytest.approx(2.5, abs=0.1)  # 0.1 in/h → mm/h
    assert reg.values["actual_humidity"] == pytest.approx(70)     # z entity počasí
    assert reg.influence_sources == {"wind": "sensor", "rain": "sensor", "humidity": "weather", "clouds": "weather"}
    snap = reg.snapshot()
    assert snap["inputs"]["wind_sensor"] == "sensor.vitr" and snap["inputs"]["sources"]["wind"] == "sensor"

    # změna senzoru spustí přepočet zobrazení
    _set_sensors(hass, wind="10")
    await reg._async_display_recompute()
    assert reg.values["actual_wind"] == pytest.approx(36.0)

    # nedostupný senzor → hodnota z entity počasí a oprava v Opravách
    hass.states.async_remove("sensor.vitr")
    await reg.async_recompute()
    assert reg.influence_sources["wind"] == "weather"
    assert ir.async_get(hass).async_get_issue(DOMAIN, "missing_wind_sensor") is not None
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_sensors_without_weather_entity(hass: HomeAssistant, thermostat_calls: list) -> None:
    set_inputs(hass)
    _set_sensors(hass)
    hass.states.async_set("sensor.vlhkost", "85", {"unit_of_measurement": "%"})
    data = {"target_thermostat": "climate.kotel", "outdoor_sensor": "sensor.venku",
            **SENSORS, "humidity_sensor": "sensor.vlhkost"}
    entry = await _setup(hass, data)
    reg = entry.runtime_data
    assert reg.available
    assert reg.values["actual_humidity"] == pytest.approx(85)
    assert reg.influence_sources["clouds"] == "none"
    assert "forecast" not in reg.problems
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_config_flow_optional_weather_and_reconfigure_removes_cleared(
    hass: HomeAssistant, weather: WeatherMock, thermostat_calls: list,
) -> None:
    set_inputs(hass)
    _set_sensors(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    user = {"target_thermostat": "climate.kotel", "outdoor_sensor": "sensor.venku", **SENSORS}
    result = await hass.config_entries.flow.async_configure(result["flow_id"], user)
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert "weather_entity" not in result["data"]
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "reconfigure", "entry_id": entry.entry_id})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {
        "target_thermostat": "climate.kotel", "outdoor_sensor": "sensor.venku",
        "weather_entity": "weather.doma", "wind_sensor": "sensor.vitr",
    })
    assert result["type"] is FlowResultType.ABORT and result["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    assert entry.data["weather_entity"] == "weather.doma"
    assert entry.data["wind_sensor"] == "sensor.vitr"
    assert "rain_sensor" not in entry.data
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
