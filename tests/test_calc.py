"""Testy čistého výpočetního modulu."""

from __future__ import annotations

import pytest

from custom_components.heating_curve import calc
from custom_components.heating_curve.settings import default_settings

CURVE = [(-20.0, 70.0), (0.0, 45.0), (20.0, 20.0)]


@pytest.mark.parametrize(("x", "expected"), [(-30, 70), (-20, 70), (-10, 57.5), (0, 45), (10, 32.5), (25, 20)])
def test_interpolate_curve(x: float, expected: float) -> None:
    assert calc.interpolate_curve(CURVE, x) == pytest.approx(expected)


def test_interpolate_curve_unsorted_and_duplicate_x() -> None:
    assert calc.interpolate_curve([(10, 30), (0, 40), (0, 40)], 5) == pytest.approx(35)


@pytest.mark.parametrize(("value", "expected"), [(5, 0), (10, 0), (35, 2.5), (60, 5), (80, 5)])
def test_linear_influence(value: float, expected: float) -> None:
    assert calc.linear_influence(value, 10, 60, 5) == pytest.approx(expected)


def test_linear_influence_invalid_range() -> None:
    assert calc.linear_influence(50, 60, 10, 5) == 0


def test_sun_correction() -> None:
    assert calc.sun_correction(40, 180, 140, 220, -2, 0) == pytest.approx(-2)
    assert calc.sun_correction(15, 180, 140, 220, -2, 50) == pytest.approx(-0.5)
    assert calc.sun_correction(40, 100, 140, 220, -2, 0) == 0
    assert calc.sun_correction(-1, 180, 140, 220, -2, 0) == 0


def test_facade_factor_follows_sun_all_year() -> None:
    # jižní okna: zimní polední slunce nízko → skoro plný účinek, letní vysoko → menší
    assert calc.facade_factor(17, 180, 180) == pytest.approx(0.956, abs=0.01)
    assert calc.facade_factor(63, 180, 180) == pytest.approx(0.454, abs=0.01)
    assert calc.facade_factor(30, 90, 180) == pytest.approx(0, abs=1e-9)  # slunce z boku
    assert calc.facade_factor(5, 180, 180) == pytest.approx(0.498, abs=0.01)  # u obzoru slabé
    assert calc.facade_factor(-2, 180, 180) == 0


def test_daylight_factor_relative_to_noon() -> None:
    # v poledne 1 v zimě i v létě, bez nastavování okna
    assert calc.daylight_factor(17, 17) == pytest.approx(1)
    assert calc.daylight_factor(63, 63) == pytest.approx(1)
    assert calc.daylight_factor(8.5, 17) == pytest.approx(0.506, abs=0.01)
    assert calc.daylight_factor(0, 17) == 0
    assert calc.daylight_factor(10, None) == 0


def test_compute_sun_modes() -> None:
    base = {"sun_elevation": 17.0, "sun_azimuth": 180.0, "clouds": 50.0, "sun_noon_elevation": 17.0}
    window = calc.compute(_inp(**base))
    assert window.corr_sun == pytest.approx(-2 * (17 / 30) * 0.5)
    daylight = calc.compute(_inp(**base, settings={"slunce_rezim": "nad_obzorem"}))
    assert daylight.corr_sun == pytest.approx(-1.0) and daylight.sun_factor == pytest.approx(1)
    facade = calc.compute(_inp(**base, settings={"slunce_rezim": "fasada", "slunce_orientace": 270}))
    assert facade.corr_sun == 0
    off = calc.compute(_inp(**base, settings={"vliv_slunce": False, "slunce_rezim": "nad_obzorem"}))
    assert off.corr_sun == 0 and off.sun_factor == pytest.approx(1)
    # oblačnost v čase polohy slunce má přednost před aktuální
    cloudy = calc.compute(_inp(**base, sun_clouds=100.0, settings={"slunce_rezim": "nad_obzorem"}))
    assert cloudy.corr_sun == 0


@pytest.mark.parametrize(("hour", "start", "end", "night"), [
    (5, 6, 22, True), (6, 6, 22, False), (21, 6, 22, False), (22, 6, 22, True),
    (23, 22, 6, False), (7, 22, 6, True),
])
def test_is_night(hour: int, start: int, end: int, night: bool) -> None:
    assert calc.is_night(hour, start, end) is night


@pytest.mark.parametrize(("target", "step", "t_min", "t_max", "expected"), [
    (41.3, 0.5, 20, 60, 41.5), (41.2, 1.0, None, None, 41.0), (10, 0.5, 20, 60, 20), (70, 0.5, 20, 60, 60),
    (41.3, 0, None, None, 41.0),
])
def test_thermostat_value(target: float, step: float, t_min: float | None, t_max: float | None, expected: float) -> None:
    assert calc.thermostat_value(target, step, t_min, t_max) == expected


def test_date_rule_matches_over_new_year() -> None:
    assert calc.date_rule_matches("12-15", "11-01", "03-31")
    assert calc.date_rule_matches("02-10", "11-01", "03-31")
    assert not calc.date_rule_matches("06-01", "11-01", "03-31")
    assert not calc.date_rule_matches("06-01", "", "03-31")


def test_forecast_at() -> None:
    fc = [{"ts": 0, "v": 1}, {"ts": 3600, "v": 2}, {"ts": 7200, "v": 3}]
    assert calc.forecast_at(fc, 3000)["v"] == 2
    assert calc.forecast_at([], 3000) is None


def _inp(**overrides: object) -> calc.CalcInput:
    settings = default_settings()
    settings.update(overrides.pop("settings", {}))  # type: ignore[arg-type]
    base = {
        "outdoor": 0.0, "raw_outdoor": 0.0, "wind": 0.0, "rain": 0.0, "humidity": 0.0, "clouds": 0.0,
        "sun_elevation": None, "sun_azimuth": None, "hour": 12, "boost": 0.0, "safe_mode": False,
        "curve": CURVE, "settings": settings,
    }
    base.update(overrides)
    return calc.CalcInput(**base)  # type: ignore[arg-type]


def test_compute_limits_clamp() -> None:
    result = calc.compute(_inp())
    assert result.curve_temp == 45
    assert result.result == 42  # výchozí limit_max
    assert result.clamped


def test_compute_influences_and_boost() -> None:
    result = calc.compute(_inp(outdoor=20, raw_outdoor=20, wind=60, boost=3,
                               settings={"limit_min": 10, "limit_max": 80}))
    assert result.corr_wind == 5
    assert result.total_correction == pytest.approx(8)
    assert result.result == pytest.approx(28)


def test_compute_night_and_frost() -> None:
    result = calc.compute(_inp(outdoor=20, raw_outdoor=-10, hour=2, settings={"limit_min": 10}))
    assert result.night_active and result.night_offset == -5
    assert result.frost_active and result.t_min == 35
    assert result.result == 35


def test_compute_safe_mode_uses_safe_point() -> None:
    result = calc.compute(_inp(safe_mode=True, settings={"safe_curve_temp": 38}))
    assert result.result == 38 and result.safe_mode


def test_compute_bypass_flag() -> None:
    result = calc.compute(_inp(raw_outdoor=19, settings={"letni_bypass": True}))
    assert result.bypass_active
