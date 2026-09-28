"""Chytrý ekvitermní regulátor (BMS) pro Home Assistant."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from . import websocket
from .const import (
    CARD_FILENAME,
    CONF_SUN,
    DEFAULT_PROFILE,
    DOMAIN,
    EVENT_CURVE_RESPONSE,
    EVENT_FORCE_REFRESH_DONE,
    FRONTEND_URL_BASE,
    PLATFORMS,
)
from .coordinator import BMSRegulator

_LOGGER = logging.getLogger(__name__)

type HeatingCurveConfigEntry = ConfigEntry[BMSRegulator]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_NAME_SCHEMA = vol.Schema({vol.Required("name"): vol.All(cv.string, vol.Strip, vol.Length(min=1))})
_EMPTY_SCHEMA = vol.Schema({})
_AMOUNT_HOURS_SCHEMA = vol.Schema({
    vol.Optional("amount"): vol.All(vol.Coerce(float), vol.Range(min=0.5, max=20)),
    vol.Optional("hours"):  vol.All(vol.Coerce(float), vol.Range(min=0.5, max=24)),
})
SERVICE_SCHEMAS: dict[str, vol.Schema] = {
    "set_curve_points":   vol.Schema({vol.Required("points"): vol.All(cv.ensure_list, [dict])}),
    "get_curve_points":   _EMPTY_SCHEMA,
    "retry_storage":      _EMPTY_SCHEMA,
    "save_profile":       _NAME_SCHEMA,
    "load_profile":       _NAME_SCHEMA,
    "delete_profile":     _NAME_SCHEMA,
    "rename_profile":     vol.Schema({
        vol.Required("name"): cv.string,
        vol.Required("new_name"): vol.All(cv.string, vol.Strip, vol.Length(min=1), vol.NotIn([DEFAULT_PROFILE])),
    }),
    "activate_boost":     _AMOUNT_HOURS_SCHEMA,
    "activate_reduction": _AMOUNT_HOURS_SCHEMA,
    "cancel_boost":       _EMPTY_SCHEMA,
    "force_refresh":      _EMPTY_SCHEMA,
    "set_starred":        vol.Schema({vol.Required("starred"): vol.All(cv.ensure_list, [cv.string])}),
    "save_schedule":      vol.Schema({
        vol.Optional("id"):        cv.string,
        vol.Optional("enabled"):   cv.boolean,
        vol.Optional("type"):      vol.In(["date", "temp"]),
        vol.Optional("profile"):   cv.string,
        vol.Optional("date_from"): cv.string,
        vol.Optional("date_to"):   cv.string,
        vol.Optional("temp_op"):   vol.In(["<", ">"]),
        vol.Optional("temp_val"):  vol.Coerce(float),
        vol.Optional("temp_days"): vol.All(vol.Coerce(int), vol.Range(min=1, max=30)),
    }),
    "delete_schedule":    vol.Schema({vol.Required("id"): cv.string}),
    "reorder_schedules":  vol.Schema({vol.Required("order"): vol.All(cv.ensure_list, [cv.string])}),
}
_RESPONSE_SERVICES = {"get_curve_points", "force_refresh"}


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Zaregistruje kartu, služby a websocket API (jednou pro celou integraci)."""
    integration = await async_get_integration(hass, DOMAIN)
    await hass.http.async_register_static_paths([
        StaticPathConfig(FRONTEND_URL_BASE, str(Path(__file__).parent / "frontend"), cache_headers=False),
    ])
    add_extra_js_url(hass, f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={integration.version}")

    for service, handler in SERVICE_HANDLERS.items():
        hass.services.async_register(
            DOMAIN, service, handler,
            schema=SERVICE_SCHEMAS[service],
            supports_response=SupportsResponse.OPTIONAL if service in _RESPONSE_SERVICES else SupportsResponse.NONE,
        )
    websocket.async_register(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: HeatingCurveConfigEntry) -> bool:
    regulator = BMSRegulator(hass, entry)
    await regulator.async_setup()
    entry.runtime_data = regulator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def _async_start(_hass: HomeAssistant) -> None:
        await regulator.async_start()

    entry.async_on_unload(async_at_started(hass, _async_start))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: HeatingCurveConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await entry.runtime_data.async_stop()
    return unloaded


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """1.1 → 1.2: poloha slunce se počítá z polohy HA, entita slunce už není potřeba."""
    if entry.version > 1:
        return False
    if entry.minor_version < 2:
        data = {k: v for k, v in entry.data.items() if k != CONF_SUN}
        hass.config_entries.async_update_entry(entry, data=data, minor_version=2)
    return True


# ── Služby ─────────────────────────────────────────────────────────────────────
def _regulator(hass: HomeAssistant) -> BMSRegulator:
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.state is ConfigEntryState.LOADED:
            return entry.runtime_data
    raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")


async def _handle_set_curve_points(call: ServiceCall) -> None:
    await _regulator(call.hass).async_set_curve(call.data["points"])


async def _handle_get_curve_points(call: ServiceCall) -> ServiceResponse:
    regulator = _regulator(call.hass)
    response: dict[str, Any] = {"points": regulator.data["curve"], "storage_ok": regulator.store.ok}
    call.hass.bus.async_fire(EVENT_CURVE_RESPONSE, response)
    return response if call.return_response else None


async def _handle_retry_storage(call: ServiceCall) -> None:
    await _regulator(call.hass).async_retry_storage()


async def _handle_save_profile(call: ServiceCall) -> None:
    await _regulator(call.hass).async_save_profile(call.data["name"])


async def _handle_load_profile(call: ServiceCall) -> None:
    await _regulator(call.hass).async_load_profile(call.data["name"])


async def _handle_delete_profile(call: ServiceCall) -> None:
    await _regulator(call.hass).async_delete_profile(call.data["name"])


async def _handle_rename_profile(call: ServiceCall) -> None:
    await _regulator(call.hass).async_rename_profile(call.data["name"], call.data["new_name"])


async def _handle_set_starred(call: ServiceCall) -> None:
    await _regulator(call.hass).async_set_starred(call.data["starred"])


async def _handle_save_schedule(call: ServiceCall) -> None:
    await _regulator(call.hass).async_save_schedule(dict(call.data))


async def _handle_delete_schedule(call: ServiceCall) -> None:
    await _regulator(call.hass).async_delete_schedule(call.data["id"])


async def _handle_reorder_schedules(call: ServiceCall) -> None:
    await _regulator(call.hass).async_reorder_schedules(call.data["order"])


async def _handle_activate_boost(call: ServiceCall) -> None:
    await _regulator(call.hass).async_activate_boost(call.data.get("amount"), call.data.get("hours"), reduction=False)


async def _handle_activate_reduction(call: ServiceCall) -> None:
    await _regulator(call.hass).async_activate_boost(call.data.get("amount"), call.data.get("hours"), reduction=True)


async def _handle_cancel_boost(call: ServiceCall) -> None:
    await _regulator(call.hass).async_cancel_boost()


async def _handle_force_refresh(call: ServiceCall) -> ServiceResponse:
    regulator = _regulator(call.hass)
    weather_ok = await regulator.async_refresh_weather(force=True)
    calc_ok = await regulator.async_recompute(write=True, manual=True, reason="manual")
    status = "ok" if weather_ok and calc_ok else ("partial" if weather_ok or calc_ok else "error")
    response: dict[str, Any] = {
        "status": status,
        "weather_ok": weather_ok,
        "calc_ok": calc_ok,
        "time": dt_util.now().strftime("%d.%m %H:%M:%S"),
        "thermostat": regulator.last_write,
    }
    call.hass.bus.async_fire(EVENT_FORCE_REFRESH_DONE, response)
    return response if call.return_response else None


SERVICE_HANDLERS = {
    "set_curve_points":   _handle_set_curve_points,
    "get_curve_points":   _handle_get_curve_points,
    "retry_storage":      _handle_retry_storage,
    "save_profile":       _handle_save_profile,
    "load_profile":       _handle_load_profile,
    "delete_profile":     _handle_delete_profile,
    "rename_profile":     _handle_rename_profile,
    "activate_boost":     _handle_activate_boost,
    "activate_reduction": _handle_activate_reduction,
    "cancel_boost":       _handle_cancel_boost,
    "force_refresh":      _handle_force_refresh,
    "set_starred":        _handle_set_starred,
    "save_schedule":      _handle_save_schedule,
    "delete_schedule":    _handle_delete_schedule,
    "reorder_schedules":  _handle_reorder_schedules,
}
