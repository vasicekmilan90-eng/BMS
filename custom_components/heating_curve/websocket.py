"""Websocket API pro kartu: jednorázový stav a odběr změn."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_get_state)
    websocket_api.async_register_command(hass, ws_subscribe)


def _find_regulator(hass: HomeAssistant, entry_id: str | None) -> Any:
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.state is ConfigEntryState.LOADED and entry_id in (None, entry.entry_id):
            return entry.runtime_data
    return None


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/state",
    vol.Optional("entry_id"): str,
})
@callback
def ws_get_state(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    regulator = _find_regulator(hass, msg.get("entry_id"))
    if regulator is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "BMS regulátor není načten")
        return
    connection.send_result(msg["id"], regulator.snapshot())


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/subscribe",
    vol.Optional("entry_id"): str,
})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    regulator = _find_regulator(hass, msg.get("entry_id"))
    if regulator is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "BMS regulátor není načten")
        return

    @callback
    def _forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], regulator.snapshot()))

    connection.subscriptions[msg["id"]] = regulator.async_add_listener(_forward)
    connection.send_result(msg["id"])
    _forward()
