"""Definice nastavení regulátoru — jediný zdroj pravdy pro entity number/switch/select."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .const import INFLUENCES, MODE_TIME, RECALC_MODES, SUN_MODE_WINDOW, SUN_MODES


@dataclass(frozen=True, slots=True)
class NumberSetting:
    key: str
    min: float
    max: float
    step: float
    default: float
    unit: str | None = None
    in_profile: bool = True


@dataclass(frozen=True, slots=True)
class SwitchSetting:
    key: str
    default: bool
    in_profile: bool = True


@dataclass(frozen=True, slots=True)
class SelectSetting:
    key: str
    options: tuple[str, ...]
    default: str
    in_profile: bool = False


_C, _H = "°C", "h"

NUMBER_SETTINGS: tuple[NumberSetting, ...] = (
    NumberSetting("safe_temp",               -30, 30,  0.5, 0.0,  _C, in_profile=False),
    NumberSetting("outdoor_range_min",       -30, 29,  1,   -20,  _C, in_profile=False),
    NumberSetting("outdoor_range_max",       -29, 30,  1,   20,   _C, in_profile=False),
    NumberSetting("limit_min",               10,  89,  0.5, 25.0, _C, in_profile=False),
    NumberSetting("limit_max",               11,  90,  0.5, 42.0, _C, in_profile=False),
    NumberSetting("curve_forecast_hours",    1,   72,  1,   24,   _H),
    NumberSetting("wind_forecast_hours",     1,   48,  1,   6,    _H),
    NumberSetting("rain_forecast_hours",     1,   48,  1,   6,    _H),
    NumberSetting("humidity_forecast_hours", 1,   48,  1,   6,    _H),
    NumberSetting("clouds_forecast_hours",   1,   48,  1,   6,    _H),
    NumberSetting("sun_forecast_hours",      1,   48,  1,   6,    _H),
    NumberSetting("frost_threshold",         -20, 5,   0.5, -5.0, _C),
    NumberSetting("frost_min_heat",          20,  60,  0.5, 35.0, _C),
    NumberSetting("night_offset",            -15, 15,  0.5, -5.0, _C),
    NumberSetting("day_start",               0,   23,  1,   6,    _H),
    NumberSetting("day_end",                 0,   23,  1,   22,   _H),
    NumberSetting("night_forecast_extra",    0,   12,  1,   0,    _H),
    NumberSetting("boost_amount",            0.5, 20,  0.5, 5.0,  _C),
    NumberSetting("boost_hours",             0.5, 24,  0.5, 2.0,  _H),
    NumberSetting("reduction_amount",        0.5, 20,  0.5, 5.0,  _C),
    NumberSetting("reduction_hours",         0.5, 24,  0.5, 2.0,  _H),
    *(
        setting
        for key, cfg in INFLUENCES.items()
        for setting in (
            NumberSetting(f"{key}_from",       0,   cfg["to"], 1,   cfg["from"], cfg["unit"]),
            NumberSetting(f"{key}_to",         1,   200,       1,   cfg["to"],   cfg["unit"]),
            NumberSetting(f"{key}_max_effect", 0.0, 20.0,      0.1, cfg["max"],  _C),
        )
    ),
    NumberSetting("solar_window_start",      0,   359, 1,   140,  "°"),
    NumberSetting("solar_window_end",        1,   360, 1,   220,  "°"),
    NumberSetting("sun_orientation",         0,   359, 1,   180,  "°"),
    NumberSetting("sun_max_effect",          -10, 0,   0.1, -2.0, _C),
    NumberSetting("recalc_interval",         1,   120, 1,   30,   "min", in_profile=False),
    NumberSetting("recalc_delta",            0.1, 5,   0.1, 0.5,  _C, in_profile=False),
    NumberSetting("summer_bypass_temp",      5,   30,  0.5, 18.0, _C, in_profile=False),
    NumberSetting("safe_curve_outdoor",      -20, 30,  0.5, 0.0,  _C),
    NumberSetting("safe_curve_temp",         10,  90,  0.5, 40.0, _C),
)

SWITCH_SETTINGS: tuple[SwitchSetting, ...] = (
    SwitchSetting("main_switch",        False, in_profile=False),
    SwitchSetting("curve_forecast",     False),
    SwitchSetting("influence_wind",     True),
    SwitchSetting("influence_rain",     True),
    SwitchSetting("influence_humidity", True),
    SwitchSetting("influence_clouds",   True),
    SwitchSetting("influence_sun",      True),
    SwitchSetting("frost_protection",   True),
    SwitchSetting("night_mode",         True),
    SwitchSetting("summer_bypass",      False, in_profile=False),
    SwitchSetting("wind_forecast",      False),
    SwitchSetting("rain_forecast",      False),
    SwitchSetting("humidity_forecast",  False),
    SwitchSetting("clouds_forecast",    False),
    SwitchSetting("sun_forecast",       False),
)

SELECT_SETTINGS: tuple[SelectSetting, ...] = (
    SelectSetting("recalc_mode", tuple(RECALC_MODES), MODE_TIME),
    SelectSetting("sun_mode", tuple(SUN_MODES), SUN_MODE_WINDOW, in_profile=True),
)

ALL_SETTINGS: dict[str, NumberSetting | SwitchSetting | SelectSetting] = {
    s.key: s for s in (*NUMBER_SETTINGS, *SWITCH_SETTINGS, *SELECT_SETTINGS)
}
PROFILE_KEYS = frozenset(k for k, s in ALL_SETTINGS.items() if s.in_profile)

_LEGACY_IDS = {"vitr": "wind", "srazky": "rain", "vlhkost": "humidity", "oblacnost": "clouds", "slunce": "sun"}
_LEGACY_SUFFIXES = {"od": "from", "do": "to", "max_eff": "max_effect", "predpoved": "forecast",
                    "predpoved_hodin": "forecast_hours"}
# České klíče nastavení do verze 0.5 → současné
LEGACY_KEYS: dict[str, str] = {
    "pouziti_predpovedi": "curve_forecast",
    "predpoved_hodin": "curve_forecast_hours",
    "hlavni_vypinac": "main_switch",
    "rozsah_venku_min": "outdoor_range_min",
    "rozsah_venku_max": "outdoor_range_max",
    "solarni_start": "solar_window_start",
    "solarni_konec": "solar_window_end",
    "slunce_orientace": "sun_orientation",
    "slunce_rezim": "sun_mode",
    "prepocet_rezim": "recalc_mode",
    "prepocet_interval": "recalc_interval",
    "prepocet_delta": "recalc_delta",
    "letni_bypass": "summer_bypass",
    "letni_bypass_temp": "summer_bypass_temp",
    **{f"vliv_{old}": f"influence_{new}" for old, new in _LEGACY_IDS.items()},
    **{
        f"{old}_{suffix}": f"{new}_{repl}"
        for old, new in _LEGACY_IDS.items() for suffix, repl in _LEGACY_SUFFIXES.items()
        if f"{new}_{repl}" in ALL_SETTINGS
    },
}
LEGACY_OPTIONS = {
    "cas": "time", "teplota": "temperature", "oboji": "both",
    "okno": "window", "fasada": "facade", "nad_obzorem": "daylight",
}


def migrate_settings(settings: dict[str, Any]) -> dict[str, Any]:
    """Přejmenuje české klíče a volby z verze 0.5 a starší."""
    out: dict[str, Any] = {}
    for old_key, value in settings.items():
        key = LEGACY_KEYS.get(old_key, old_key)
        if isinstance(ALL_SETTINGS.get(key), SelectSetting) and isinstance(value, str):
            value = LEGACY_OPTIONS.get(value, value)
        out[key] = value
    return out


def default_settings() -> dict[str, Any]:
    return {k: s.default for k, s in ALL_SETTINGS.items()}


def coerce_setting(key: str, value: Any) -> Any:
    """Převede hodnotu (i z uloženého stavu entity) na správný typ, jinak ValueError."""
    setting = ALL_SETTINGS[key]
    if isinstance(setting, NumberSetting):
        number = float(value)
        return max(setting.min, min(setting.max, number))
    if isinstance(setting, SwitchSetting):
        if isinstance(value, str):
            return value == "on"
        return bool(value)
    if value not in setting.options:
        raise ValueError(f"Neplatná volba {value!r} pro {key}")
    return value


def legacy_key(entity_id: str) -> str | None:
    """Převede staré entity_id z profilu (number.bms_vitr_od) na klíč nastavení."""
    _, _, object_id = entity_id.partition(".")
    key = object_id.removeprefix("bms_")
    key = LEGACY_KEYS.get(key, key)
    return key if key in ALL_SETTINGS else None
