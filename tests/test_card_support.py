"""Testy doplňků pro kartu: simulace, změny profilu, události, možnosti integrace."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.heating_curve import websocket

from .conftest import DOMAIN


def _reg(entry: MockConfigEntry) -> Any:
    return entry.runtime_data


async def test_simulate(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    reg = _reg(setup_integration)
    await reg.async_set_curve([{"x": -20, "y": 60}, {"x": 20, "y": 30}])
    reg.async_set_setting("limit_max", 80)
    result = reg.simulate(-20)
    assert result["curve_temp"] == pytest.approx(60)
    alt = reg.simulate(0, [{"x": -20, "y": 50}, {"x": 20, "y": 30}])
    assert alt["curve_temp"] == pytest.approx(40)

    connection = MagicMock()
    websocket.ws_simulate(hass, connection, {"id": 1, "type": "heating_curve/simulate", "outdoor": 20})
    assert connection.send_result.call_args[0][1]["curve_temp"] == pytest.approx(30)


async def test_profile_modified_and_snapshot(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    reg = _reg(setup_integration)
    await hass.services.async_call(DOMAIN, "load_profile", {"name": "Zima"}, blocking=True)
    assert reg.snapshot()["profile_modified"] is False
    await reg.async_set_curve([{"x": -20, "y": 70}, {"x": 20, "y": 25}])
    assert reg.snapshot()["profile_modified"] is True
    await hass.services.async_call(DOMAIN, "save_profile", {"name": "Zima"}, blocking=True)
    snap = reg.snapshot()
    assert snap["profile_modified"] is False
    assert snap["thermostat"]["entity_id"] == "climate.kotel"
    assert snap["inputs"]["weather"] == "weather.doma"
    kinds = [e["kind"] for e in snap["next_events"]]
    assert "recalc" in kinds and ("night_start" in kinds or "day_start" in kinds)


async def test_boost_records_start_and_duration(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    reg = _reg(setup_integration)
    await hass.services.async_call(DOMAIN, "activate_boost", {"amount": 2, "hours": 1.5}, blocking=True)
    boost = reg.data["boost"]
    assert boost["hours"] == 1.5 and boost["until"] - boost["since"] == pytest.approx(5400, abs=1)
    assert "boost_end" in [e["kind"] for e in reg.snapshot()["next_events"]]
    assert any(e.get("event") == "boost_start" and e.get("ts") for e in reg.data["calc_log"])


async def test_options_flow(hass: HomeAssistant, setup_integration: MockConfigEntry) -> None:
    result = await hass.config_entries.options.async_init(setup_integration.entry_id)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "limit_min": 28, "limit_max": 50, "safe_temp": -2, "safe_curve_temp": 38,
        "prepocet_rezim": "oboji", "prepocet_interval": 15, "prepocet_delta": 1,
        "pouziti_predpovedi": True, "predpoved_hodin": 6,
    })
    assert result["type"] is FlowResultType.CREATE_ENTRY
    reg = _reg(setup_integration)
    assert reg.settings["limit_max"] == 50 and reg.settings["prepocet_rezim"] == "oboji"
    assert hass.states.get("number.bms_limit_max").state == "50.0"
