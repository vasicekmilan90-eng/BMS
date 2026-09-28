"""Definice nastavení regulátoru — jediný zdroj pravdy pro entity number/switch/select."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .const import INFLUENCES, MODE_TIME, RECALC_MODES


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
    NumberSetting("safe_temp",            -30, 30,  0.5, 0.0,  _C, in_profile=False),
    NumberSetting("rozsah_venku_min",     -30, 29,  1,   -20,  _C, in_profile=False),
    NumberSetting("rozsah_venku_max",     -29, 30,  1,   20,   _C, in_profile=False),
    NumberSetting("limit_min",            10,  89,  0.5, 25.0, _C, in_profile=False),
    NumberSetting("limit_max",            11,  90,  0.5, 42.0, _C, in_profile=False),
    NumberSetting("predpoved_hodin",      1,   72,  1,   24,   _H),
    NumberSetting("vitr_predpoved_hodin",      1, 48, 1, 6, _H),
    NumberSetting("srazky_predpoved_hodin",    1, 48, 1, 6, _H),
    NumberSetting("vlhkost_predpoved_hodin",   1, 48, 1, 6, _H),
    NumberSetting("oblacnost_predpoved_hodin", 1, 48, 1, 6, _H),
    NumberSetting("slunce_predpoved_hodin",    1, 48, 1, 6, _H),
    NumberSetting("frost_threshold",      -20, 5,   0.5, -5.0, _C),
    NumberSetting("frost_min_heat",       20,  60,  0.5, 35.0, _C),
    NumberSetting("night_offset",         -15, 0,   0.5, -5.0, _C),
    NumberSetting("day_start",            0,   23,  1,   6,    _H),
    NumberSetting("day_end",              0,   23,  1,   22,   _H),
    NumberSetting("boost_amount",         0.5, 20,  0.5, 5.0,  _C),
    NumberSetting("boost_hours",          0.5, 24,  0.5, 2.0,  _H),
    NumberSetting("reduction_amount",     0.5, 20,  0.5, 5.0,  _C),
    NumberSetting("reduction_hours",      0.5, 24,  0.5, 2.0,  _H),
    *(
        setting
        for key, cfg in INFLUENCES.items()
        for setting in (
            NumberSetting(f"{key}_od",      0,   cfg["to"], 1,   cfg["from"], cfg["unit"]),
            NumberSetting(f"{key}_do",      1,   200,       1,   cfg["to"],   cfg["unit"]),
            NumberSetting(f"{key}_max_eff", 0.0, 20.0,      0.1, cfg["max"],  _C),
        )
    ),
    NumberSetting("solarni_start",        0,   359, 1,   140,  "°"),
    NumberSetting("solarni_konec",        1,   360, 1,   220,  "°"),
    NumberSetting("slunce_max_eff",       -10, 0,   0.1, -2.0, _C),
    NumberSetting("prepocet_interval",    1,   120, 1,   30,   "min", in_profile=False),
    NumberSetting("prepocet_delta",       0.1, 5,   0.1, 0.5,  _C, in_profile=False),
    NumberSetting("letni_bypass_temp",    5,   30,  0.5, 18.0, _C, in_profile=False),
    NumberSetting("safe_curve_outdoor",   -20, 30,  0.5, 0.0,  _C),
    NumberSetting("safe_curve_temp",      10,  90,  0.5, 40.0, _C),
)

SWITCH_SETTINGS: tuple[SwitchSetting, ...] = (
    SwitchSetting("hlavni_vypinac",      False, in_profile=False),
    SwitchSetting("pouziti_predpovedi",  False),
    SwitchSetting("vliv_vitr",           True),
    SwitchSetting("vliv_srazky",         True),
    SwitchSetting("vliv_vlhkost",        True),
    SwitchSetting("vliv_oblacnost",      True),
    SwitchSetting("vliv_slunce",         True),
    SwitchSetting("frost_protection",    True),
    SwitchSetting("night_mode",          True),
    SwitchSetting("letni_bypass",        False, in_profile=False),
    SwitchSetting("vitr_predpoved",      False),
    SwitchSetting("srazky_predpoved",    False),
    SwitchSetting("vlhkost_predpoved",   False),
    SwitchSetting("oblacnost_predpoved", False),
)

SELECT_SETTINGS: tuple[SelectSetting, ...] = (
    SelectSetting("prepocet_rezim", tuple(RECALC_MODES), MODE_TIME),
)

ALL_SETTINGS: dict[str, NumberSetting | SwitchSetting | SelectSetting] = {
    s.key: s for s in (*NUMBER_SETTINGS, *SWITCH_SETTINGS, *SELECT_SETTINGS)
}
PROFILE_KEYS = frozenset(k for k, s in ALL_SETTINGS.items() if s.in_profile)


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
    return key if key in ALL_SETTINGS else None
