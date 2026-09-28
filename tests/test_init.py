"""Integrační testy regulátoru, služeb, websocketu a config flow."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from unittest.mock import MagicMock

import pytest

from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import HomeAssistant, State
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    mock_restore_cache,
)

from custom_components.heating_curve import websocket
from custom_components.heating_curve.diagnostics import async_get_config_entry_diagnostics

from .conftest import DATA, DOMAIN, WeatherMock, set_inputs


def _reg(entry: MockConfigEntry) -> Any:
    return entry.runtime_data


async def _set(hass: HomeAssistant, domain: str, key: str, value: Any) -> None:
    if domain == "switch":
        await hass.services.async_call("switch", "turn_on" if value else "turn_off",
                                       {"entity_id": f"switch.bms_{key}"}, blocking=True)
    elif domain == "select":
        await hass.services.async_call("select", "select_option",
                                       {"entity_id": f"select.bms_{key}", "option": value}, blocking=True)
    else:
        await hass.services.async_call("number", "set_value",
                                       {"entity_id": f"number.bms_{key}", "value": value}, blocking=True)


async def test_setup_entities_and_card(hass: HomeAssistant, setup_integration: MockConfigEntry, mock_frontend) -> None:
    entry = setup_integration
    assert entry.state is ConfigEntryState.LOADED
    assert mock_frontend.call_args[0][1].startswith("/heating_curve/bms-master-card.js?v=")
    for entity_id in ("number.bms_limit_min", "switch.bms_hlavni_vypinac", "select.bms_profil_krivky",
                      "select.bms_prepocet_rezim", "sensor.bms_calc_temp", "sensor.bms_influences_log",
                      "binary_sensor.bms_problem", "sensor.bms_actual_wind"):
        assert hass.states.get(entity_id) is not None, entity_id
    calc_state = hass.states.get("sensor.bms_calc_temp")
    assert calc_state.state == "42.0"  # křivka 3.5 °C → ~41 + korekce, limit 42
    assert calc_state.attributes["friendly_name"] == "BMS Regulátor Resulting temperature"  # testy běží v en
    assert hass.states.get("select.bms_profil_krivky").attributes["options"][:1] == ["Výchozí"]
    assert hass.states.get("number.bms_limit_min").attributes["unit_of_measurement"] == "°C"


async def test_thermostat_write_step_and_unchanged(
    hass: HomeAssistant, setup_integration: MockConfigEntry, thermostat_calls: list,
) -> None:
    assert thermostat_calls == []  # hlavní vypínač je ve výchozím stavu vypnutý
    await _set(hass, "number", "limit_max", 60)
    await _set(hass, "switch", "hlavni_vypinac", True)
    resp = await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True, return_response=True)
    assert resp["status"] == "ok"
    assert len(thermostat_calls) == 1
    value = thermostat_calls[0].data["temperature"]
    assert value * 2 == int(value * 2)  # krok 0,5

    hass.states.async_set("climate.kotel", "heat", {"temperature": value, "min_temp": 20, "max_temp": 60,
                                                    "target_temp_step": 0.5})
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    assert len(thermostat_calls) == 1
    assert _reg(setup_integration).last_write["status"] == "unchanged"
    assert _reg(setup_integration).data["calc_log"][0]["thermostat"] == "unchanged"

    hass.states.async_set("climate.kotel", "off", {"temperature": 30})
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    assert len(thermostat_calls) == 1
    assert _reg(setup_integration).last_write["status"] == "off"


async def test_temperature_mode_hysteresis(
    hass: HomeAssistant, setup_integration: MockConfigEntry, thermostat_calls: list,
) -> None:
    await _set(hass, "number", "limit_max", 90)
    await _set(hass, "select", "prepocet_rezim", "teplota")
    await _set(hass, "switch", "hlavni_vypinac", True)
    hass.states.async_set("climate.kotel", "heat", {"temperature": None, "target_temp_step": 0.5})
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    calls = len(thermostat_calls)

    set_inputs(hass, outdoor=3.6, thermostat_temp=None)  # změna 0,1 °C < delta 0,5
    await hass.async_block_till_done()
    assert len(thermostat_calls) == calls

    set_inputs(hass, outdoor=1.0, thermostat_temp=None)  # změna 2,5 °C
    await hass.async_block_till_done()
    assert len(thermostat_calls) == calls + 1

    # periodický přepočet v režimu „teplota“ termostat nenastavuje
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=31))
    await hass.async_block_till_done()
    assert len(thermostat_calls) == calls + 1


async def test_per_influence_forecast_and_units(
    hass: HomeAssistant, setup_integration: MockConfigEntry, weather: WeatherMock,
) -> None:
    reg = _reg(setup_integration)
    set_inputs(hass, wind=10, wind_unit="m/s")
    await hass.async_block_till_done()
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    assert reg.values["actual_wind"] == pytest.approx(36.0)

    points = {h: {"temperature": 4, "wind_speed": 5, "precipitation": 2, "humidity": 70, "cloud_coverage": 50}
              for h in range(49)}
    for hour in (3, 4):  # nejbližší bod k +3 h podle aktuální minuty
        points[hour] = {**points[hour], "wind_speed": 20}   # 72 km/h
    weather.set_hourly(points)
    await _set(hass, "number", "vitr_predpoved_hodin", 3)
    await _set(hass, "switch", "vitr_predpoved", True)
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    assert reg.values["forecast_wind"] == pytest.approx(72.0)
    assert reg.result.corr_wind == pytest.approx(5.0)  # plný účinek, jen díky předpovědi +3 h
    assert reg.values["actual_rain"] == pytest.approx(2.0)  # srážky z nejbližší hodiny předpovědi


async def test_boost_defaults_and_expiry(
    hass: HomeAssistant, setup_integration: MockConfigEntry,
) -> None:
    reg = _reg(setup_integration)
    events = async_capture_events(hass, "heating_curve_boost_expired")
    await _set(hass, "number", "reduction_amount", 3)
    await _set(hass, "number", "reduction_hours", 0.5)
    await hass.services.async_call(DOMAIN, "activate_reduction", {}, blocking=True)
    assert reg.boost_amount == -3
    assert hass.states.get("sensor.bms_boost_status").state == "reduction"

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=31))
    await hass.async_block_till_done()
    assert reg.boost_amount == 0
    assert len(events) == 1 and events[0].data["kind"] == "reduction_expired"
    assert any(e.get("event") == "reduction_expired" for e in reg.data["calc_log"])


async def test_profiles(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    reg = _reg(setup_integration)
    await _set(hass, "number", "night_offset", -3)
    await hass.services.async_call(DOMAIN, "save_profile", {"name": "Test"}, blocking=True)
    assert "Test" in hass.states.get("select.bms_profil_krivky").attributes["options"]

    await hass.services.async_call(DOMAIN, "load_profile", {"name": "Zima"}, blocking=True)
    assert hass.states.get("select.bms_profil_krivky").state == "Zima"
    assert reg.data["curve"][0]["y"] == 75

    await _set(hass, "number", "night_offset", -8)
    await _set(hass, "select", "profil_krivky", "Test")
    assert hass.states.get("number.bms_night_offset").state == "-3.0"

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "load_profile", {"name": "Neexistuje"}, blocking=True)

    await hass.services.async_call(DOMAIN, "set_starred", {"starred": ["Test", "Neexistuje"]}, blocking=True)
    assert reg.data["starred"] == ["Test"]
    await hass.services.async_call(DOMAIN, "rename_profile", {"name": "Test", "new_name": "Test2"}, blocking=True)
    assert hass.states.get("select.bms_profil_krivky").state == "Test2"
    assert reg.data["starred"] == ["Test2"]
    await hass.services.async_call(DOMAIN, "delete_profile", {"name": "Test2"}, blocking=True)
    assert hass.states.get("select.bms_profil_krivky").state == "Výchozí"
    assert reg.data["starred"] == []


async def test_schedule_respects_manual_choice(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    today = dt_util.now().strftime("%m-%d")
    await hass.services.async_call(DOMAIN, "save_schedule", {
        "type": "date", "profile": "Zima", "date_from": today, "date_to": today,
    }, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("select.bms_profil_krivky").state == "Zima"

    await hass.services.async_call(DOMAIN, "load_profile", {"name": "Léto"}, blocking=True)
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("select.bms_profil_krivky").state == "Léto"


async def test_curve_services(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    await hass.services.async_call(DOMAIN, "set_curve_points",
                                   {"points": [{"x": 20, "y": 25}, {"x": -20, "y": 60}]}, blocking=True)
    resp = await hass.services.async_call(DOMAIN, "get_curve_points", {}, blocking=True, return_response=True)
    assert resp == {"points": [{"x": -20.0, "y": 60.0}, {"x": 20.0, "y": 25.0}], "storage_ok": True}
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "set_curve_points", {"points": [{"x": 1, "y": 2}]}, blocking=True)
    # změna limitů už body křivky nepřepisuje
    await _set(hass, "number", "limit_max", 30)
    assert _reg(setup_integration).data["curve"][0]["y"] == 60.0


async def test_websocket(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    connection = MagicMock()
    connection.subscriptions = {}
    websocket.ws_get_state(hass, connection, {"id": 1, "type": "heating_curve/state"})
    snapshot = connection.send_result.call_args[0][1]
    assert snapshot["entities"]["number.limit_min"] == "number.bms_limit_min"
    assert snapshot["settings"]["limit_max"] == 42

    websocket.ws_subscribe(hass, connection, {"id": 2, "type": "heating_curve/subscribe"})
    assert 2 in connection.subscriptions
    sent = connection.send_message.call_count
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    assert connection.send_message.call_count > sent
    connection.subscriptions[2]()


async def test_websocket_settings_export_import(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    reg = _reg(setup_integration)
    connection = MagicMock()
    websocket.ws_set_setting(hass, connection, {"id": 1, "type": "heating_curve/set_setting",
                                                "key": "night_offset", "value": -4})
    assert connection.send_result.call_args[0][1] == {"value": -4.0}
    assert hass.states.get("number.bms_night_offset").state == "-4.0"
    websocket.ws_set_setting(hass, connection, {"id": 2, "type": "heating_curve/set_setting",
                                                "key": "neexistuje", "value": 1})
    connection.send_error.assert_called_once()

    await hass.services.async_call(DOMAIN, "save_profile", {"name": "Export"}, blocking=True)
    websocket.ws_export(hass, connection, {"id": 3, "type": "heating_curve/export"})
    exported = connection.send_result.call_args[0][1]
    assert exported["profiles"]["Export"]["settings"]["night_offset"] == -4.0

    exported["profiles"] = {"Import": exported["profiles"]["Export"],
                            "Stary": {"number.bms_night_offset": "-1", "__curve_points__": []}}
    names = await reg.async_import_data(exported)
    assert names == ["Import", "Stary"]
    assert reg.data["profiles"]["Stary"]["settings"] == {"night_offset": -1.0}
    with pytest.raises(ValueError):
        await reg.async_import_data({"nic": 1})


async def test_missing_thermostat_repair_and_diagnostics(
    hass: HomeAssistant, setup_integration: MockConfigEntry,
) -> None:
    hass.states.async_remove("climate.kotel")
    await hass.services.async_call(DOMAIN, "force_refresh", {}, blocking=True)
    assert ir.async_get(hass).async_get_issue(DOMAIN, "missing_thermostat") is not None
    diag = await async_get_config_entry_diagnostics(hass, setup_integration)
    assert diag["settings"]["limit_max"] == 42 and diag["available"]


async def test_legacy_migration(
    hass: HomeAssistant, hass_storage: dict[str, Any], weather: WeatherMock, thermostat_calls: list,
) -> None:
    hass_storage["heating_curve_profiles"] = {"version": 1, "key": "heating_curve_profiles", "data": {
        "Moje": {"number.bms_night_offset": "-2.5", "switch.bms_vliv_vitr": "off",
                 "number.bms_limit_min": "30", "__curve_points__": [{"x": -10, "y": 60}, {"x": 10, "y": 30}]},
        "__active_profile__": "Moje", "__starred__": ["Moje"], "__schedules__": [],
    }}
    hass_storage["heating_curve_curve"] = {"version": 1, "key": "heating_curve_curve", "data": {
        "points": [{"x": -15, "y": 65}, {"x": 15, "y": 28}], "storage_ok": True,
    }}
    mock_restore_cache(hass, [State("number.bms_limit_min", "31.5")])
    set_inputs(hass)
    entry = MockConfigEntry(domain=DOMAIN, data={**DATA, "sun_entity": "sun.sun"}, version=1, minor_version=1)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    reg = entry.runtime_data
    assert "sun_entity" not in entry.data and entry.minor_version == 2
    assert reg.data["profiles"]["Moje"]["settings"] == {"night_offset": -2.5, "vliv_vitr": False}
    assert reg.data["curve"][0] == {"x": -15.0, "y": 65.0}
    assert hass.states.get("select.bms_profil_krivky").state == "Moje"
    assert reg.settings["limit_min"] == 31.5  # z obnoveného stavu entity
    assert reg.data["starred"] == ["Moje"]
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_config_flow_single_instance_and_reconfigure(hass: HomeAssistant, weather: WeatherMock) -> None:
    set_inputs(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], DATA)
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.ABORT and result["reason"] == "single_instance_allowed"

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "reconfigure", "entry_id": entry.entry_id})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {**DATA, "outdoor_sensor": "sensor.jiny"})
    assert result["type"] is FlowResultType.ABORT and result["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    assert entry.data["outdoor_sensor"] == "sensor.jiny"
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
