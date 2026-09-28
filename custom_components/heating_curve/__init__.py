import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.event import async_track_state_change_event
from .const import (
    DOMAIN, PLATFORMS,
    STORAGE_KEY, STORAGE_VERSION,
    CURVE_STORAGE_KEY, CURVE_STORAGE_VERSION,
    DEFAULT_CURVE_POINTS,
    PROFILE_ENTITIES,
)

_LOGGER = logging.getLogger(__name__)

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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
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
        except Exception as e:
            _LOGGER.error("BMS: Nepodařilo se uložit výchozí profily: %s", e)

    curve_store = Store(hass, CURVE_STORAGE_VERSION, CURVE_STORAGE_KEY)
    curve_data: dict = await curve_store.async_load() or {}
    if "points" not in curve_data:
        curve_data = {"points": list(DEFAULT_CURVE_POINTS), "storage_ok": True}
        try:
            await curve_store.async_save(curve_data)
        except Exception as e:
            _LOGGER.error("BMS: Nepodařilo se inicializovat curve storage: %s", e)
            curve_data["storage_ok"] = False

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "store":               store,
        "curve_store":         curve_store,
        "profiles":            profiles,
        "curve":               curve_data,
        "storage_ok":          curve_data.get("storage_ok", True),
        "system_profiles":     SYSTEM_PROFILE_NAMES,
    }

    # Obnovit aktivní profil z uložené hodnoty (přežije restart HA)
    _active_profile = profiles.get("__active_profile__", "Výchozí")
    if _active_profile not in profiles and _active_profile != "Výchozí":
        _active_profile = "Výchozí"

    async def _save_curve(points: list) -> bool:
        data = hass.data[DOMAIN][entry.entry_id]
        data["curve"]["points"] = points
        try:
            await curve_store.async_save({"points": points, "storage_ok": True})
            data["storage_ok"] = True
            _LOGGER.debug("BMS: Křivka uložena (%d bodů).", len(points))
            return True
        except Exception as e:
            _LOGGER.error(
                "BMS: Selhání Storage při ukládání křivky: %s — "
                "body jsou uloženy pouze v paměti (přežijí do restartu HA).", e
            )
            data["storage_ok"] = False
            # Pozn.: fallback na number.bms_bod_N_x/y entity byl odstraněn —
            # tyto entity neexistují. Křivka je bezpečně uložena v hass.data
            # a bude dostupná po celou dobu běhu HA bez restartu.
            return False

    async def handle_set_curve_points(call):
        raw = call.data.get("points", [])
        if not isinstance(raw, list) or len(raw) < 2:
            _LOGGER.error("BMS: set_curve_points — potřebuji alespoň 2 body.")
            return
        points = [{"x": float(p["x"]), "y": float(p["y"])} for p in raw if "x" in p and "y" in p]
        points.sort(key=lambda p: p["x"])
        await _save_curve(points)
        hass.bus.async_fire(f"{DOMAIN}_curve_changed")

    async def handle_get_curve_points(call):
        data = hass.data[DOMAIN][entry.entry_id]
        hass.bus.async_fire(f"{DOMAIN}_curve_response", {
            "points": data["curve"]["points"], "storage_ok": data["storage_ok"],
        })

    async def handle_retry_storage(call):
        data = hass.data[DOMAIN][entry.entry_id]
        points = data["curve"].get("points", DEFAULT_CURVE_POINTS)
        if await _save_curve(points):
            _LOGGER.info("BMS: Storage obnoven.")
        hass.bus.async_fire(f"{DOMAIN}_curve_changed")

    async def handle_save_profile(call):
        name = call.data.get("name", "").strip()
        if not name:
            return
        # Krátká pauza — dáme HA čas zpropagovat nedávné set_value volání do hass.states.
        # Bez pauzy může karta odeslat save_profile těsně po set_value a snapshot
        # zachytí ještě starou hodnotu (např. slunce_max_eff = -2 místo nového -5).
        import asyncio as _asyncio
        await _asyncio.sleep(0.3)
        # Snapshot pouze entit z whitelistu — nastavení integrace se neukládají
        profile_data = {
            s.entity_id: s.state
            for s in hass.states.async_all()
            if s.entity_id in PROFILE_ENTITIES
        }
        profile_data["__curve_points__"] = hass.data[DOMAIN][entry.entry_id]["curve"].get("points", [])
        # Zachovat meta-klíče stávajícího profilu (hvězdičky, plány)
        existing = profiles.get(name, {})
        for meta_key in ("__starred__", "__schedules__"):
            if meta_key in existing:
                profile_data[meta_key] = existing[meta_key]
        profiles[name] = profile_data
        await store.async_save(profiles)
        # Logovat klíčové hodnoty pro diagnostiku (slunce a vlivy)
        debug_keys = [k for k in profile_data if "max_eff" in k or "slunce" in k]
        if debug_keys:
            debug_vals = {k: profile_data[k] for k in debug_keys}
            _LOGGER.info("BMS: Profil '%s' uložen — max_eff hodnoty: %s", name, debug_vals)
        else:
            _LOGGER.info("BMS: Profil '%s' uložen (%d entit).", name, len(profile_data))
        _refresh_profile_select(hass, entry, profiles=profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed")

    async def handle_load_profile(call):
        name = call.data.get("name", "").strip()
        if name not in profiles:
            _LOGGER.warning("BMS: Profil '%s' neexistuje.", name)
            return
        prof = profiles[name]
        if "__curve_points__" in prof:
            await _save_curve(prof["__curve_points__"])
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
            import asyncio
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for eid, res in zip(eids, results):
                if isinstance(res, Exception):
                    _LOGGER.error("BMS: Chyba načtení %s: %s", eid, res)

        _refresh_profile_select(hass, entry, active=name, profiles=profiles)
        # Persist aktivní profil aby přežil restart HA
        profiles["__active_profile__"] = name
        await store.async_save(profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed")

    async def handle_delete_profile(call):
        name = call.data.get("name", "").strip()
        if name not in profiles:
            return
        is_system = name in SYSTEM_PROFILE_NAMES
        if is_system:
            _LOGGER.warning(
                "BMS: Mažete výchozí sezónní profil '%s'. "
                "Profil lze znovu vytvořit restartem integrace.", name
            )
        del profiles[name]
        await store.async_save(profiles)
        _refresh_profile_select(hass, entry, profiles=profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed", {"deleted": name, "was_system": is_system})

    async def handle_set_starred(call):
        """Nastaví seznam hvězdičkových profilů."""
        starred = call.data.get("starred", [])
        starred = [s for s in starred if s in profiles or s == "Výchozí"][:15]
        profiles["__starred__"] = starred
        await store.async_save(profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed")

    async def handle_save_schedule(call):
        """Uloží nebo aktualizuje pravidlo časového plánu."""
        import uuid as _uuid
        schedules = profiles.get("__schedules__", [])
        rule = {
            "id":       call.data.get("id") or str(_uuid.uuid4())[:8],
            "enabled":  call.data.get("enabled", True),
            "type":     call.data.get("type", "date"),   # "date" nebo "temp"
            "profile":  call.data.get("profile", "Výchozí"),
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
        await store.async_save(profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed")

    async def handle_delete_schedule(call):
        """Smaže pravidlo časového plánu."""
        rule_id = call.data.get("id", "")
        schedules = profiles.get("__schedules__", [])
        profiles["__schedules__"] = [r for r in schedules if r["id"] != rule_id]
        await store.async_save(profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed")

    async def handle_reorder_schedules(call):
        """Přeřadí pravidla časového plánu podle zadaného pořadí ID."""
        order = call.data.get("order", [])
        schedules = profiles.get("__schedules__", [])
        by_id = {r["id"]: r for r in schedules}
        profiles["__schedules__"] = [by_id[i] for i in order if i in by_id]
        await store.async_save(profiles)
        hass.bus.async_fire(f"{DOMAIN}_profiles_changed")

    async def handle_activate_boost(call):
        """Aktivuje boost — přidá X °C na Y hodin."""
        from datetime import datetime, timezone, timedelta
        data   = hass.data[DOMAIN][entry.entry_id]
        amount = float(call.data.get("amount", data.get("boost_default_amount", 5.0)))
        hours  = float(call.data.get("hours",  data.get("boost_default_hours",  2.0)))
        until  = (datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp()
        data["boost"] = {"active": True, "amount": abs(amount), "until": until}
        _boost_log_event(data, "boost_start", abs(amount), hours)
        _LOGGER.info("BMS: Boost aktivován +%.1f °C na %.1f h.", amount, hours)

    async def handle_activate_reduction(call):
        """Aktivuje útlum — odebere X °C na Y hodin."""
        from datetime import datetime, timezone, timedelta
        data   = hass.data[DOMAIN][entry.entry_id]
        amount = float(call.data.get("amount", data.get("reduction_default_amount", 5.0)))
        hours  = float(call.data.get("hours",  data.get("boost_default_hours",  2.0)))
        until  = (datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp()
        data["boost"] = {"active": True, "amount": -abs(amount), "until": until}
        # Záznam do výpočetního logu
        _boost_log_event(data, "reduction_start", -abs(amount), hours)
        _LOGGER.info("BMS: Útlum aktivován -%.1f °C na %.1f h.", amount, hours)

    async def handle_cancel_boost(call):
        """Zruší aktivní boost nebo útlum."""
        data  = hass.data[DOMAIN][entry.entry_id]
        boost = data.get("boost", {})
        kind  = "boost_cancel" if boost.get("amount", 0) > 0 else "reduction_cancel"
        _boost_log_event(data, kind, boost.get("amount", 0), 0)
        data["boost"] = {"active": False}
        _LOGGER.info("BMS: Boost/útlum zrušen.")

    async def handle_force_refresh(call):
        """Vynucený refresh — okamžitě přepočítá počasí, vlivy a výslednou teplotu."""
        from datetime import datetime as _dt
        _LOGGER.info("BMS: Zahajuji vynucený refresh.")
        entry_data   = hass.data[DOMAIN][entry.entry_id]
        diag_sensors = entry_data.get("diag_sensors", [])
        result_sensor= entry_data.get("result_sensor")

        # 1) Refresh počasí (BMSWeatherSensor — fetch + store actual a forecast dat)
        weather_ok = False
        for s in diag_sensors:
            if hasattr(s, "_fetch_and_store"):
                try:
                    await s._fetch_and_store()
                    weather_ok = True
                    _LOGGER.info("BMS: Počasí refresh OK.")
                except Exception as e:
                    _LOGGER.error("BMS: Počasí refresh selhal: %s", e)
                break

        # 2) Přepočet výsledné teploty + zápis do logu (BMSResultSensor)
        calc_ok = False
        if result_sensor and hasattr(result_sensor, "async_force_refresh"):
            try:
                await result_sensor.async_force_refresh()
                result_sensor.async_write_ha_state()
                calc_ok = True
                _LOGGER.info("BMS: Výpočet refresh OK.")
            except Exception as e:
                _LOGGER.error("BMS: Výpočet refresh selhal: %s", e)

        status = "ok" if (weather_ok and calc_ok) else ("partial" if (weather_ok or calc_ok) else "error")
        hass.bus.async_fire(f"{DOMAIN}_force_refresh_done", {
            "status":      status,
            "weather_ok":  weather_ok,
            "calc_ok":     calc_ok,
            "time":        _dt.now().strftime("%d.%m %H:%M:%S"),
        })
        _LOGGER.info("BMS: Vynucený refresh dokončen — status: %s", status)

    for svc, handler in [
        ("set_curve_points",   handle_set_curve_points),
        ("get_curve_points",   handle_get_curve_points),
        ("retry_storage",      handle_retry_storage),
        ("save_profile",       handle_save_profile),
        ("load_profile",       handle_load_profile),
        ("delete_profile",     handle_delete_profile),
        ("activate_boost",     handle_activate_boost),
        ("activate_reduction", handle_activate_reduction),
        ("cancel_boost",       handle_cancel_boost),
        ("force_refresh",      handle_force_refresh),
        ("set_starred",        handle_set_starred),
        ("save_schedule",      handle_save_schedule),
        ("delete_schedule",    handle_delete_schedule),
        ("reorder_schedules",  handle_reorder_schedules),
    ]:
        hass.services.async_register(DOMAIN, svc, handler)

    async def _clamp_curve_to_limits():
        t_min_s = hass.states.get("number.bms_limit_min")
        t_max_s = hass.states.get("number.bms_limit_max")
        if not t_min_s or not t_max_s:
            return
        try:
            t_min, t_max = float(t_min_s.state), float(t_max_s.state)
        except ValueError:
            return
        data = hass.data[DOMAIN][entry.entry_id]
        points = data["curve"].get("points", [])
        new_pts, changed = [], False
        for p in points:
            y_new = max(t_min, min(t_max, float(p["y"])))
            new_pts.append({"x": float(p["x"]), "y": y_new})
            if abs(y_new - float(p["y"])) > 0.01:
                changed = True
        if changed:
            _LOGGER.info("BMS: Limity změněny, ořezávám křivku.")
            await _save_curve(new_pts)
            hass.bus.async_fire(f"{DOMAIN}_curve_changed")

    async def _on_limit_changed(event):
        s = event.data.get("new_state")
        if s and s.state not in ("unavailable", "unknown"):
            await _clamp_curve_to_limits()

    entry.async_on_unload(
        async_track_state_change_event(
            hass, ["number.bms_limit_min", "number.bms_limit_max"], _on_limit_changed
        )
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # Nastavit select entitu s obnoveným aktivním profilem
    _refresh_profile_select(hass, entry, active=_active_profile, profiles=profiles)

    # 3a — Obnovení profilu při restartu HA
    # POZOR: Neaplikujeme celý profil automaticky při restartu — RestoreNumber
    # a RestoreEntity v number.py / switch.py si hodnoty pamatují samy z HA recorderu.
    # Automatická aplikace profilu by přepsala hodnoty, které uživatel změnil
    # po posledním uložení profilu (např. slunce_max_eff z -2 na -5).
    #
    # Profil se aplikuje POUZE při explicitním volání load_profile nebo select_option,
    # nikoli automaticky při každém restartu HA.
    #
    # _active_profile se používá jen pro zobrazení aktivního profilu v select entitě.
    if _active_profile != "Výchozí" and _active_profile in profiles:
        _LOGGER.info(
            "BMS: Aktivní profil při restartu: '%s' — hodnoty entit jsou obnoveny "
            "z HA recorderu (RestoreNumber/RestoreEntity), profil se neaplikuje znovu.",
            _active_profile
        )

    return True


def _boost_log_event(data: dict, kind: str, amount: float, hours: float) -> None:
    """Zapíše událost boost/útlum do výpočetního logu."""
    from datetime import datetime as _dt
    from .const import CALC_LOG_SIZE
    calc_log = data.get("calc_log", [])
    calc_log.insert(0, {
        "time":   _dt.now().strftime("%d.%m %H:%M"),
        "event":  kind,
        "amount": amount,
        "hours":  hours,
        "manual": True,
    })
    data["calc_log"] = calc_log[:CALC_LOG_SIZE]


def _refresh_profile_select(
    hass: HomeAssistant,
    entry: ConfigEntry,
    active: str | None = None,
    profiles: dict | None = None,
):
    eid = "select.bms_profil_krivky"
    current = hass.states.get(eid)
    state = active if active is not None else (current.state if current else "Výchozí")
    if profiles is None:
        # Fallback: přečíst z hass.data (při inicializaci)
        profiles = hass.data.get("heating_curve", {}).get(entry.entry_id, {}).get("profiles", {})
    options = ["Výchozí"] + sorted(k for k in profiles if k != "Výchozí" and not k.startswith("__"))
    hass.states.async_set(eid, state, {"options": options})


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
        return True
    return False