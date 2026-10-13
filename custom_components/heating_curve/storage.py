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
    LEGACY_PROFILE_NAMES,
    LEGACY_PROFILES_KEY,
    STORE_KEY,
    STORE_MINOR_VERSION,
    STORE_VERSION,
)
from .settings import PROFILE_KEYS, coerce_setting, legacy_key, migrate_settings

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
        "default_profile": DEFAULT_PROFILE,
        "starred": list(DEFAULT_STARRED),
        "schedules": [],
        "schedule_rule": None,
        "boost": {"active": False},
        "calc_log": [],
        "clamp_log": [],
        "history": [],
        "temp_history": [],
    }


def migrate_legacy_profile(raw: dict[str, Any]) -> dict[str, Any]:
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


def migrate_profile_names(data: dict[str, Any]) -> None:
    """0.6: výchozí profily mají anglické názvy (přejmenuje jen ty, které nekolidují)."""
    profiles = data.get("profiles") or {}
    names = {
        old: new for old, new in LEGACY_PROFILE_NAMES.items()
        if new == DEFAULT_PROFILE or (old in profiles and new not in profiles)
    }
    for old, new in names.items():
        if old in profiles:
            profiles[new] = profiles.pop(old)
    active = data.get("active_profile") or DEFAULT_PROFILE
    data["active_profile"] = names.get(active, active)
    data["starred"] = [names.get(n, n) for n in data.get("starred") or []]
    for rule in data.get("schedules") or []:
        if isinstance(rule, dict) and "profile" in rule:
            rule["profile"] = names.get(rule["profile"], rule["profile"])


class _Store(Store[dict[str, Any]]):
    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any],
    ) -> dict[str, Any]:
        if old_minor_version < 2:  # 0.6: anglické klíče nastavení a názvy výchozích profilů
            old_data["settings"] = migrate_settings(old_data.get("settings") or {})
            for profile in (old_data.get("profiles") or {}).values():
                if isinstance(profile, dict):
                    profile["settings"] = migrate_settings(profile.get("settings") or {})
            migrate_profile_names(old_data)
        return old_data


class BMSStore:
    """Jeden JSON soubor `.storage/heating_curve.data`, se zpětnou migrací ze starých souborů."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = _Store(hass, STORE_VERSION, STORE_KEY, minor_version=STORE_MINOR_VERSION)
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
                name: migrate_legacy_profile(raw)
                for name, raw in profiles_raw.items()
                if not name.startswith("__") and isinstance(raw, dict)
            }
            data["active_profile"] = profiles_raw.get("__active_profile__", DEFAULT_PROFILE)
            data["starred"] = list(profiles_raw.get("__starred__", DEFAULT_STARRED))
            data["schedules"] = list(profiles_raw.get("__schedules__", []))
            migrate_profile_names(data)
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
