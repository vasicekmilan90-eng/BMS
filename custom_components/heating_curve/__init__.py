"""Chytrý ekvitermní regulátor (BMS) pro Home Assistant."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import (
    Event,
    EventStateChangedData,
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from .const import (
    CALC_LOG_SIZE,
    CARD_FILENAME,
    CURVE_STORAGE_KEY,
    CURVE_STORAGE_VERSION,
    DEFAULT_CURVE_POINTS,
    DEFAULT_PROFILE,
    DOMAIN,
    FRONTEND_URL_BASE,
    PLATFORMS,
    PROFILE_ENTITIES,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

type HeatingCurveConfigEntry = ConfigEntry[dict[str, Any]]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# ── Výchozí sezónní profily ────────────────────────────────────────────────────
DEFAULT_SEASONAL_PROFILES = {
    "Zima": {
        "__curve_points__": [
            {"x": -20, "y": 75}, {"x": -10, "y": 65}, {"x": 0, "y": 55},
            {"x": 10,  "y": 42}, {"x": 20,  "y": 30},
        ],
    },
    "Jaro/Podzim": {
        "__curve_points__": [
            {"x": -20, "y": 65}, {"x": -10, "y": 55}, {"x": 0, "y": 43},
            {"x": 10,  "y": 32}, {"x": 20,  "y": 20},
        ],
    },
    "Léto": {
        "__curve_points__": [
            {"x": -20, "y": 55}, {"x": -10, "y": 44}, {"x": 0, "y": 34},
            {"x": 10,  "y": 25}, {"x": 20,  "y": 18},
        ],
    },
}
SYSTEM_PROFILE_NAMES = set(DEFAULT_SEASONAL_PROFILES.keys())

# ── Schémata služeb ────────────────────────────────────────────────────────────
_NAME_SCHEMA = vol.Schema({vol.Required("name"): cv.string})
_EMPTY_SCHEMA = vol.Schema({})
_AMOUNT_HOURS_SCHEMA = vol.Schema({
    vol.Optional("amount"): vol.Coerce(float),
    vol.Optional("hours"):  vol.Coerce(float),
})
SERVICE_SCHEMAS: dict[str, vol.Schema] = {
    "set_curve_points":   vol.Schema({vol.Required("points"): vol.All(cv.ensure_list, [dict])}),
    "get_curve_points":   _EMPTY_SCHEMA,
    "retry_storage":      _EMPTY_SCHEMA,
    "save_profile":       _NAME_SCHEMA,
    "load_profile":       _NAME_SCHEMA,
    "delete_profile":     _NAME_SCHEMA,
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
        vol.Optional("temp_days"): vol.Coerce(int),
    }),
    "delete_schedule":    vol.Schema({vol.Required("id"): cv.string}),
    "reorder_schedules":  vol.Schema({vol.Required("order"): vol.All(cv.ensure_list, [cv.string])}),
}


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Zaregistruje kartu a služby (jednou pro celou integraci)."""
    integration = await async_get_integration(hass, DOMAIN)
    await hass.http.async_register_static_paths([
        StaticPathConfig(FRONTEND_URL_BASE, str(Path(__file__).parent / "frontend"), cache_headers=False),
    ])
    add_extra_js_url(hass, f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={integration.version}")

    for service, handler in SERVICE_HANDLERS.items():
        hass.services.async_register(
            DOMAIN, service, handler,
            schema=SERVICE_SCHEMAS[service],
            supports_response=(
                SupportsResponse.OPTIONAL if service == "get_curve_points" else SupportsResponse.NONE
            ),
        )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: HeatingCurveConfigEntry) -> bool:
    store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)
    profiles: dict = await store.async_load() or {}

    # Při prvním spuštění (nebo pokud chybí výchozí profily) je automaticky vytvoříme.
    # Existující uživatelské profily nejsou dotčeny.
    profiles_changed = False
    for name, data in DEFAULT_SEASONAL_PROFILES.items():
        if name not in profiles:
            profiles[name] = dict(data)
            profiles_changed = True
            _LOGGER.info("BMS: Vytvořen výchozí sezónní profil '%s'.", name)
    if profiles_changed:
        try:
            await store.async_save(profiles)
        except (OSError, HomeAssistantError) as e:
            _LOGGER.error("BMS: Nepodařilo se uložit výchozí profily: %s", e)

    curve_store = Store[dict[str, Any]](hass, CURVE_STORAGE_VERSION, CURVE_STORAGE_KEY)
    curve_data: dict = await curve_store.async_load() or {}
    if "points" not in curve_data:
        curve_data = {"points": list(DEFAULT_CURVE_POINTS), "storage_ok": True}
        try:
            await curve_store.async_save(curve_data)
        except (OSError, HomeAssistantError) as e:
            _LOGGER.error("BMS: Nepodařilo se inicializovat curve storage: %s", e)
            curve_data["storage_ok"] = False

    entry.runtime_data = {
        "store":           store,
        "curve_store":     curve_store,
        "profiles":        profiles,
        "curve":           curve_data,
        "storage_ok":      curve_data.get("storage_ok", True),
        "system_profiles": SYSTEM_PROFILE_NAMES,
    }

    # Obnovit aktivní profil z uložené hodnoty (přežije restart HA)
    active_profile = profiles.get("__active_profile__", DEFAULT_PROFILE)
    if active_profile not in profiles and active_profile != DEFAULT_PROFILE:
        active_profile = DEFAULT_PROFILE

    async def _clamp_curve_to_limits() -> None:
        t_min_s = hass.states.get("number.bms_limit_min")
        t_max_s = hass.states.get("number.bms_limit_max")
        if not t_min_s or not t_max_s:
            return
        try:
            t_min, t_max = float(t_min_s.state), float(t_max_s.state)
        except ValueError:
            return
        points = entry.runtime_data["curve"].get("points", [])
        new_pts, changed = [], False
        for p in points:
            y_new = max(t_min, min(t_max, float(p["y"])))
            new_pts.append({"x": float(p["x"]), "y": y_new})
            if abs(y_new - float(p["y"])) > 0.01:
                changed = True
        if changed:
            _LOGGER.info("BMS: Limity změněny, ořezávám křivku.")
            await _async_save_curve(entry, new_pts)
            hass.bus.async_fire(f"{DOMAIN}_curve_changed")

    async def _on_limit_changed(event: Event[EventStateChangedData]) -> None:
        s = event.data["new_state"]
        if s and s.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            await _clamp_curve_to_limits()

    entry.async_on_unload(
        async_track_state_change_event(
            hass, ["number.bms_limit_min", "number.bms_limit_max"], _on_limit_changed
        )
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # Nastavit select entitu s obnoveným aktivním profilem
    _async_update_profile_select(entry, active=active_profile)

    # Profil se při restartu neaplikuje znovu — hodnoty entit obnoví RestoreNumber /
    # RestoreEntity. Aplikace by přepsala změny provedené po posledním uložení profilu.
    if active_profile != DEFAULT_PROFILE:
        _LOGGER.info(
            "BMS: Aktivní profil při restartu: '%s' — hodnoty entit jsou obnoveny "
            "z HA recorderu (RestoreNumber/RestoreEntity), profil se neaplikuje znovu.",
            active_profile,
        )

    # První výpočet až po startu HA (nebo ihned při reloadu), kdy existují všechny entity
    async def _async_start(_hass: HomeAssistant) -> None:
        result_sensor = entry.runtime_data.get("result_sensor")
        if result_sensor is not None:
            await result_sensor.async_start()

    entry.async_on_unload(async_at_started(hass, _async_start))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: HeatingCurveConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


# ── Pomocné funkce ─────────────────────────────────────────────────────────────
def _get_entry(hass: HomeAssistant) -> HeatingCurveConfigEntry:
    """Vrátí (jediný) načtený config entry, jinak vyhodí chybu služby."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.state in (ConfigEntryState.LOADED, ConfigEntryState.SETUP_IN_PROGRESS) and \
           getattr(entry, "runtime_data", None) is not None:
            return entry
    raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")


async def _async_save_curve(entry: HeatingCurveConfigEntry, points: list) -> bool:
    data = entry.runtime_data
    data["curve"]["points"] = points
    try:
        await data["curve_store"].async_save({"points": points, "storage_ok": True})
    except (OSError, HomeAssistantError) as e:
        _LOGGER.error(
            "BMS: Selhání Storage při ukládání křivky: %s — "
            "body jsou uloženy pouze v paměti (přežijí do restartu HA).", e
        )
        data["storage_ok"] = False
        return False
    data["storage_ok"] = True
    _LOGGER.debug("BMS: Křivka uložena (%d bodů).", len(points))
    return True


@callback
def _async_update_profile_select(entry: HeatingCurveConfigEntry, active: str | None = None) -> None:
    """Překreslí select profilů (seznam možností se čte z profilů dynamicky)."""
    select = entry.runtime_data.get("profile_select")
    if select is not None:
        select.async_set_active_profile(active)


def _boost_log_event(data: dict, kind: str, amount: float, hours: float) -> None:
    """Zapíše událost boost/útlum do výpočetního logu."""
    calc_log = data.get("calc_log", [])
    calc_log.insert(0, {
        "time":   dt_util.now().strftime("%d.%m %H:%M"),
        "event":  kind,
        "amount": amount,
        "hours":  hours,
        "manual": True,
    })
    data["calc_log"] = calc_log[:CALC_LOG_SIZE]


# ── Obsluha služeb ─────────────────────────────────────────────────────────────
async def _handle_set_curve_points(call: ServiceCall) -> None:
    entry = _get_entry(call.hass)
    points = [
        {"x": float(p["x"]), "y": float(p["y"])}
        for p in call.data["points"] if "x" in p and "y" in p
    ]
    if len(points) < 2:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="invalid_curve_points")
    points.sort(key=lambda p: p["x"])
    await _async_save_curve(entry, points)
    call.hass.bus.async_fire(f"{DOMAIN}_curve_changed")


async def _handle_get_curve_points(call: ServiceCall) -> ServiceResponse:
    data = _get_entry(call.hass).runtime_data
    response = {"points": data["curve"]["points"], "storage_ok": data["storage_ok"]}
    call.hass.bus.async_fire(f"{DOMAIN}_curve_response", response)
    return response if call.return_response else None


async def _handle_retry_storage(call: ServiceCall) -> None:
    entry = _get_entry(call.hass)
    points = entry.runtime_data["curve"].get("points", DEFAULT_CURVE_POINTS)
    if await _async_save_curve(entry, points):
        _LOGGER.info("BMS: Storage obnoven.")
    call.hass.bus.async_fire(f"{DOMAIN}_curve_changed")


async def _handle_save_profile(call: ServiceCall) -> None:
    hass = call.hass
    entry = _get_entry(hass)
    data = entry.runtime_data
    profiles = data["profiles"]
    name = call.data["name"].strip()
    if not name:
        return
    # Krátká pauza — dáme HA čas zpropagovat nedávné set_value volání do hass.states.
    # Bez pauzy může karta odeslat save_profile těsně po set_value a snapshot
    # zachytí ještě starou hodnotu (např. slunce_max_eff = -2 místo nového -5).
    await asyncio.sleep(0.3)
    # Snapshot pouze entit z whitelistu — nastavení integrace se neukládají
    profile_data: dict[str, Any] = {
        eid: state.state
        for eid in PROFILE_ENTITIES
        if (state := hass.states.get(eid)) is not None
    }
    profile_data["__curve_points__"] = data["curve"].get("points", [])
    # Zachovat meta-klíče stávajícího profilu (hvězdičky, plány)
    existing = profiles.get(name, {})
    for meta_key in ("__starred__", "__schedules__"):
        if meta_key in existing:
            profile_data[meta_key] = existing[meta_key]
    profiles[name] = profile_data
    await data["store"].async_save(profiles)
    # Logovat klíčové hodnoty pro diagnostiku (slunce a vlivy)
    debug_keys = [k for k in profile_data if "max_eff" in k or "slunce" in k]
    if debug_keys:
        debug_vals = {k: profile_data[k] for k in debug_keys}
        _LOGGER.info("BMS: Profil '%s' uložen — max_eff hodnoty: %s", name, debug_vals)
    else:
        _LOGGER.info("BMS: Profil '%s' uložen (%d entit).", name, len(profile_data))
    _async_update_profile_select(entry)
    hass.bus.async_fire(f"{DOMAIN}_profiles_changed")


async def _handle_load_profile(call: ServiceCall) -> None:
    hass = call.hass
    entry = _get_entry(hass)
    data = entry.runtime_data
    profiles = data["profiles"]
    name = call.data["name"].strip()
    if name not in profiles:
        _LOGGER.warning("BMS: Profil '%s' neexistuje.", name)
        return
    prof = profiles[name]
    if "__curve_points__" in prof:
        await _async_save_curve(entry, prof["__curve_points__"])
        hass.bus.async_fire(f"{DOMAIN}_curve_changed")

    tasks, eids = [], []
    for eid, val in prof.items():
        if eid.startswith("__"):
            continue
        # Aplikovat pouze entity z profil whitelistu — přeskočit nastavení integrace
        if eid not in PROFILE_ENTITIES:
            continue
        domain_part = eid.split(".")[0]
        if domain_part == "number":
            tasks.append(hass.services.async_call(
                "number", "set_value",
                {"entity_id": eid, "value": float(val)}, blocking=True))
            eids.append(eid)
        elif domain_part == "switch":
            tasks.append(hass.services.async_call(
                "switch", "turn_on" if val == "on" else "turn_off",
                {"entity_id": eid}, blocking=True))
            eids.append(eid)

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for eid, res in zip(eids, results, strict=True):
            if isinstance(res, Exception):
                _LOGGER.error("BMS: Chyba načtení %s: %s", eid, res)

    _async_update_profile_select(entry, active=name)
    # Persist aktivní profil aby přežil restart HA
    profiles["__active_profile__"] = name
    await data["store"].async_save(profiles)
    hass.bus.async_fire(f"{DOMAIN}_profiles_changed")


async def _handle_delete_profile(call: ServiceCall) -> None:
    hass = call.hass
    entry = _get_entry(hass)
    data = entry.runtime_data
    profiles = data["profiles"]
    name = call.data["name"].strip()
    if name not in profiles:
        return
    is_system = name in SYSTEM_PROFILE_NAMES
    if is_system:
        _LOGGER.warning(
            "BMS: Mažete výchozí sezónní profil '%s'. "
            "Profil lze znovu vytvořit restartem integrace.", name
        )
    del profiles[name]
    await data["store"].async_save(profiles)
    _async_update_profile_select(entry)
    hass.bus.async_fire(f"{DOMAIN}_profiles_changed", {"deleted": name, "was_system": is_system})


async def _handle_set_starred(call: ServiceCall) -> None:
    """Nastaví seznam hvězdičkových profilů."""
    data = _get_entry(call.hass).runtime_data
    profiles = data["profiles"]
    starred = [s for s in call.data["starred"] if s in profiles or s == DEFAULT_PROFILE][:15]
    profiles["__starred__"] = starred
    await data["store"].async_save(profiles)
    call.hass.bus.async_fire(f"{DOMAIN}_profiles_changed")


async def _handle_save_schedule(call: ServiceCall) -> None:
    """Uloží nebo aktualizuje pravidlo časového plánu."""
    data = _get_entry(call.hass).runtime_data
    profiles = data["profiles"]
    schedules = profiles.get("__schedules__", [])
    rule = {
        "id":        call.data.get("id") or str(uuid.uuid4())[:8],
        "enabled":   call.data.get("enabled", True),
        "type":      call.data.get("type", "date"),   # "date" nebo "temp"
        "profile":   call.data.get("profile", DEFAULT_PROFILE),
        # date type
        "date_from": call.data.get("date_from", ""),  # "MM-DD"
        "date_to":   call.data.get("date_to",   ""),  # "MM-DD"
        # temp type
        "temp_op":   call.data.get("temp_op",  "<"),  # "<" nebo ">"
        "temp_val":  float(call.data.get("temp_val", 5)),
        "temp_days": int(call.data.get("temp_days",  3)),
    }
    # Update existujícího nebo přidat nové
    existing_ids = [r["id"] for r in schedules]
    if rule["id"] in existing_ids:
        schedules[existing_ids.index(rule["id"])] = rule
    else:
        schedules.append(rule)
    profiles["__schedules__"] = schedules
    await data["store"].async_save(profiles)
    call.hass.bus.async_fire(f"{DOMAIN}_profiles_changed")


async def _handle_delete_schedule(call: ServiceCall) -> None:
    """Smaže pravidlo časového plánu."""
    data = _get_entry(call.hass).runtime_data
    profiles = data["profiles"]
    rule_id = call.data["id"]
    schedules = profiles.get("__schedules__", [])
    profiles["__schedules__"] = [r for r in schedules if r["id"] != rule_id]
    await data["store"].async_save(profiles)
    call.hass.bus.async_fire(f"{DOMAIN}_profiles_changed")


async def _handle_reorder_schedules(call: ServiceCall) -> None:
    """Přeřadí pravidla časového plánu podle zadaného pořadí ID."""
    data = _get_entry(call.hass).runtime_data
    profiles = data["profiles"]
    schedules = profiles.get("__schedules__", [])
    by_id = {r["id"]: r for r in schedules}
    profiles["__schedules__"] = [by_id[i] for i in call.data["order"] if i in by_id]
    await data["store"].async_save(profiles)
    call.hass.bus.async_fire(f"{DOMAIN}_profiles_changed")


async def _handle_activate_boost(call: ServiceCall) -> None:
    """Aktivuje boost — přidá X °C na Y hodin."""
    data   = _get_entry(call.hass).runtime_data
    amount = float(call.data.get("amount", data.get("boost_default_amount", 5.0)))
    hours  = float(call.data.get("hours",  data.get("boost_default_hours",  2.0)))
    until  = (dt_util.utcnow() + timedelta(hours=hours)).timestamp()
    data["boost"] = {"active": True, "amount": abs(amount), "until": until}
    _boost_log_event(data, "boost_start", abs(amount), hours)
    _LOGGER.info("BMS: Boost aktivován +%.1f °C na %.1f h.", amount, hours)


async def _handle_activate_reduction(call: ServiceCall) -> None:
    """Aktivuje útlum — odebere X °C na Y hodin."""
    data   = _get_entry(call.hass).runtime_data
    amount = float(call.data.get("amount", data.get("reduction_default_amount", 5.0)))
    hours  = float(call.data.get("hours",  data.get("boost_default_hours",  2.0)))
    until  = (dt_util.utcnow() + timedelta(hours=hours)).timestamp()
    data["boost"] = {"active": True, "amount": -abs(amount), "until": until}
    _boost_log_event(data, "reduction_start", -abs(amount), hours)
    _LOGGER.info("BMS: Útlum aktivován -%.1f °C na %.1f h.", amount, hours)


async def _handle_cancel_boost(call: ServiceCall) -> None:
    """Zruší aktivní boost nebo útlum."""
    data  = _get_entry(call.hass).runtime_data
    boost = data.get("boost", {})
    kind  = "boost_cancel" if boost.get("amount", 0) > 0 else "reduction_cancel"
    _boost_log_event(data, kind, boost.get("amount", 0), 0)
    data["boost"] = {"active": False}
    _LOGGER.info("BMS: Boost/útlum zrušen.")


async def _handle_force_refresh(call: ServiceCall) -> None:
    """Vynucený refresh — okamžitě přepočítá počasí, vlivy a výslednou teplotu."""
    _LOGGER.info("BMS: Zahajuji vynucený refresh.")
    entry_data    = _get_entry(call.hass).runtime_data
    diag_sensors  = entry_data.get("diag_sensors", [])
    result_sensor = entry_data.get("result_sensor")

    # 1) Refresh počasí (BMSWeatherSensor — fetch + store actual a forecast dat)
    weather_ok = False
    for s in diag_sensors:
        if hasattr(s, "async_fetch_and_store"):
            try:
                await s.async_fetch_and_store()
                weather_ok = True
                _LOGGER.info("BMS: Počasí refresh OK.")
            except Exception as e:  # noqa: BLE001 — výsledek hlásíme kartě
                _LOGGER.error("BMS: Počasí refresh selhal: %s", e)
            break

    # 2) Přepočet výsledné teploty + zápis do logu (BMSResultSensor)
    calc_ok = False
    if result_sensor is not None:
        try:
            await result_sensor.async_force_refresh()
            result_sensor.async_write_ha_state()
            calc_ok = True
            _LOGGER.info("BMS: Výpočet refresh OK.")
        except Exception as e:  # noqa: BLE001 — výsledek hlásíme kartě
            _LOGGER.error("BMS: Výpočet refresh selhal: %s", e)

    status = "ok" if (weather_ok and calc_ok) else ("partial" if (weather_ok or calc_ok) else "error")
    call.hass.bus.async_fire(f"{DOMAIN}_force_refresh_done", {
        "status":     status,
        "weather_ok": weather_ok,
        "calc_ok":    calc_ok,
        "time":       dt_util.now().strftime("%d.%m %H:%M:%S"),
    })
    _LOGGER.info("BMS: Vynucený refresh dokončen — status: %s", status)


SERVICE_HANDLERS = {
    "set_curve_points":   _handle_set_curve_points,
    "get_curve_points":   _handle_get_curve_points,
    "retry_storage":      _handle_retry_storage,
    "save_profile":       _handle_save_profile,
    "load_profile":       _handle_load_profile,
    "delete_profile":     _handle_delete_profile,
    "activate_boost":     _handle_activate_boost,
    "activate_reduction": _handle_activate_reduction,
    "cancel_boost":       _handle_cancel_boost,
    "force_refresh":      _handle_force_refresh,
    "set_starred":        _handle_set_starred,
    "save_schedule":      _handle_save_schedule,
    "delete_schedule":    _handle_delete_schedule,
    "reorder_schedules":  _handle_reorder_schedules,
}
