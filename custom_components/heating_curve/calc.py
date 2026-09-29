"""Čisté výpočty regulátoru — bez závislosti na Home Assistant (snadno testovatelné)."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from typing import Any

from .const import INFLUENCES, SUN_MODE_DAYLIGHT, SUN_MODE_FACADE

Point = tuple[float, float]

SUN_ELEVATION_REF = 30.0  # ° — od této elevace má slunce plný účinek (režim okno)
SUN_HORIZON_RAMP = 10.0   # ° — u obzoru slunce slabé (atmosféra), plně od této elevace


def interpolate_curve(points: Sequence[Point], x: float) -> float:
    """Lineární interpolace topné křivky; mimo rozsah se použije krajní bod."""
    pts = sorted(points)
    if not pts:
        raise ValueError("Křivka nemá žádné body")
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if x1 <= x <= x2:
            if x2 == x1:
                return y1
            return y1 + (x - x1) / (x2 - x1) * (y2 - y1)
    return pts[-1][1]


def linear_influence(value: float, start: float, end: float, max_effect: float) -> float:
    """Korekce roste lineárně od `start` (0) do `end` (max_effect)."""
    if end <= start or value <= start:
        return 0.0
    if value >= end:
        return float(max_effect)
    return float(max_effect) * (value - start) / (end - start)


def sun_correction(
    elevation: float, azimuth: float, az_start: float, az_end: float,
    max_effect: float, clouds_pct: float,
) -> float:
    """Korekce slunce podle elevace, polohy v solárním okně a oblačnosti."""
    return float(max_effect) * window_factor(elevation, azimuth, az_start, az_end) * cloud_factor(clouds_pct)


def cloud_factor(clouds_pct: float) -> float:
    return max(0.0, 1.0 - clouds_pct / 100.0)


def window_factor(elevation: float, azimuth: float, az_start: float, az_end: float) -> float:
    """Pevné okno azimutu — východ a západ slunce se během roku posouvají, okno ne."""
    if elevation <= 0 or az_end <= az_start or not az_start <= azimuth <= az_end:
        return 0.0
    el_factor = min(1.0, elevation / SUN_ELEVATION_REF)
    center = (az_start + az_end) / 2.0
    half = (az_end - az_start) / 2.0
    return el_factor * max(0.0, math.cos((azimuth - center) / half * (math.pi / 2.0)))


def facade_factor(elevation: float, azimuth: float, orientation: float) -> float:
    """Úhel dopadu na svislá okna otočená na `orientation` — sedí po celý rok bez přenastavení."""
    if elevation <= 0:
        return 0.0
    delta = (azimuth - orientation + 180.0) % 360.0 - 180.0
    if abs(delta) >= 90.0:  # slunce za fasádou
        return 0.0
    incidence = math.cos(math.radians(elevation)) * math.cos(math.radians(delta))
    return incidence * min(1.0, elevation / SUN_HORIZON_RAMP)


def daylight_factor(elevation: float, noon_elevation: float | None) -> float:
    """Celá doba nad obzorem: 0 při východu a západu, 1 v dnešní poledne (v létě i v zimě)."""
    if elevation <= 0 or not noon_elevation or noon_elevation <= 0:
        return 0.0
    return min(1.0, math.sin(math.radians(elevation)) / math.sin(math.radians(noon_elevation)))


def sun_factor(
    mode: str, elevation: float, azimuth: float, settings: Mapping[str, Any], noon_elevation: float | None,
) -> float:
    """Podíl plného účinku slunce (0–1) bez vlivu oblačnosti."""
    if mode == SUN_MODE_FACADE:
        return facade_factor(elevation, azimuth, float(settings["slunce_orientace"]))
    if mode == SUN_MODE_DAYLIGHT:
        return daylight_factor(elevation, noon_elevation)
    return window_factor(elevation, azimuth, float(settings["solarni_start"]), float(settings["solarni_konec"]))


def is_night(hour: int, day_start: int, day_end: int) -> bool:
    if day_start <= day_end:
        return not day_start <= hour < day_end
    return not (hour >= day_start or hour < day_end)  # den přes půlnoc


def thermostat_value(target: float, step: float, t_min: float | None, t_max: float | None) -> float:
    """Zaokrouhlí na krok termostatu a udrží v jeho rozsahu."""
    step = step if step and step > 0 else 1.0
    value = round(target / step) * step
    if t_min is not None and value < t_min:
        value = math.ceil(t_min / step) * step
    if t_max is not None and value > t_max:
        value = math.floor(t_max / step) * step
    return round(value, 3)


def date_rule_matches(today_md: str, date_from: str, date_to: str) -> bool:
    if not date_from or not date_to:
        return False
    if date_from <= date_to:
        return date_from <= today_md <= date_to
    return today_md >= date_from or today_md <= date_to  # přes přelom roku


def temp_rule_matches(average: float | None, op: str, threshold: float) -> bool:
    if average is None:
        return False
    return average < threshold if op == "<" else average > threshold


def forecast_at(forecast: Sequence[Mapping[str, Any]], ts: float) -> Mapping[str, Any] | None:
    """Bod předpovědi nejbližší zadanému času (unix ts)."""
    if not forecast:
        return None
    return min(forecast, key=lambda f: abs(f["ts"] - ts))


@dataclass(slots=True)
class CalcInput:
    outdoor: float              # venkovní teplota vstupující do křivky (případně z předpovědi)
    raw_outdoor: float          # skutečná venkovní teplota (protimraz, bypass)
    wind: float
    rain: float
    humidity: float
    clouds: float
    sun_elevation: float | None
    sun_azimuth: float | None
    hour: int
    boost: float
    safe_mode: bool
    curve: Sequence[Point]
    settings: Mapping[str, Any]
    sun_noon_elevation: float | None = None


@dataclass(slots=True)
class CalcResult:
    curve_temp: float
    corr_wind: float
    corr_rain: float
    corr_humidity: float
    corr_clouds: float
    corr_sun: float
    night_offset: float
    night_active: bool
    boost: float
    total_correction: float    # včetně boostu
    raw: float
    t_min: float
    t_max: float
    frost_active: bool
    bypass_active: bool
    safe_mode: bool
    result: float
    clamped: bool
    sun_factor: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def compute(inp: CalcInput) -> CalcResult:
    s = inp.settings
    curve_temp = interpolate_curve(inp.curve, inp.outdoor)

    measured = {"wind": inp.wind, "rain": inp.rain, "humidity": inp.humidity, "clouds": inp.clouds}
    corr: dict[str, float] = {}
    for key, cfg in INFLUENCES.items():
        corr[cfg["value"]] = (
            linear_influence(measured[cfg["value"]], s[f"{key}_od"], s[f"{key}_do"], s[f"{key}_max_eff"])
            if s[f"vliv_{key}"] else 0.0
        )

    corr_sun = 0.0
    factor = 0.0
    if inp.sun_elevation is not None and inp.sun_azimuth is not None:
        factor = sun_factor(
            str(s.get("slunce_rezim", "")), inp.sun_elevation, inp.sun_azimuth, s, inp.sun_noon_elevation,
        )
        if s["vliv_slunce"]:
            corr_sun = float(s["slunce_max_eff"]) * factor * cloud_factor(inp.clouds)

    night_active = bool(s["night_mode"]) and is_night(inp.hour, int(s["day_start"]), int(s["day_end"]))
    night_offset = float(s["night_offset"]) if night_active else 0.0

    total = sum(corr.values()) + corr_sun + night_offset + inp.boost

    t_min, t_max = float(s["limit_min"]), float(s["limit_max"])
    frost_active = bool(s["frost_protection"]) and inp.raw_outdoor <= s["frost_threshold"]
    if frost_active:
        t_min = max(t_min, float(s["frost_min_heat"]))

    raw = float(s["safe_curve_temp"]) if inp.safe_mode else curve_temp + total
    result = max(t_min, min(t_max, raw))
    bypass_active = bool(s["letni_bypass"]) and inp.raw_outdoor >= s["letni_bypass_temp"]

    return CalcResult(
        curve_temp=curve_temp,
        corr_wind=corr["wind"],
        corr_rain=corr["rain"],
        corr_humidity=corr["humidity"],
        corr_clouds=corr["clouds"],
        corr_sun=corr_sun,
        night_offset=night_offset,
        night_active=night_active,
        boost=inp.boost,
        total_correction=total,
        raw=raw,
        t_min=t_min,
        t_max=t_max,
        frost_active=frost_active,
        bypass_active=bypass_active,
        safe_mode=inp.safe_mode,
        result=result,
        clamped=abs(raw - result) > 0.01,
        sun_factor=factor,
    )
