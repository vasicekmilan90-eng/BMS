"""Diagnostika pro stažení z UI."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from . import HeatingCurveConfigEntry


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: HeatingCurveConfigEntry) -> dict[str, Any]:
    regulator = entry.runtime_data
    data = regulator.data
    return {
        "entry": {"data": dict(entry.data), "version": f"{entry.version}.{entry.minor_version}"},
        "available": regulator.available,
        "last_error": regulator.last_error,
        "problems": regulator.problems,
        "temp_source": regulator.temp_source,
        "settings": regulator.settings,
        "result": regulator.result.as_dict() if regulator.result else None,
        "values": regulator.values,
        "last_write": regulator.last_write,
        "boost": data["boost"],
        "curve": data["curve"],
        "active_profile": data["active_profile"],
        "profiles": sorted(data["profiles"]),
        "schedules": data["schedules"],
        "schedule_rule": data.get("schedule_rule"),
        "forecast_points": len(regulator.forecast),
        "history_points": len(data["history"]),
        "temp_history_points": len(data["temp_history"]),
        "calc_log": data["calc_log"][:5],
        "storage_ok": regulator.store.ok,
    }
