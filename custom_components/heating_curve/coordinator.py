"""Regulátor — jediné místo, kde se čtou vstupy, počítá výsledek a zapisuje termostat."""

from __future__ import annotations

import asyncio
import copy
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from astral import sun as astral_sun

from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    STATE_OFF,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    UnitOfLength,
    UnitOfSpeed,
    UnitOfTemperature,
)
from homeassistant.core import CALLBACK_TYPE, Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.event import (
    async_track_point_in_utc_time,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.sun import get_astral_observer
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_conversion import DistanceConverter, SpeedConverter, TemperatureConverter

from . import calc
from .const import (
    CALC_LOG_SIZE,
    CLAMP_LOG_SIZE,
    CONF_OUTDOOR_SENSOR,
    CONF_THERMOSTAT,
    CONF_WEATHER,
    DEFAULT_PROFILE,
    DEFAULT_SEASONAL_PROFILES,
    DOMAIN,
    EVENT_BOOST_EXPIRED,
    EVENT_CURVE_CHANGED,
    EVENT_PROFILES_CHANGED,
    FORECAST_MAX_AGE,
    HISTORY_HOURS,
    INFLUENCES,
    MODE_BOTH,
    MODE_TEMP,
    MODE_TIME,
    SETTINGS_DEBOUNCE,
    SNAPSHOT_INTERVAL,
    TEMP_HISTORY_DAYS,
    TEMP_SOURCE_SAFE,
    TEMP_SOURCE_SENSOR,
    TEMP_SOURCE_WEATHER,
    WEATHER_DEBOUNCE,
)
from .settings import ALL_SETTINGS, NUMBER_SETTINGS, PROFILE_KEYS, coerce_setting, default_settings
from .storage import BMSStore, migrate_legacy_profile

SETTING_META = {
    s.key: {"min": s.min, "max": s.max, "step": s.step, "unit": s.unit} for s in NUMBER_SETTINGS
}

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.helpers.entity import Entity

_LOGGER = logging.getLogger(__name__)

_INVALID_STATES = (None, STATE_UNAVAILABLE, STATE_UNKNOWN)
SUN_PATH_STEP_MIN = 20


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(float(value), digits)


def _to_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _convert(converter: Any, value: float | None, unit: str | None, target: str) -> float | None:
    if value is None or not unit or unit == target:
        return value
    try:
        return converter.convert(value, unit, target)
    except HomeAssistantError:
        return value


class BMSRegulator:
    """Drží nastavení a stav regulace, entity jsou jen jeho zobrazením."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.store = BMSStore(hass)
        self.settings: dict[str, Any] = default_settings()
        self.setting_entities: dict[str, Entity] = {}
        self.entities: dict[str, Entity] = {}
        self.result: calc.CalcResult | None = None
        self.values: dict[str, Any] = {}
        self.temp_source = TEMP_SOURCE_SAFE
        self.forecast: list[dict[str, Any]] = []
        self.forecast_ok = False
        self.last_write: dict[str, Any] = {}
        self.available = True
        self.last_error: str | None = None
        self.problems: dict[str, str] = {}
        self.safe_since: float | None = None
        self._forecast_ts = 0.0
        self._next_tick: datetime | None = None
        self._sun_paths_cache: tuple[date, dict[str, Any]] | None = None
        self._last_write_outdoor: float | None = None
        self._listeners: list[CALLBACK_TYPE] = []
        self._unsubs: list[CALLBACK_TYPE] = []
        self._unsub_interval: CALLBACK_TYPE | None = None
        self._unsub_boost: CALLBACK_TYPE | None = None
        self._lock = asyncio.Lock()
        self._display_debouncer = Debouncer(
            hass, _LOGGER, cooldown=SETTINGS_DEBOUNCE, immediate=False,
            function=self._async_display_recompute,
        )
        self._weather_debouncer = Debouncer(
            hass, _LOGGER, cooldown=WEATHER_DEBOUNCE, immediate=False,
            function=self._async_weather_changed,
        )

    # ── Data ──────────────────────────────────────────────────────────────────
    @property
    def data(self) -> dict[str, Any]:
        return self.store.data

    @property
    def curve_points(self) -> list[tuple[float, float]]:
        return [(float(p["x"]), float(p["y"])) for p in self.data["curve"]]

    @property
    def boost_amount(self) -> float:
        boost = self.data["boost"]
        if boost.get("active") and boost.get("until", 0) > dt_util.utcnow().timestamp():
            return float(boost.get("amount", 0.0))
        return 0.0

    # ── Životní cyklus ────────────────────────────────────────────────────────
    async def async_setup(self) -> None:
        await self.store.async_load()
        for key, value in self.data["settings"].items():
            if key in ALL_SETTINGS:
                try:
                    self.settings[key] = coerce_setting(key, value)
                except (TypeError, ValueError):
                    continue
        if len(self.data["curve"]) < 2:
            self.data["curve"] = [dict(p) for p in DEFAULT_SEASONAL_PROFILES["Jaro/Podzim"]]
        self._migrate_sun_forecast()

    def _migrate_sun_forecast(self) -> None:
        """0.4: slunce má vlastní přepínač předpovědi — převezme dosavadní společný (křivka i slunce)."""
        changed = False
        stored = self.data["settings"]
        if "slunce_predpoved" not in stored and "pouziti_predpovedi" in stored:
            stored["slunce_predpoved"] = self.settings["slunce_predpoved"] = bool(stored["pouziti_predpovedi"])
            changed = True
        for profile in self.data["profiles"].values():
            settings = profile.get("settings", {})
            if "slunce_predpoved" not in settings and "pouziti_predpovedi" in settings:
                settings["slunce_predpoved"] = bool(settings["pouziti_predpovedi"])
                changed = True
        if changed:
            self.store.async_delay_save()

    async def async_start(self) -> None:
        """Spustí sledování a první výpočet (po startu HA, kdy existují všechny entity)."""
        tracked = [e for e in (self.entry.data.get(CONF_OUTDOOR_SENSOR), self.entry.data.get(CONF_WEATHER)) if e]
        if tracked:
            self._unsubs.append(async_track_state_change_event(self.hass, tracked, self._on_input_changed))
        if thermostat := self.entry.data.get(CONF_THERMOSTAT):
            self._unsubs.append(async_track_state_change_event(
                self.hass, [thermostat], self._on_thermostat_changed
            ))
        self._schedule_interval()
        self._restore_boost()
        if not self.data["history"]:
            self.entry.async_create_background_task(
                self.hass, self._async_load_history_from_recorder(), "bms_history_from_recorder"
            )
        await self.async_refresh_weather(force=True)
        await self.async_recompute(write=True, reason="start")

    async def async_stop(self) -> None:
        for unsub in (*self._unsubs, self._unsub_interval, self._unsub_boost):
            if unsub:
                unsub()
        self._unsubs.clear()
        self._unsub_interval = self._unsub_boost = None
        self._display_debouncer.async_shutdown()
        self._weather_debouncer.async_shutdown()
        await self.store.async_save()

    # ── Posluchači (entity, websocket) ────────────────────────────────────────
    @callback
    def async_add_listener(self, update_callback: CALLBACK_TYPE) -> CALLBACK_TYPE:
        self._listeners.append(update_callback)

        @callback
        def _remove() -> None:
            if update_callback in self._listeners:
                self._listeners.remove(update_callback)

        return _remove

    @callback
    def async_notify(self) -> None:
        for update_callback in list(self._listeners):
            update_callback()

    # ── Nastavení ─────────────────────────────────────────────────────────────
    @callback
    def async_register_entity(self, name: str, entity: Entity) -> None:
        """`name` = "<platforma>.<klíč>", karta podle něj dohledá aktuální entity_id."""
        self.entities[name] = entity

    @callback
    def async_register_setting_entity(self, key: str, entity: Entity) -> None:
        self.setting_entities[key] = entity

    def has_stored_setting(self, key: str) -> bool:
        return key in self.data["settings"]

    @callback
    def async_set_setting(self, key: str, value: Any, *, recompute: bool = True) -> None:
        new = coerce_setting(key, value)
        changed = self.settings.get(key) != new or key not in self.data["settings"]
        self.settings[key] = new
        self.data["settings"][key] = new
        if not changed:
            return
        self.store.async_delay_save()
        entity = self.setting_entities.get(key)
        if entity is not None and entity.hass is not None:
            entity.async_write_ha_state()
        if key == "prepocet_interval":
            self._schedule_interval()
        if recompute:
            self._display_debouncer.async_schedule_call()
        self.async_notify()

    # ── Plánování přepočtu ────────────────────────────────────────────────────
    @callback
    def _schedule_interval(self) -> None:
        if self._unsub_interval:
            self._unsub_interval()
        minutes = max(1, int(self.settings["prepocet_interval"]))
        self._next_tick = dt_util.utcnow() + timedelta(minutes=minutes)
        self._unsub_interval = async_track_time_interval(
            self.hass, self._async_interval_tick, timedelta(minutes=minutes), name="BMS přepočet"
        )

    async def _async_interval_tick(self, _now: datetime) -> None:
        self._next_tick = dt_util.utcnow() + timedelta(minutes=max(1, int(self.settings["prepocet_interval"])))
        write = self.settings["prepocet_rezim"] in (MODE_TIME, MODE_BOTH)
        await self.async_recompute(write=write, reason="interval")

    @callback
    def _on_thermostat_changed(self, _event: Event[EventStateChangedData]) -> None:
        self.async_notify()

    @callback
    def _on_input_changed(self, event: Event[EventStateChangedData]) -> None:
        new_state = event.data["new_state"]
        if new_state is None or new_state.state in _INVALID_STATES:
            return
        if event.data["entity_id"] == self.entry.data.get(CONF_WEATHER):
            self._weather_debouncer.async_schedule_call()
        if self.settings["prepocet_rezim"] in (MODE_TEMP, MODE_BOTH):
            outdoor, source = self._read_outdoor()
            last = self._last_write_outdoor
            if source != TEMP_SOURCE_SAFE and (last is None or abs(outdoor - last) >= self.settings["prepocet_delta"]):
                self.entry.async_create_task(
                    self.hass, self.async_recompute(write=True, reason="hysteresis"), "bms_hysteresis"
                )
                return
        self._display_debouncer.async_schedule_call()

    async def _async_display_recompute(self) -> None:
        await self.async_recompute(write=False, reason="display")

    async def _async_weather_changed(self) -> None:
        await self.async_refresh_weather(force=True)
        await self.async_recompute(write=False, reason="weather")

    # ── Vstupy ────────────────────────────────────────────────────────────────
    def _state(self, conf: str) -> State | None:
        entity_id = self.entry.data.get(conf)
        return self.hass.states.get(entity_id) if entity_id else None

    def _read_outdoor(self) -> tuple[float, str]:
        sensor = self._state(CONF_OUTDOOR_SENSOR)
        if sensor is not None and sensor.state not in _INVALID_STATES:
            value = _to_float(sensor.state)
            if value is not None:
                unit = sensor.attributes.get(ATTR_UNIT_OF_MEASUREMENT)
                return _convert(TemperatureConverter, value, unit, UnitOfTemperature.CELSIUS), TEMP_SOURCE_SENSOR
        weather = self._state(CONF_WEATHER)
        if weather is not None and weather.state not in _INVALID_STATES:
            value = _to_float(weather.attributes.get("temperature"))
            if value is not None:
                unit = weather.attributes.get("temperature_unit")
                return _convert(TemperatureConverter, value, unit, UnitOfTemperature.CELSIUS), TEMP_SOURCE_WEATHER
        return float(self.settings["safe_temp"]), TEMP_SOURCE_SAFE

    @staticmethod
    def _normalize(values: dict[str, Any], units: dict[str, Any]) -> dict[str, float | None]:
        """Převede hodnoty počasí na °C, km/h a mm."""
        clouds = values.get("cloud_coverage", values.get("cloudiness"))
        return {
            "temp": _convert(TemperatureConverter, _to_float(values.get("temperature")),
                             units.get("temperature_unit"), UnitOfTemperature.CELSIUS),
            "wind": _convert(SpeedConverter, _to_float(values.get("wind_speed")),
                             units.get("wind_speed_unit"), UnitOfSpeed.KILOMETERS_PER_HOUR),
            "rain": _convert(DistanceConverter, _to_float(values.get("precipitation")),
                             units.get("precipitation_unit"), UnitOfLength.MILLIMETERS),
            "humidity": _to_float(values.get("humidity")),
            "clouds": _to_float(clouds),
        }

    def _read_weather_now(self, now_ts: float) -> dict[str, float]:
        weather = self._state(CONF_WEATHER)
        current: dict[str, float | None] = {}
        if weather is not None and weather.state not in _INVALID_STATES:
            current = self._normalize(dict(weather.attributes), dict(weather.attributes))
        # Weather entity nemá aktuální srážky — použije se nejbližší hodina předpovědi
        nearest = calc.forecast_at(self.forecast, now_ts)
        result: dict[str, float] = {}
        for key in ("wind", "rain", "humidity", "clouds"):
            value = current.get(key)
            if value is None and nearest is not None:
                value = nearest.get(key)
            result[key] = float(value or 0.0)
        return result

    async def async_refresh_weather(self, *, force: bool = False) -> bool:
        """Stáhne hodinovou předpověď (sdílí ji výpočet, grafy i log vlivů)."""
        weather_eid = self.entry.data.get(CONF_WEATHER)
        if not weather_eid:
            return False
        now_ts = dt_util.utcnow().timestamp()
        if not force and self.forecast and now_ts - self._forecast_ts < FORECAST_MAX_AGE:
            return True
        raw: list[dict[str, Any]] = []
        for forecast_type in ("hourly", "twice_daily"):
            try:
                resp = await self.hass.services.async_call(
                    "weather", "get_forecasts", {"entity_id": weather_eid, "type": forecast_type},
                    blocking=True, return_response=True,
                )
            except HomeAssistantError as err:
                _LOGGER.debug("BMS: Předpověď (%s) nedostupná: %s", forecast_type, err)
                continue
            raw = ((resp or {}).get(weather_eid) or {}).get("forecast") or []
            if raw:
                break
        weather = self._state(CONF_WEATHER)
        units = dict(weather.attributes) if weather else {}
        forecast = []
        for item in raw:
            parsed = dt_util.parse_datetime(str(item.get("datetime", "")))
            if parsed is None:
                continue
            forecast.append({"ts": int(parsed.timestamp()), **self._normalize(item, units)})
        self.forecast = sorted(forecast, key=lambda f: f["ts"])
        self.forecast_ok = bool(self.forecast)
        self._forecast_ts = now_ts
        return self.forecast_ok

    def _sun_position(self, when: datetime) -> tuple[float, float]:
        observer = get_astral_observer(self.hass)
        return astral_sun.elevation(observer, when), astral_sun.azimuth(observer, when)

    def _sun_noon_elevation(self, when: datetime) -> float | None:
        """Nejvyšší elevace slunce v daný den (místní poledne)."""
        observer = get_astral_observer(self.hass)
        local = dt_util.as_local(when)
        try:
            noon = astral_sun.noon(observer, local.date(), tzinfo=local.tzinfo)
        except ValueError:
            return None
        return astral_sun.elevation(observer, noon)

    def _sun_paths(self) -> dict[str, Any]:
        """Dráha slunce dnes a o slunovratech (pro graf v kartě), počítá se jednou za den."""
        today = dt_util.now().date()
        if self._sun_paths_cache and self._sun_paths_cache[0] == today:
            return self._sun_paths_cache[1]
        observer = get_astral_observer(self.hass)
        tz = dt_util.get_default_time_zone()

        def path(day: date) -> list[list[float]]:
            start = datetime(day.year, day.month, day.day, tzinfo=tz)
            points = []
            for step in range(0, 24 * 60, SUN_PATH_STEP_MIN):
                when = start + timedelta(minutes=step)
                elevation = astral_sun.elevation(observer, when)
                if elevation > 0:
                    points.append([round(astral_sun.azimuth(observer, when), 1), round(elevation, 1)])
            return points

        paths = {
            "today": path(today),
            "summer": path(date(today.year, 6, 21)),
            "winter": path(date(today.year, 12, 21)),
        }
        self._sun_paths_cache = (today, paths)
        return paths

    # ── Výpočet ───────────────────────────────────────────────────────────────
    async def async_recompute(self, *, write: bool = False, manual: bool = False, reason: str = "") -> bool:
        """Přepočítá výsledek; `write` = nastavit termostat. Vrací True při úspěchu."""
        async with self._lock:
            try:
                await self.async_refresh_weather()
                inputs, extra = self._gather_inputs()
                self.temp_source = extra["source"]
                result = calc.compute(inputs)
            except Exception as err:  # noqa: BLE001 — regulátor musí běžet dál
                _LOGGER.exception("BMS: Chyba výpočtu (%s)", reason)
                self.available = False
                self.last_error = str(err)
                self._update_problems()
                self.async_notify()
                return False

            self.available = True
            self.last_error = None
            self.result = result
            self._store_values(inputs, extra, result)
            self._record_history(inputs, result)

            write_status: str | None = None
            if write:
                if not self.settings["hlavni_vypinac"]:
                    write_status = "disabled"
                elif result.bypass_active:
                    write_status = "bypass"
                else:
                    await self._async_write_thermostat(result.result, inputs.raw_outdoor)
                    write_status = self.last_write["status"]
            if write or manual:
                self._log_calc(inputs, extra, result, manual=manual, write_status=write_status)
            self._check_entities()
            self._update_problems()
            self.store.async_delay_save()
        self.async_notify()
        await self._async_evaluate_schedules()
        return True

    def _gather_inputs(self) -> tuple[calc.CalcInput, dict[str, Any]]:
        s = self.settings
        now = dt_util.utcnow()
        now_ts = now.timestamp()
        raw_outdoor, source = self._read_outdoor()
        actual = self._read_weather_now(now_ts)

        def forecast_value(hours: float, key: str) -> float | None:
            point = calc.forecast_at(self.forecast, now_ts + float(hours) * 3600)
            return None if point is None else point.get(key)

        forecast_temp = forecast_value(s["predpoved_hodin"], "temp")
        outdoor = forecast_temp if s["pouziti_predpovedi"] and forecast_temp is not None else raw_outdoor

        applied: dict[str, float] = {}
        forecasts: dict[str, float | None] = {}
        for key, cfg in INFLUENCES.items():
            value_key = cfg["value"]
            fc = forecast_value(s[f"{key}_predpoved_hodin"], value_key)
            forecasts[value_key] = fc
            applied[value_key] = fc if s[f"{key}_predpoved"] and fc is not None else actual[value_key]

        actual_el, actual_az = self._sun_position(now)
        sun_fc_when = now + timedelta(hours=float(s["slunce_predpoved_hodin"]))
        fc_el, fc_az = self._sun_position(sun_fc_when)
        use_sun_fc = bool(s["slunce_predpoved"])
        sun_el, sun_az = (fc_el, fc_az) if use_sun_fc else (actual_el, actual_az)
        # oblačnost pro slunce ze stejného okamžiku jako poloha slunce
        sun_clouds = forecast_value(s["slunce_predpoved_hodin"], "clouds") if use_sun_fc else None
        if sun_clouds is None:
            sun_clouds = actual["clouds"]

        inputs = calc.CalcInput(
            outdoor=outdoor,
            raw_outdoor=raw_outdoor,
            wind=applied["wind"],
            rain=applied["rain"],
            humidity=applied["humidity"],
            clouds=applied["clouds"],
            sun_elevation=sun_el,
            sun_azimuth=sun_az,
            hour=dt_util.now().hour,
            boost=self.boost_amount,
            safe_mode=source == TEMP_SOURCE_SAFE,
            curve=self.curve_points,
            settings=s,
            sun_noon_elevation=self._sun_noon_elevation(sun_fc_when if use_sun_fc else now),
            sun_clouds=sun_clouds,
        )
        extra = {
            "source": source,
            "actual": actual,
            "forecast": forecasts,
            "forecast_temp": forecast_temp,
            "actual_sun": (actual_el, actual_az),
            "forecast_sun": (fc_el, fc_az),
        }
        return inputs, extra

    def _store_values(self, inputs: calc.CalcInput, extra: dict[str, Any], result: calc.CalcResult) -> None:
        actual, forecast = extra["actual"], extra["forecast"]
        now_ts = dt_util.utcnow().timestamp()
        if inputs.safe_mode:
            self.safe_since = self.safe_since or now_ts
        else:
            self.safe_since = None
        self.values = {
            "applied_out_temp": _round(inputs.outdoor),
            "raw_outdoor_temp": _round(inputs.raw_outdoor),
            "curve_temp": _round(result.curve_temp),
            "total_correction": _round(result.total_correction, 2),
            "clamped_temp": _round(result.result),
            "actual_wind": _round(actual["wind"]),
            "actual_rain": _round(actual["rain"]),
            "actual_clouds": _round(actual["clouds"]),
            "actual_humidity": _round(actual["humidity"]),
            "forecast_wind": _round(forecast["wind"]),
            "forecast_rain": _round(forecast["rain"]),
            "forecast_clouds": _round(forecast["clouds"]),
            "forecast_humidity": _round(forecast["humidity"]),
            "forecast_temp": _round(extra["forecast_temp"]),
            "sun_elevation": _round(inputs.sun_elevation),
            "sun_azimuth": _round(inputs.sun_azimuth),
            "actual_sun_elevation": _round(extra["actual_sun"][0]),
            "actual_sun_azimuth": _round(extra["actual_sun"][1]),
            "forecast_sun_elevation": _round(extra["forecast_sun"][0]),
            "forecast_sun_azimuth": _round(extra["forecast_sun"][1]),
            "corr_wind": _round(result.corr_wind, 2),
            "corr_rain": _round(result.corr_rain, 2),
            "corr_humidity": _round(result.corr_humidity, 2),
            "corr_clouds": _round(result.corr_clouds, 2),
            "corr_sun": _round(result.corr_sun, 2),
            "sun_factor": _round(result.sun_factor, 2),
        }

    def _record_history(self, inputs: calc.CalcInput, result: calc.CalcResult) -> None:
        now_ts = int(dt_util.utcnow().timestamp())
        history = self.data["history"]
        if not history or now_ts - history[-1]["ts"] >= SNAPSHOT_INTERVAL:
            history.append({
                "ts": now_ts,
                "out": _round(inputs.raw_outdoor),
                "act_wind": self.values["actual_wind"],
                "act_rain": self.values["actual_rain"],
                "act_hum": self.values["actual_humidity"],
                "act_clouds": self.values["actual_clouds"],
                "result": _round(result.result),
            })
            cutoff = now_ts - HISTORY_HOURS * 3600
            self.data["history"] = [h for h in history if h["ts"] > cutoff]
        temps = self.data["temp_history"]
        if not inputs.safe_mode and (not temps or now_ts - temps[-1]["ts"] >= SNAPSHOT_INTERVAL):
            temps.append({"ts": now_ts, "temp": _round(inputs.raw_outdoor)})
            cutoff = now_ts - TEMP_HISTORY_DAYS * 86400
            self.data["temp_history"] = [t for t in temps if t["ts"] > cutoff]

    def _log_calc(
        self, inputs: calc.CalcInput, extra: dict[str, Any], result: calc.CalcResult,
        *, manual: bool, write_status: str | None,
    ) -> None:
        now = dt_util.now()
        entry = {
            "time": now.strftime("%d.%m %H:%M"),
            "ts": int(now.timestamp()),
            "out": _round(inputs.outdoor),
            "curve": _round(result.curve_temp),
            "act_wind": _round(extra["actual"]["wind"]),
            "act_rain": _round(extra["actual"]["rain"], 2),
            "act_hum": _round(extra["actual"]["humidity"]),
            "act_clouds": _round(extra["actual"]["clouds"]),
            "sun_el": _round(inputs.sun_elevation),
            "sun_az": _round(inputs.sun_azimuth),
            "corr_wind": _round(result.corr_wind, 2),
            "corr_rain": _round(result.corr_rain, 2),
            "corr_hum": _round(result.corr_humidity, 2),
            "corr_clouds": _round(result.corr_clouds, 2),
            "corr_sun": _round(result.corr_sun, 2),
            "night_offset": _round(result.night_offset, 2),
            "boost": _round(result.boost, 2),
            "total_corr": _round(result.total_correction, 2),
            "raw": _round(result.raw),
            "result": _round(result.result),
            "clamped": result.clamped,
            "frost": result.frost_active,
            "night": result.night_active,
            "bypass": result.bypass_active,
            "safe": result.safe_mode,
            "manual": manual,
            "thermostat": write_status,
        }
        self.data["calc_log"] = [entry, *self.data["calc_log"]][:CALC_LOG_SIZE]
        if result.clamped:
            clamp = {"ts": now.timestamp(), "raw": _round(result.raw), "clamped": _round(result.result)}
            self.data["clamp_log"] = [clamp, *self.data["clamp_log"]][:CLAMP_LOG_SIZE]

    def _log_event(self, kind: str, amount: float, hours: float, *, manual: bool) -> None:
        now = dt_util.now()
        entry = {
            "time": now.strftime("%d.%m %H:%M"),
            "ts": int(now.timestamp()),
            "event": kind,
            "amount": amount,
            "hours": hours,
            "manual": manual,
        }
        self.data["calc_log"] = [entry, *self.data["calc_log"]][:CALC_LOG_SIZE]

    # ── Termostat ─────────────────────────────────────────────────────────────
    async def _async_write_thermostat(self, target: float, outdoor: float) -> None:
        entity_id = self.entry.data.get(CONF_THERMOSTAT)
        state = self.hass.states.get(entity_id) if entity_id else None
        now = dt_util.now()
        record: dict[str, Any] = {
            "time": now.strftime("%d.%m %H:%M:%S"), "ts": int(now.timestamp()),
            "target": _round(target), "value": None, "status": "ok", "message": None,
        }
        if state is None or state.state in _INVALID_STATES:
            record["status"] = "unavailable"
        elif state.state == STATE_OFF:
            record["status"] = "off"
        else:
            attrs = state.attributes
            value = calc.thermostat_value(
                target, _to_float(attrs.get("target_temp_step")) or 1.0,
                _to_float(attrs.get("min_temp")), _to_float(attrs.get("max_temp")),
            )
            record["value"] = value
            current = _to_float(attrs.get("temperature"))
            if current is not None and abs(current - value) < 1e-6:
                record["status"] = "unchanged"
            else:
                try:
                    await self.hass.services.async_call(
                        "climate", "set_temperature",
                        {"entity_id": entity_id, "temperature": value}, blocking=True,
                    )
                except HomeAssistantError as err:
                    record["status"] = "error"
                    record["message"] = str(err)
                    _LOGGER.warning("BMS: Nastavení termostatu %s selhalo: %s", entity_id, err)
        if record["status"] in ("ok", "unchanged"):
            self._last_write_outdoor = outdoor
        self.last_write = record

    # ── Boost / útlum ─────────────────────────────────────────────────────────
    async def async_activate_boost(self, amount: float | None, hours: float | None, *, reduction: bool) -> None:
        s = self.settings
        amount = abs(float(amount if amount is not None else s["reduction_amount" if reduction else "boost_amount"]))
        hours = float(hours if hours is not None else s["reduction_hours" if reduction else "boost_hours"])
        signed = -amount if reduction else amount
        now = dt_util.utcnow()
        until = now + timedelta(hours=hours)
        self.data["boost"] = {
            "active": True, "amount": signed, "until": until.timestamp(),
            "since": now.timestamp(), "hours": hours,
        }
        self._log_event("reduction_start" if reduction else "boost_start", signed, hours, manual=True)
        self._schedule_boost_expiry(until)
        await self.store.async_save()
        await self.async_recompute(write=True, reason="boost")

    async def async_cancel_boost(self) -> None:
        boost = self.data["boost"]
        amount = float(boost.get("amount", 0.0))
        self._log_event("boost_cancel" if amount > 0 else "reduction_cancel", amount, 0, manual=True)
        self.data["boost"] = {"active": False}
        if self._unsub_boost:
            self._unsub_boost()
            self._unsub_boost = None
        await self.store.async_save()
        await self.async_recompute(write=True, reason="boost_cancel")

    @callback
    def _schedule_boost_expiry(self, until: datetime) -> None:
        if self._unsub_boost:
            self._unsub_boost()
        self._unsub_boost = async_track_point_in_utc_time(self.hass, self._async_boost_expired, until)

    @callback
    def _restore_boost(self) -> None:
        boost = self.data["boost"]
        if not boost.get("active"):
            return
        until = dt_util.utc_from_timestamp(float(boost.get("until", 0)))
        if until <= dt_util.utcnow():
            self.entry.async_create_task(self.hass, self._async_boost_expired(dt_util.utcnow()), "bms_boost_expired")
        else:
            self._schedule_boost_expiry(until)

    async def _async_boost_expired(self, _now: datetime) -> None:
        self._unsub_boost = None
        boost = self.data["boost"]
        if not boost.get("active"):
            return
        amount = float(boost.get("amount", 0.0))
        kind = "boost_expired" if amount > 0 else "reduction_expired"
        self._log_event(kind, amount, 0, manual=False)
        self.data["boost"] = {"active": False}
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_BOOST_EXPIRED, {"kind": kind, "amount": amount})
        await self.async_recompute(write=True, reason="boost_expired")

    # ── Křivka ────────────────────────────────────────────────────────────────
    async def async_set_curve(self, points: list[dict[str, Any]]) -> None:
        parsed = sorted(
            ({"x": float(p["x"]), "y": float(p["y"])} for p in points if "x" in p and "y" in p),
            key=lambda p: p["x"],
        )
        if len(parsed) < 2:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="invalid_curve_points")
        self.data["curve"] = parsed
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_CURVE_CHANGED)
        self._display_debouncer.async_schedule_call()
        self.async_notify()

    async def async_retry_storage(self) -> bool:
        ok = await self.store.async_save()
        self.hass.bus.async_fire(EVENT_CURVE_CHANGED)
        self.async_notify()
        return ok

    # ── Profily ───────────────────────────────────────────────────────────────
    @property
    def profile_names(self) -> list[str]:
        return [DEFAULT_PROFILE, *sorted(k for k in self.data["profiles"] if k != DEFAULT_PROFILE)]

    async def async_save_profile(self, name: str) -> None:
        self.data["profiles"][name] = {
            "settings": {k: self.settings[k] for k in PROFILE_KEYS},
            "curve": copy.deepcopy(self.data["curve"]),
        }
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_PROFILES_CHANGED)
        self.async_notify()

    async def async_load_profile(self, name: str, *, source: str = "manual") -> None:
        if name != DEFAULT_PROFILE:
            profile = self.data["profiles"].get(name)
            if profile is None:
                raise ServiceValidationError(
                    translation_domain=DOMAIN, translation_key="profile_not_found",
                    translation_placeholders={"name": name},
                )
            for key, value in profile.get("settings", {}).items():
                if key in PROFILE_KEYS:
                    try:
                        self.async_set_setting(key, value, recompute=False)
                    except (TypeError, ValueError):
                        continue
            if len(profile.get("curve") or []) >= 2:
                self.data["curve"] = copy.deepcopy(profile["curve"])
                self.hass.bus.async_fire(EVENT_CURVE_CHANGED)
        self.data["active_profile"] = name
        if source == "manual":
            # Ruční volba má přednost, dokud se nezmění splněné pravidlo plánu
            rule = self._matching_rule()
            self.data["schedule_rule"] = rule["id"] if rule else None
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_PROFILES_CHANGED)
        self._display_debouncer.async_schedule_call()
        self.async_notify()

    async def async_rename_profile(self, name: str, new_name: str) -> None:
        profiles = self.data["profiles"]
        if name not in profiles:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="profile_not_found",
                translation_placeholders={"name": name},
            )
        if new_name == name:
            return
        profiles[new_name] = profiles.pop(name)
        if self.data["active_profile"] == name:
            self.data["active_profile"] = new_name
        self.data["starred"] = [new_name if s == name else s for s in self.data["starred"]]
        for rule in self.data["schedules"]:
            if rule.get("profile") == name:
                rule["profile"] = new_name
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_PROFILES_CHANGED)
        self.async_notify()

    async def async_delete_profile(self, name: str) -> None:
        if name not in self.data["profiles"]:
            return
        del self.data["profiles"][name]
        if self.data["active_profile"] == name:
            self.data["active_profile"] = DEFAULT_PROFILE
        self.data["starred"] = [s for s in self.data["starred"] if s != name]
        await self.store.async_save()
        self.hass.bus.async_fire(
            EVENT_PROFILES_CHANGED, {"deleted": name, "was_system": name in DEFAULT_SEASONAL_PROFILES}
        )
        self.async_notify()

    async def async_set_starred(self, names: list[str]) -> None:
        valid = set(self.data["profiles"]) | {DEFAULT_PROFILE}
        self.data["starred"] = [n for n in names if n in valid][:15]
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_PROFILES_CHANGED)
        self.async_notify()

    def export_data(self) -> dict[str, Any]:
        return {
            "format": "bms-profiles",
            "version": 1,
            "exported": dt_util.now().isoformat(),
            "profiles": copy.deepcopy(self.data["profiles"]),
            "schedules": copy.deepcopy(self.data["schedules"]),
            "starred": list(self.data["starred"]),
        }

    async def async_import_data(self, payload: dict[str, Any]) -> list[str]:
        """Sloučí importované profily (stejný název = přepsání); vrátí názvy importovaných profilů."""
        profiles = payload.get("profiles")
        if not isinstance(profiles, dict):
            raise ValueError("Soubor neobsahuje profily")
        imported: list[str] = []
        for name, raw in profiles.items():
            if not isinstance(name, str) or not name.strip() or name == DEFAULT_PROFILE or not isinstance(raw, dict):
                continue
            if "settings" not in raw:
                raw = migrate_legacy_profile(raw)
            settings: dict[str, Any] = {}
            for key, value in (raw.get("settings") or {}).items():
                if key in PROFILE_KEYS:
                    try:
                        settings[key] = coerce_setting(key, value)
                    except (TypeError, ValueError):
                        continue
            curve = [
                {"x": float(p["x"]), "y": float(p["y"])}
                for p in raw.get("curve") or [] if isinstance(p, dict) and "x" in p and "y" in p
            ]
            self.data["profiles"][name.strip()] = {"settings": settings, "curve": sorted(curve, key=lambda p: p["x"])}
            imported.append(name.strip())
        if isinstance(payload.get("schedules"), list):
            known = {r["id"] for r in self.data["schedules"]}
            self.data["schedules"].extend(
                r for r in payload["schedules"] if isinstance(r, dict) and r.get("id") and r["id"] not in known
            )
        if isinstance(payload.get("starred"), list):
            valid = set(self.data["profiles"]) | {DEFAULT_PROFILE}
            merged = [*self.data["starred"], *(n for n in payload["starred"] if n not in self.data["starred"])]
            self.data["starred"] = [n for n in merged if n in valid][:15]
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_PROFILES_CHANGED)
        self.async_notify()
        return imported

    # ── Plány ─────────────────────────────────────────────────────────────────
    async def async_save_schedule(self, rule_data: dict[str, Any]) -> None:
        schedules = self.data["schedules"]
        rule = {
            "id": rule_data.get("id") or uuid.uuid4().hex[:8],
            "enabled": rule_data.get("enabled", True),
            "type": rule_data.get("type", "date"),
            "profile": rule_data.get("profile", DEFAULT_PROFILE),
            "date_from": rule_data.get("date_from", ""),
            "date_to": rule_data.get("date_to", ""),
            "temp_op": rule_data.get("temp_op", "<"),
            "temp_val": float(rule_data.get("temp_val", 5)),
            "temp_days": int(rule_data.get("temp_days", 3)),
        }
        ids = [r["id"] for r in schedules]
        if rule["id"] in ids:
            schedules[ids.index(rule["id"])] = rule
        else:
            schedules.append(rule)
        await self._async_schedules_changed()

    async def async_delete_schedule(self, rule_id: str) -> None:
        self.data["schedules"] = [r for r in self.data["schedules"] if r["id"] != rule_id]
        await self._async_schedules_changed()

    async def async_reorder_schedules(self, order: list[str]) -> None:
        by_id = {r["id"]: r for r in self.data["schedules"]}
        self.data["schedules"] = [by_id[i] for i in order if i in by_id]
        await self._async_schedules_changed()

    async def _async_schedules_changed(self) -> None:
        self.data["schedule_rule"] = None
        await self.store.async_save()
        self.hass.bus.async_fire(EVENT_PROFILES_CHANGED)
        self.async_notify()
        await self._async_evaluate_schedules()

    def _temp_average(self, days: int) -> float | None:
        since = dt_util.utcnow().timestamp() - days * 86400
        temps = [t["temp"] for t in self.data["temp_history"] if t["ts"] > since and t["temp"] is not None]
        return sum(temps) / len(temps) if temps else None

    def _matching_rule(self) -> dict[str, Any] | None:
        today = dt_util.now().strftime("%m-%d")
        valid = set(self.data["profiles"]) | {DEFAULT_PROFILE}
        for rule in self.data["schedules"]:
            if not rule.get("enabled", True) or rule.get("profile") not in valid:
                continue
            if rule.get("type", "date") == "date":
                match = calc.date_rule_matches(today, rule.get("date_from", ""), rule.get("date_to", ""))
            else:
                match = calc.temp_rule_matches(
                    self._temp_average(int(rule.get("temp_days", 3))),
                    rule.get("temp_op", "<"), float(rule.get("temp_val", 5)),
                )
            if match:
                return rule
        return None

    async def _async_evaluate_schedules(self) -> None:
        """Profil se přepne jen při změně splněného pravidla — ruční volbu nepřebíjí."""
        rule = self._matching_rule()
        rule_id = rule["id"] if rule else None
        if rule_id == self.data.get("schedule_rule"):
            return
        self.data["schedule_rule"] = rule_id
        self.store.async_delay_save()
        if rule and rule["profile"] != self.data["active_profile"]:
            _LOGGER.info("BMS Plán: přepínám na profil '%s'.", rule["profile"])
            await self.async_load_profile(rule["profile"], source="schedule")

    # ── Problémy a opravy ─────────────────────────────────────────────────────
    @callback
    def _check_entities(self) -> None:
        for role, conf in (
            ("thermostat", CONF_THERMOSTAT),
            ("outdoor_sensor", CONF_OUTDOOR_SENSOR),
            ("weather", CONF_WEATHER),
        ):
            entity_id = self.entry.data.get(conf)
            issue_id = f"missing_{role}"
            if entity_id and self.hass.states.get(entity_id) is None:
                ir.async_create_issue(
                    self.hass, DOMAIN, issue_id, is_fixable=False, severity=ir.IssueSeverity.WARNING,
                    translation_key=issue_id, translation_placeholders={"entity_id": entity_id},
                )
            else:
                ir.async_delete_issue(self.hass, DOMAIN, issue_id)

    @callback
    def _update_problems(self) -> None:
        problems: dict[str, str] = {}
        if not self.available:
            problems["calculation"] = self.last_error or "error"
        if self.temp_source == TEMP_SOURCE_SAFE:
            problems["outdoor_temperature"] = "safe_fallback"
        if self.entry.data.get(CONF_WEATHER) and not self.forecast_ok:
            problems["forecast"] = "unavailable"
        if self.last_write.get("status") in ("error", "unavailable"):
            problems["thermostat"] = self.last_write["message"] or self.last_write["status"]
        if not self.store.ok:
            problems["storage"] = "write_failed"
        self.problems = problems

    # ── Historie z recorderu (jen při prvním startu) ──────────────────────────
    async def _async_load_history_from_recorder(self) -> None:
        from homeassistant.components.recorder import get_instance  # noqa: PLC0415
        from homeassistant.components.recorder.history import get_significant_states  # noqa: PLC0415

        weather_eid = self.entry.data.get(CONF_WEATHER)
        outdoor_eid = self.entry.data.get(CONF_OUTDOOR_SENSOR)
        entity_ids = [e for e in (weather_eid, outdoor_eid) if e]
        if not entity_ids:
            return
        end = dt_util.utcnow()
        start = end - timedelta(hours=HISTORY_HOURS)
        try:
            states = await get_instance(self.hass).async_add_executor_job(
                get_significant_states, self.hass, start, end, entity_ids
            )
        except (KeyError, HomeAssistantError) as err:
            _LOGGER.debug("BMS: Historie z recorderu nedostupná: %s", err)
            return
        by_hour: dict[int, dict[str, Any]] = {}
        for state in states.get(weather_eid, []) if weather_eid else []:
            if state.state in _INVALID_STATES:
                continue
            hour = int(state.last_updated.timestamp() // 3600) * 3600
            norm = self._normalize(dict(state.attributes), dict(state.attributes))
            by_hour.setdefault(hour, {
                "ts": hour, "act_wind": _round(norm["wind"]), "act_rain": _round(norm["rain"]),
                "act_hum": _round(norm["humidity"]), "act_clouds": _round(norm["clouds"]),
            })
        for state in states.get(outdoor_eid, []) if outdoor_eid else []:
            value = _to_float(state.state)
            if value is None:
                continue
            hour = int(state.last_updated.timestamp() // 3600) * 3600
            by_hour.setdefault(hour, {"ts": hour})["out"] = _round(value)
        if by_hour and not self.data["history"]:
            self.data["history"] = sorted(by_hour.values(), key=lambda h: h["ts"])
            self.store.async_delay_save()
            self.async_notify()

    # ── Pohledy pro entity a kartu ────────────────────────────────────────────
    def simulate(self, outdoor: float, curve: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Výsledek pro zadanou venkovní teplotu (a případně jinou křivku) bez zápisu termostatu."""
        inputs, _ = self._gather_inputs()
        inputs.outdoor = inputs.raw_outdoor = float(outdoor)
        inputs.safe_mode = False
        if curve and len(curve) >= 2:
            inputs.curve = [(float(p["x"]), float(p["y"])) for p in curve]
        return calc.compute(inputs).as_dict()

    def _thermostat_info(self) -> dict[str, Any] | None:
        entity_id = self.entry.data.get(CONF_THERMOSTAT)
        state = self.hass.states.get(entity_id) if entity_id else None
        if state is None:
            return None
        return {
            "entity_id": entity_id,
            "state": state.state,
            "target": _to_float(state.attributes.get("temperature")),
            "current": _to_float(state.attributes.get("current_temperature")),
        }

    def _profile_modified(self) -> bool:
        """Liší se aktuální nastavení nebo křivka od aktivního profilu?"""
        profile = self.data["profiles"].get(self.data["active_profile"])
        if profile is None:
            return False
        for key, value in profile.get("settings", {}).items():
            if key in self.settings and self.settings[key] != value:
                return True
        curve = profile.get("curve") or []
        if len(curve) >= 2:
            current = [(float(p["x"]), float(p["y"])) for p in self.data["curve"]]
            saved = [(float(p["x"]), float(p["y"])) for p in curve]
            return sorted(current) != sorted(saved)
        return False

    def _next_events(self) -> list[dict[str, Any]]:
        """Nejbližší plánované události (přepočet, konec boostu, den/noc, plán)."""
        s = self.settings
        now = dt_util.now()
        events: list[dict[str, Any]] = []
        if self._next_tick:
            events.append({"kind": "recalc", "ts": int(self._next_tick.timestamp())})
        if self.boost_amount:
            events.append({"kind": "boost_end", "ts": int(self.data["boost"]["until"])})
        if s["night_mode"]:
            candidates = []
            for hour, kind in ((int(s["day_start"]), "day_start"), (int(s["day_end"]), "night_start")):
                moment = now.replace(hour=hour, minute=0, second=0, microsecond=0)
                if moment <= now:
                    moment += timedelta(days=1)
                candidates.append((moment, kind))
            moment, kind = min(candidates)
            events.append({"kind": kind, "ts": int(moment.timestamp())})
        upcoming = []
        for rule in self.data["schedules"]:
            if not rule.get("enabled", True) or rule.get("type") != "date" or not rule.get("date_from"):
                continue
            try:
                month, day = (int(v) for v in rule["date_from"].split("-"))
                start = now.replace(month=month, day=day, hour=0, minute=0, second=0, microsecond=0)
                if start <= now:
                    start = start.replace(year=start.year + 1)
            except ValueError:
                continue
            upcoming.append((start, rule["profile"]))
        if upcoming:
            start, profile = min(upcoming)
            events.append({"kind": "schedule", "ts": int(start.timestamp()), "profile": profile})
        return sorted(events, key=lambda e: e["ts"])

    def chart_forecast(self, from_h: float, to_h: float) -> list[dict[str, Any]]:
        now_ts = dt_util.utcnow().timestamp()
        return [
            {
                "ts": f["ts"], "out": _round(f["temp"]), "act_wind": _round(f["wind"]),
                "act_rain": _round(f["rain"], 2), "act_hum": _round(f["humidity"]),
                "act_clouds": _round(f["clouds"]), "_fc": True,
            }
            for f in self.forecast
            if from_h <= (f["ts"] - now_ts) / 3600 <= to_h
        ]

    def snapshot(self) -> dict[str, Any]:
        """Kompletní stav pro kartu (websocket)."""
        rule = self._matching_rule()
        return {
            "entry_id": self.entry.entry_id,
            "inputs": {
                "thermostat": self.entry.data.get(CONF_THERMOSTAT),
                "outdoor_sensor": self.entry.data.get(CONF_OUTDOOR_SENSOR),
                "weather": self.entry.data.get(CONF_WEATHER),
            },
            "thermostat": self._thermostat_info(),
            "profile_modified": self._profile_modified(),
            "active_rule": rule["id"] if rule else None,
            "next_events": self._next_events(),
            "available": self.available,
            "last_error": self.last_error,
            "problems": self.problems,
            "settings": dict(self.settings),
            "setting_meta": SETTING_META,
            "entities": {name: entity.entity_id for name, entity in self.entities.items() if entity.entity_id},
            "curve": self.data["curve"],
            "storage_ok": self.store.ok,
            "profiles": self.profile_names,
            "system_profiles": list(DEFAULT_SEASONAL_PROFILES),
            "active_profile": self.data["active_profile"],
            "starred": self.data["starred"],
            "schedules": self.data["schedules"],
            "boost": {**self.data["boost"], "effective": self.boost_amount},
            "temp_source": self.temp_source,
            "safe_since": self.safe_since,
            "result": self.result.as_dict() if self.result else None,
            "values": self.values,
            "last_write": self.last_write,
            "calc_log": self.data["calc_log"],
            "clamp_log": self.data["clamp_log"],
            "history": self.data["history"],
            "forecast": self.chart_forecast(-1, 48),
            "forecast_ok": self.forecast_ok,
            "sun_paths": self._sun_paths(),
        }
