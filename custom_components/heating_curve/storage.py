"""Trvalé úložiště regulátoru (profily, plány, křivka, nastavení, boost, logy, historie)."""

from __future__ import annotations

import copy
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store

from .const import (
    DEFAULT_CURVE_POINTS,
    DEFAULT_PROFILE,
    DEFAULT_SEASONAL_PROFILES,
    DEFAULT_STARRED,
    LEGACY_CURVE_KEY,
    LEGACY_PROFILES_KEY,
    STORE_KEY,
    STORE_VERSION,
)
from .settings import PROFILE_KEYS, coerce_setting, legacy_key

_LOGGER = logging.getLogger(__name__)

SAVE_DELAY = 10  # s — odložený zápis logů a historie


def _empty_data() -> dict[str, Any]:
    return {
        "settings": {},
        "curve": copy.deepcopy(DEFAULT_CURVE_POINTS),
        "profiles": {
            name: {"settings": {}, "curve": copy.deepcopy(points)}
            for name, points in DEFAULT_SEASONAL_PROFILES.items()
        },
        "active_profile": DEFAULT_PROFILE,
        "starred": list(DEFAULT_STARRED),
        "schedules": [],
        "schedule_rule": None,
        "boost": {"active": False},
        "calc_log": [],
        "clamp_log": [],
        "history": [],
        "temp_history": [],
    }


def _migrate_legacy_profile(raw: dict[str, Any]) -> dict[str, Any]:
    settings: dict[str, Any] = {}
    for entity_id, value in raw.items():
        if entity_id.startswith("__"):
            continue
        key = legacy_key(entity_id)
        if key is None or key not in PROFILE_KEYS:
            continue
        try:
            settings[key] = coerce_setting(key, value)
        except (TypeError, ValueError):
            continue
    curve = raw.get("__curve_points__") or []
    return {"settings": settings, "curve": [{"x": float(p["x"]), "y": float(p["y"])} for p in curve]}


class BMSStore:
    """Jeden JSON soubor `.storage/heating_curve.data`, se zpětnou migrací ze starých souborů."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self.data: dict[str, Any] = _empty_data()
        self.ok = True

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored is None:
            stored = await self._async_migrate_legacy()
            self.data = stored
            await self.async_save()
            return
        data = _empty_data()
        data.update(stored)
        self.data = data

    async def _async_migrate_legacy(self) -> dict[str, Any]:
        data = _empty_data()
        profiles_raw = await Store[dict[str, Any]](self._hass, 1, LEGACY_PROFILES_KEY).async_load()
        curve_raw = await Store[dict[str, Any]](self._hass, 1, LEGACY_CURVE_KEY).async_load()
        if not profiles_raw and not curve_raw:
            return data

        _LOGGER.info("BMS: Migruji data ze starého formátu úložiště.")
        if curve_raw and len(curve_raw.get("points") or []) >= 2:
            data["curve"] = [{"x": float(p["x"]), "y": float(p["y"])} for p in curve_raw["points"]]
        if profiles_raw:
            data["profiles"] = {
                name: _migrate_legacy_profile(raw)
                for name, raw in profiles_raw.items()
                if not name.startswith("__") and isinstance(raw, dict)
            }
            data["active_profile"] = profiles_raw.get("__active_profile__", DEFAULT_PROFILE)
            data["starred"] = list(profiles_raw.get("__starred__", DEFAULT_STARRED))
            data["schedules"] = list(profiles_raw.get("__schedules__", []))
        return data

    async def async_save(self) -> bool:
        try:
            await self._store.async_save(self.data)
        except (OSError, HomeAssistantError) as err:
            _LOGGER.error("BMS: Zápis úložiště selhal: %s", err)
            self.ok = False
            return False
        self.ok = True
        return True

    def async_delay_save(self) -> None:
        self._store.async_delay_save(lambda: self.data, SAVE_DELAY)
