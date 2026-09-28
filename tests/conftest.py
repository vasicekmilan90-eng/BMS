"""Sdílené fixtures testů."""

from __future__ import annotations

import sys
from datetime import timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import custom_components.heating_curve  # noqa: E402,F401

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse  # noqa: E402
from homeassistant.util import dt as dt_util  # noqa: E402
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service  # noqa: E402

DOMAIN = "heating_curve"
DATA = {
    "target_thermostat": "climate.kotel",
    "outdoor_sensor": "sensor.venku",
    "weather_entity": "weather.doma",
}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    return


@pytest.fixture(autouse=True)
def mock_frontend(hass: HomeAssistant) -> Any:
    """Frontend a http v testech nejsou — stačí zachytit registraci karty."""
    hass.config.components.update({"frontend", "http", "websocket_api"})
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    with patch("custom_components.heating_curve.add_extra_js_url") as extra:
        yield extra


class WeatherMock:
    """Služba weather.get_forecasts s nastavitelnou předpovědí."""

    def __init__(self) -> None:
        self.forecast: list[dict[str, Any]] = []
        self.calls = 0

    def set_hourly(self, points: dict[int, dict[str, Any]]) -> None:
        now = dt_util.utcnow().replace(minute=0, second=0, microsecond=0)
        self.forecast = [
            {"datetime": (now + timedelta(hours=h)).isoformat(), **values}
            for h, values in sorted(points.items())
        ]

    async def handler(self, call: ServiceCall) -> dict[str, Any]:
        self.calls += 1
        entity_ids = call.data["entity_id"]
        if isinstance(entity_ids, str):
            entity_ids = [entity_ids]
        return {eid: {"forecast": self.forecast} for eid in entity_ids}


@pytest.fixture
def weather(hass: HomeAssistant) -> WeatherMock:
    mock = WeatherMock()
    mock.set_hourly({h: {"temperature": 4, "wind_speed": 20, "precipitation": 0, "humidity": 70,
                         "cloud_coverage": 50} for h in range(0, 49)})
    hass.services.async_register(
        "weather", "get_forecasts", mock.handler, supports_response=SupportsResponse.ONLY,
    )
    return mock


@pytest.fixture
def thermostat_calls(hass: HomeAssistant) -> list[ServiceCall]:
    return async_mock_service(hass, "climate", "set_temperature")


def set_inputs(hass: HomeAssistant, *, outdoor: float = 3.5, thermostat_temp: float | None = 40,
               wind_unit: str = "km/h", wind: float = 20) -> None:
    hass.states.async_set("sensor.venku", str(outdoor), {"unit_of_measurement": "°C"})
    hass.states.async_set("weather.doma", "cloudy", {
        "temperature": 4, "temperature_unit": "°C", "wind_speed": wind, "wind_speed_unit": wind_unit,
        "humidity": 70, "cloud_coverage": 50,
    })
    hass.states.async_set("climate.kotel", "heat", {
        "temperature": thermostat_temp, "min_temp": 20, "max_temp": 60, "target_temp_step": 0.5,
    })


@pytest.fixture
async def setup_integration(hass: HomeAssistant, weather: WeatherMock, thermostat_calls: list) -> MockConfigEntry:
    set_inputs(hass)
    entry = MockConfigEntry(domain=DOMAIN, data=DATA, title="BMS Regulátor", version=1, minor_version=2)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    yield entry
    if entry.state.recoverable:
        await hass.config_entries.async_unload(entry.entry_id)
        await hass.async_block_till_done()
