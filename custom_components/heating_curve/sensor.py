import logging
from datetime import datetime, timedelta, timezone
from homeassistant.components.sensor import SensorEntity
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN, STATE_ON
from homeassistant.core import callback
from homeassistant.helpers.event import async_track_state_change_event
from .const import (
    DOMAIN, CONF_OUTDOOR_SENSOR, CONF_WEATHER, CONF_SUN,
    DEFAULT_CURVE_POINTS, INFLUENCE_DEFAULTS,
    DEFAULT_SAFE_OUTDOOR_TEMP, TEMP_SOURCE_SENSOR, TEMP_SOURCE_WEATHER, TEMP_SOURCE_SAFE,
    CALC_LOG_SIZE,
)

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(minutes=30)


async def async_setup_entry(hass, entry, async_add_entities):
    result_sensor = BMSResultSensor(hass, entry)
    diag_sensors = [
        BMSDiagSensor(hass, entry, "Venkovní teplota použitá",  "applied_out_temp", "°C"),
        BMSDiagSensor(hass, entry, "Venkovní teplota naměřená", "raw_outdoor_temp",  "°C"),
        BMSDiagSensor(hass, entry, "Teplota ze křivky",         "curve_temp",        "°C"),
        BMSDiagSensor(hass, entry, "Celková modifikace",        "total_correction",  "°C"),
        BMSDiagSensor(hass, entry, "Výsledná po limitu",        "clamped_temp",      "°C"),
        # Aktuální (live) meteorologická data
        BMSDiagSensor(hass, entry, "Aktuální vítr",             "actual_wind",       "km/h"),
        BMSDiagSensor(hass, entry, "Aktuální srážky",           "actual_rain",       "mm/h"),
        BMSDiagSensor(hass, entry, "Aktuální oblačnost",        "actual_clouds",     "%"),
        BMSDiagSensor(hass, entry, "Aktuální vlhkost",          "actual_humidity",   "%"),
        # Předpovídaná meteorologická data
        BMSDiagSensor(hass, entry, "Předpověď vítr",            "forecast_wind",     "km/h"),
        BMSDiagSensor(hass, entry, "Předpověď srážky",          "forecast_rain",     "mm/h"),
        BMSDiagSensor(hass, entry, "Předpověď oblačnost",       "forecast_clouds",   "%"),
        BMSDiagSensor(hass, entry, "Předpověď vlhkost",         "forecast_humidity", "%"),
        BMSDiagSensor(hass, entry, "Předpověď teplota",         "forecast_temp",     "°C"),
        # Applied (hodnota vstupující do výpočtu — actual nebo forecast dle přepínače)
        # Poloha slunce — aktuální i předpovídaná
        BMSDiagSensor(hass, entry, "Elevace slunce",            "sun_elevation",     "°"),
        BMSDiagSensor(hass, entry, "Azimut slunce",             "sun_azimuth",       "°"),
        BMSDiagSensor(hass, entry, "Aktuální elevace slunce",   "actual_sun_elevation", "°"),
        BMSDiagSensor(hass, entry, "Aktuální azimut slunce",    "actual_sun_azimuth",   "°"),
        BMSDiagSensor(hass, entry, "Předpověď elevace slunce",  "forecast_sun_elevation", "°"),
        BMSDiagSensor(hass, entry, "Předpověď azimut slunce",   "forecast_sun_azimuth",   "°"),
        # Korekce
        BMSDiagSensor(hass, entry, "Korekce vítr",              "corr_wind",         "°C"),
        BMSDiagSensor(hass, entry, "Korekce srážky",            "corr_rain",         "°C"),
        BMSDiagSensor(hass, entry, "Korekce vlhkost",           "corr_humidity",     "°C"),
        BMSDiagSensor(hass, entry, "Korekce oblačnost",         "corr_clouds",       "°C"),
        BMSDiagSensor(hass, entry, "Korekce slunce",            "corr_sun",          "°C"),
        BMSStorageStatusSensor(hass, entry),
        BMSTempSourceSensor(hass, entry),
        BMSBoostSensor(hass, entry),
        BMSWeatherSensor(hass, entry),
        BMSInfluencesLogSensor(hass, entry),
    ]
    hass.data[DOMAIN][entry.entry_id]["diag_sensors"] = diag_sensors
    hass.data[DOMAIN][entry.entry_id]["result_sensor"] = result_sensor
    async_add_entities([result_sensor] + diag_sensors, False)

    @callback
    def _on_ha_started(_event):
        hass.async_create_task(_initial_update())

    async def _initial_update():
        # Nastavit SCAN_INTERVAL z uložené hodnoty před prvním updatem
        _apply_scan_interval(result_sensor, hass, entry)
        await result_sensor.async_update()
        result_sensor.async_write_ha_state()

    hass.bus.async_listen_once("homeassistant_started", _on_ha_started)

    # ── Hystereze — sledování venkovní teploty ───────────────────────────────
    # Při změně venkovní teploty o delta °C spustit přepočet (pokud je režim "teplota" nebo "oboji")
    outdoor_eid = entry.data.get(CONF_OUTDOOR_SENSOR)
    weather_eid = entry.data.get(CONF_WEATHER)
    track_outdoor = [e for e in [outdoor_eid, weather_eid] if e]

    if track_outdoor:
        @callback
        def _on_outdoor_temp_changed(event):
            new_state = event.data.get("new_state")
            if new_state is None or new_state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                return
            rezim = hass.states.get("select.bms_prepocet_rezim")
            if not rezim or rezim.state not in ("teplota", "oboji"):
                return
            try:
                new_temp = float(new_state.state)
            except (ValueError, TypeError):
                # Pro weather entitu čteme atribut temperature
                attrs = new_state.attributes or {}
                try:
                    new_temp = float(attrs.get("temperature", 0))
                except (ValueError, TypeError):
                    return
            last_temp = hass.data[DOMAIN][entry.entry_id].get("last_compute_temp")
            delta = hass.states.get("number.bms_prepocet_delta")
            delta_val = float(delta.state) if delta and delta.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN) else 0.5
            if last_temp is None or abs(new_temp - last_temp) >= delta_val:
                hass.data[DOMAIN][entry.entry_id]["last_compute_temp"] = new_temp
                _LOGGER.debug("BMS Hystereze: teplota změněna o %.1f°C → spouštím přepočet.", abs(new_temp - (last_temp or new_temp)))
                hass.async_create_task(_do_hysteresis_compute())

        async def _do_hysteresis_compute():
            await result_sensor.async_refresh_data()
            result_sensor.async_write_ha_state()

        entry.async_on_unload(
            async_track_state_change_event(hass, track_outdoor, _on_outdoor_temp_changed)
        )

    # ── Sledování změny intervalu přepočtu ──────────────────────────────────
    @callback
    def _on_interval_changed(event):
        new_state = event.data.get("new_state")
        if new_state and new_state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            _apply_scan_interval(result_sensor, hass, entry)

    entry.async_on_unload(
        async_track_state_change_event(
            hass, ["number.bms_prepocet_interval"], _on_interval_changed
        )
    )


def _apply_scan_interval(result_sensor, hass, entry):
    """Nastaví SCAN_INTERVAL dynamicky z number.bms_prepocet_interval."""
    s = hass.states.get("number.bms_prepocet_interval")
    try:
        minutes = max(1, int(float(s.state))) if s and s.state not in ("unavailable", "unknown") else 30
    except (ValueError, TypeError):
        minutes = 30
    from datetime import timedelta
    result_sensor._attr_scan_interval = timedelta(minutes=minutes)
    _LOGGER.debug("BMS: SCAN_INTERVAL nastaven na %d min.", minutes)


class BMSSensorBase(SensorEntity):
    def __init__(self, hass, entry, name, key, unit="°C"):
        self._hass = hass
        self._entry = entry
        self._attr_name = f"BMS {name}"
        self.entity_id = f"sensor.bms_{key}"
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_native_unit_of_measurement = unit
        self._attr_device_info = {"identifiers": {(DOMAIN, entry.entry_id)}, "name": "BMS Regulátor"}

    def _num(self, key, fallback=None):
        s = self._hass.states.get(f"number.bms_{key}")
        if s and s.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            try:
                return float(s.state)
            except ValueError:
                pass
        return fallback

    def _sw(self, key) -> bool:
        s = self._hass.states.get(f"switch.bms_{key}")
        return s is not None and s.state == STATE_ON

    def _get_curve_points(self) -> list[tuple[float, float]]:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        # Primárně ze Storage — spolehlivé od první inicializace
        pts = data.get("curve", {}).get("points")
        if pts:
            try:
                nodes = [(float(p["x"]), float(p["y"])) for p in pts]
                if len(nodes) >= 2:
                    return sorted(nodes)
            except (KeyError, TypeError, ValueError) as e:
                _LOGGER.warning("BMS: Chyba parsování bodů ze Storage: %s", e)
        # Fallback na výchozí křivku (první spuštění nebo poškozená Storage)
        _LOGGER.warning("BMS: Storage křivky nedostupná — používám výchozí body.")
        return [(float(p["x"]), float(p["y"])) for p in DEFAULT_CURVE_POINTS]


class BMSResultSensor(BMSSensorBase):
    def __init__(self, hass, entry):
        super().__init__(hass, entry, "Výsledná teplota", "calc_temp", "°C")
        self._state = None
        self._attr_scan_interval = SCAN_INTERVAL

    @property
    def native_value(self):
        return self._state

    @property
    def extra_state_attributes(self) -> dict:
        from datetime import datetime
        data     = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        profiles = data.get("profiles", {})
        # Výpočet délky výpadku senzoru v minutách
        safe_since = data.get("sensor_safe_since")
        safe_since_min = round((datetime.now().timestamp() - safe_since) / 60) if safe_since else 0
        # Hvězdičkové profily — fallback na sezónní
        default_starred = ["Zima", "Jaro/Podzim", "Léto"]
        starred = profiles.get("__starred__", default_starred)
        schedules = profiles.get("__schedules__", [])
        return {
            "calc_log":          data.get("calc_log", []),
            "clamp_log":         data.get("clamp_log", []),
            "safe_since_min":    safe_since_min,
            "night_active":      data.get("night_active", False),
            "frost_active":      data.get("frost_active", False),
            "boost_active":      data.get("boost_active", False),
            "starred_profiles":  starred,
            "schedules":         schedules,
            # Aktuální (live) meteorologická data — vždy k dispozici
            "actual_wind":       data.get("actual_wind",      0.0),
            "actual_rain":       data.get("actual_rain",      0.0),
            "actual_clouds":     data.get("actual_clouds",    0.0),
            "actual_humidity":   data.get("actual_humidity",  0.0),
            # Předpovídaná data — vždy načítaná (None pokud forecast nedostupný)
            "forecast_wind":     data.get("forecast_wind"),
            "forecast_rain":     data.get("forecast_rain"),
            "forecast_clouds":   data.get("forecast_clouds"),
            "forecast_humidity": data.get("forecast_humidity"),
            "forecast_temp":     data.get("forecast_temp"),
            # Poloha slunce — aktuální i předpovídaná
            "actual_sun_elevation":   data.get("actual_sun_elevation"),
            "actual_sun_azimuth":     data.get("actual_sun_azimuth"),
            "forecast_sun_elevation": data.get("forecast_sun_elevation"),
            "forecast_sun_azimuth":   data.get("forecast_sun_azimuth"),
        }

    async def async_update(self):
        """Pravidelný update (každých 30 min) — přepočítá vše a nastaví termostat."""
        await self._async_compute(write_thermostat=True)

    async def async_refresh_data(self):
        """Reaktivní update při změně počasí — přepočítá data pro UI, termostat nechá být."""
        await self._async_compute(write_thermostat=False)

    async def async_force_refresh(self):
        """Vynucený manuální refresh — přepočítá vše, zapíše do logu s příznakem manual."""
        await self._async_compute(write_thermostat=True, force_log=True)

    async def _async_compute(self, write_thermostat: bool = True, force_log: bool = False):
        data = self._hass.data[DOMAIN][self._entry.entry_id]
        regulation_active = self._sw("hlavni_vypinac")

        try:
            # ── Venkovní teplota — tříúrovňový fallback ────────────────────
            out_eid     = self._entry.data.get(CONF_OUTDOOR_SENSOR)
            weather_eid = self._entry.data.get(CONF_WEATHER)
            temp_source = TEMP_SOURCE_SAFE
            applied_temp = self._num("safe_temp", DEFAULT_SAFE_OUTDOOR_TEMP)

            out_state = self._hass.states.get(out_eid)
            if out_state and out_state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN, None):
                try:
                    applied_temp = float(out_state.state)
                    temp_source = TEMP_SOURCE_SENSOR
                except ValueError:
                    pass

            applied_wind = applied_rain = applied_clouds = applied_hum = 0.0
            weather_state = self._hass.states.get(weather_eid)

            if temp_source == TEMP_SOURCE_SAFE and weather_state and \
               weather_state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                raw = weather_state.attributes.get("temperature")
                if raw is not None:
                    try:
                        applied_temp = float(raw)
                        temp_source = TEMP_SOURCE_WEATHER
                    except (ValueError, TypeError):
                        pass

            if temp_source == TEMP_SOURCE_SAFE:
                _LOGGER.warning("BMS: Žádný zdroj teploty — používám bezpečnou %.1f °C.", applied_temp)

            data["temp_source"] = temp_source

            # ── Aktuální data počasí — načítáme VŽDY ─────────────────────────
            # actual_* = live hodnoty z weather entity (vždy k dispozici pro UI i výpočet)
            # applied_* = hodnoty vstupující do výpočtu (actual nebo forecast podle přepínače)
            actual_wind = actual_rain = actual_clouds = actual_hum = 0.0
            if weather_state and weather_state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                a = weather_state.attributes
                actual_wind   = float(a.get("wind_speed",     0.0))
                actual_rain   = float(a.get("precipitation",  0.0))
                actual_clouds = float(a.get("cloud_coverage", 0.0))
                actual_hum    = float(a.get("humidity",       0.0))

            # Výchozí: do výpočtu vstupují aktuální data
            applied_wind   = actual_wind
            applied_rain   = actual_rain
            applied_clouds = actual_clouds
            applied_hum    = actual_hum

            # forecast_* — předpovídané hodnoty (None = forecast nebyl načten / weather nedostupný)
            forecast_wind = forecast_rain = forecast_clouds = forecast_hum = None
            forecast_temp = None  # předpovídaná venkovní teplota (pro UI i graf)

            # ── Předpověď — načítáme VŽDY pro zobrazení v UI ──────────────
            # applied_* se přepíší jen pokud je předpověď zapnutá.
            # forecast_* jsou vždy k dispozici pro dual-value zobrazení v kartách.
            raw_outdoor = applied_temp
            if weather_eid:
                offset_h = int(self._num("predpoved_hodin", 24))
                try:
                    resp = await self._hass.services.async_call(
                        "weather", "get_forecasts",
                        {"entity_id": weather_eid, "type": "hourly"},
                        blocking=True, return_response=True,
                    )
                    if resp and weather_eid in resp:
                        forecasts = resp[weather_eid].get("forecast", [])
                        if forecasts:
                            target_ts = (datetime.now(timezone.utc) + timedelta(hours=offset_h)).timestamp()
                            fc = min(forecasts, key=lambda f: abs(
                                datetime.fromisoformat(f["datetime"].replace("Z", "+00:00")).timestamp() - target_ts
                            ))
                            forecast_temp   = float(fc.get("temperature",    applied_temp))
                            forecast_wind   = float(fc.get("wind_speed",     actual_wind))
                            forecast_rain   = float(fc.get("precipitation",  actual_rain))
                            forecast_clouds = float(fc.get("cloud_coverage", actual_clouds))
                            forecast_hum    = float(fc.get("humidity",       actual_hum))
                            # Per-vliv forecast přepínače — každý vliv si řídí vlastní zdroj
                            if self._sw("vitr_predpoved"):
                                applied_wind = forecast_wind
                            if self._sw("srazky_predpoved"):
                                applied_rain = forecast_rain
                            if self._sw("oblacnost_predpoved"):
                                applied_clouds = forecast_clouds
                            if self._sw("vlhkost_predpoved"):
                                applied_hum = forecast_hum
                            # Teplota — stále řízena globálním přepínačem (nebo automaticky)
                            if self._sw("pouziti_predpovedi"):
                                applied_temp = forecast_temp
                except Exception as e:
                    _LOGGER.error("BMS: Chyba předpovědi: %s", e)

            # Vlivy se počítají VŽDY (z actual nebo forecast dat podle přepínače).

            # ── Interpolace křivky ─────────────────────────────────────────
            nodes = self._get_curve_points()
            curve_temp = 20.0
            if len(nodes) >= 2:
                if applied_temp <= nodes[0][0]:
                    curve_temp = nodes[0][1]
                elif applied_temp >= nodes[-1][0]:
                    curve_temp = nodes[-1][1]
                else:
                    for i in range(len(nodes) - 1):
                        x1, y1 = nodes[i]; x2, y2 = nodes[i + 1]
                        if x1 <= applied_temp <= x2:
                            curve_temp = y1 + (applied_temp - x1) / (x2 - x1) * (y2 - y1)
                            break

            # ── Noční mód ─────────────────────────────────────────────────
            night_offset = 0.0
            night_active = False
            if self._sw("night_mode"):
                now_h = datetime.now().hour
                day_start = int(self._num("day_start", 6))
                day_end   = int(self._num("day_end",   22))
                # Noční = mimo denní okno
                if day_start <= day_end:
                    is_day = day_start <= now_h < day_end
                else:  # přes půlnoc
                    is_day = now_h >= day_start or now_h < day_end
                if not is_day:
                    night_offset = self._num("night_offset", -5.0) or 0.0
                    night_active = True

            # ── Lineární efekty vlivů ──────────────────────────────────────
            def lin(val, key):
                d = INFLUENCE_DEFAULTS.get(key, {})
                fv  = self._num(f"{key}_od",      d.get("from", 0))
                tv  = self._num(f"{key}_do",      d.get("to",   1))
                mx  = self._num(f"{key}_max_eff", d.get("max",  0))
                if tv <= fv or val <= fv: return 0.0
                return float(mx) if val >= tv else float(mx) * (val - fv) / (tv - fv)

            corr_wind   = lin(applied_wind,   "vitr")      if self._sw("vliv_vitr")      else 0.0
            corr_rain   = lin(applied_rain,   "srazky")    if self._sw("vliv_srazky")    else 0.0
            corr_hum    = lin(applied_hum,    "vlhkost")   if self._sw("vliv_vlhkost")   else 0.0
            corr_clouds = lin(applied_clouds, "oblacnost") if self._sw("vliv_oblacnost") else 0.0

            # ── Slunce — poloha se počítá VŽDY (pro diag senzory a UI graf) ────
            import math
            sun_eid = self._entry.data.get(CONF_SUN)
            sun_s   = self._hass.states.get(sun_eid)

            # Aktuální poloha slunce — z HA entity
            actual_el = actual_az = None
            if sun_s and sun_s.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                actual_el = float(sun_s.attributes.get("elevation", 0))
                actual_az = float(sun_s.attributes.get("azimuth",   0))

            # Předpovídaná poloha slunce — výpočet VŽDY (pro UI i výpočet při předpovědi)
            fc_el = fc_az = None
            try:
                from homeassistant.helpers.sun import get_astral_location
                offset_h_sun = int(self._num("predpoved_hodin", 24))
                future_dt    = datetime.now(timezone.utc) + timedelta(hours=offset_h_sun)
                location, _  = get_astral_location(self._hass)
                fc_el = location.solar_elevation(future_dt)
                fc_az = location.solar_azimuth(future_dt)
                _LOGGER.debug("BMS: Slunce (předpověď +%dh): el=%.1f° az=%.1f°", offset_h_sun, fc_el, fc_az)
            except Exception as e:
                _LOGGER.warning("BMS: Nelze vypočítat předpovězené slunce: %s", e)

            # Uložit obě polohy do data pro UI/diag senzory — vždy
            if actual_el is not None:
                data["actual_sun_elevation"] = round(actual_el, 1)
                data["actual_sun_azimuth"]   = round(actual_az, 1)
            if fc_el is not None:
                data["forecast_sun_elevation"] = round(fc_el, 1)
                data["forecast_sun_azimuth"]   = round(fc_az, 1)

            # Poloha vstupující do výpočtu: forecast při zapnuté předpovědi, jinak actual
            _sun_el = _sun_az = None
            if self._sw("pouziti_predpovedi") and fc_el is not None:
                _sun_el, _sun_az = fc_el, fc_az
            elif actual_el is not None:
                _sun_el, _sun_az = actual_el, actual_az
            # Applied poloha (zpětná kompatibilita)
            if _sun_el is not None:
                data["sun_elevation"] = round(_sun_el, 1)
                data["sun_azimuth"]   = round(_sun_az, 1)

            # ── Korekce slunce — jen pokud je vliv zapnutý ─────────────────
            corr_sun = 0.0
            if self._sw("vliv_slunce") and _sun_el is not None:
                sf  = self._num("solarni_start", 140)
                st  = self._num("solarni_konec", 220)
                mx  = self._num("slunce_max_eff", -2.0)
                _LOGGER.debug(
                    "BMS Sun: el=%.1f° az=%.1f° sf=%.0f° st=%.0f° mx=%.1f clouds=%.0f%%",
                    _sun_el, _sun_az, sf or 0, st or 0, mx or 0, applied_clouds,
                )
                if _sun_el > 0 and sf is not None and st is not None and sf <= _sun_az <= st and st > sf:
                    EL_REF       = 30.0
                    el_factor    = min(1.0, _sun_el / EL_REF)
                    az_center    = (sf + st) / 2.0
                    az_half      = (st - sf) / 2.0
                    az_factor    = math.cos((_sun_az - az_center) / az_half * (math.pi / 2.0))
                    az_factor    = max(0.0, az_factor)
                    cloud_factor = max(0.0, 1.0 - applied_clouds / 100.0)
                    corr_sun     = float(mx) * el_factor * az_factor * cloud_factor
                    _LOGGER.debug(
                        "BMS Sun korekce: el_f=%.2f az_f=%.2f cloud_f=%.2f → corr=%.2f°C",
                        el_factor, az_factor, cloud_factor, corr_sun,
                    )
                else:
                    _LOGGER.debug(
                        "BMS Sun: mimo podmínky (el>0:%s, az v rozsahu:%s)",
                        _sun_el > 0,
                        sf is not None and st is not None and sf <= _sun_az <= st,
                    )

            total_corr = corr_wind + corr_rain + corr_hum + corr_clouds + corr_sun + night_offset

            # ── Boost / Útlum ──────────────────────────────────────────────
            boost_corr = 0.0
            boost_info = data.get("boost", {})
            now_ts = datetime.now(timezone.utc).timestamp()
            if boost_info.get("active") and boost_info.get("until", 0) > now_ts:
                boost_corr = float(boost_info.get("amount", 0))
            elif boost_info.get("active"):
                # Boost vypršel — zalogovat a vyslat event
                expired_amount = boost_info.get("amount", 0)
                expired_kind   = "boost_expired" if expired_amount > 0 else "reduction_expired"
                from homeassistant.helpers.event import async_call_later
                def _fire_boost_expired(_now):
                    self._hass.bus.async_fire(f"{DOMAIN}_boost_expired", {
                        "kind":   expired_kind,
                        "amount": expired_amount,
                    })
                async_call_later(self._hass, 0, _fire_boost_expired)
                # Zápis do logu
                calc_log = data.get("calc_log", [])
                calc_log.insert(0, {
                    "time":    datetime.now().strftime("%d.%m %H:%M"),
                    "event":   expired_kind,
                    "amount":  expired_amount,
                    "manual":  False,
                })
                data["calc_log"] = calc_log[:CALC_LOG_SIZE]
                data["boost"] = {"active": False}

            # ── Limity ────────────────────────────────────────────────────
            t_min = self._num("limit_min", 20.0)
            t_max = self._num("limit_max", 75.0)

            # ── Protimrazová ochrana ───────────────────────────────────────
            frost_active = False
            if self._sw("frost_protection"):
                frost_thr = self._num("frost_threshold", -5.0)
                frost_min = self._num("frost_min_heat",  35.0)
                if frost_thr is not None and raw_outdoor <= frost_thr:
                    t_min = max(t_min, frost_min)
                    frost_active = True

            raw_result   = curve_temp + total_corr + boost_corr
            clamped_temp = max(t_min, min(t_max, raw_result))
            now_ts_local = datetime.now().timestamp()

            # ── Výpočetní log — při každém přepočtu ──────────────────────────
            calc_log  = data.get("calc_log", [])
            log_entry = {
                "time":         datetime.now().strftime("%d.%m %H:%M"),
                "ts":           int(datetime.now().timestamp()),
                "out":          round(applied_temp,   1),
                "curve":        round(curve_temp,     1),
                # Naměřené hodnoty vlivů (před korekcí)
                "act_wind":     round(actual_wind,    1),
                "act_rain":     round(actual_rain,    2),
                "act_hum":      round(actual_hum,     1),
                "act_clouds":   round(actual_clouds,  1),
                # Pozice slunce
                "sun_el":       round(_sun_el, 1) if _sun_el is not None else None,
                "sun_az":       round(_sun_az, 1) if _sun_az is not None else None,
                # Korekce
                "corr_wind":    round(corr_wind,     2),
                "corr_rain":    round(corr_rain,     2),
                "corr_hum":     round(corr_hum,      2),
                "corr_clouds":  round(corr_clouds,   2),
                "corr_sun":     round(corr_sun,      2),
                "night_offset": round(night_offset,  2),
                "boost":        round(boost_corr,    2),
                "total_corr":   round(total_corr + boost_corr, 2),
                "raw":          round(raw_result,    1),
                "result":       round(clamped_temp,  1),
                "clamped":      abs(raw_result - clamped_temp) > 0.01,
                "frost":        frost_active,
                "night":        night_active,
                "manual":       force_log,
            }
            calc_log.insert(0, log_entry)
            data["calc_log"] = calc_log[:CALC_LOG_SIZE]

            # ── Sledování kolizí s limitem ────────────────────────────────────
            was_clamped = abs(raw_result - clamped_temp) > 0.01
            if was_clamped:
                clamp_log = data.get("clamp_log", [])
                clamp_log.insert(0, {"ts": now_ts_local, "raw": round(raw_result, 1), "clamped": round(clamped_temp, 1)})
                data["clamp_log"] = clamp_log[:50]  # max 50 záznamů

            # ── Sledování výpadku senzoru ─────────────────────────────────────
            if temp_source == TEMP_SOURCE_SAFE:
                if "sensor_safe_since" not in data:
                    data["sensor_safe_since"] = now_ts_local
            else:
                data.pop("sensor_safe_since", None)

            data.update({
                "applied_out_temp": round(applied_temp,   1),
                "raw_outdoor_temp": round(raw_outdoor,    1),
                "curve_temp":       round(curve_temp,     1),
                "total_correction": round(total_corr + boost_corr, 2),
                "clamped_temp":     round(clamped_temp,   1),
                # Aktuální (live) hodnoty — vždy k dispozici
                "actual_wind":      round(actual_wind,    1),
                "actual_rain":      round(actual_rain,    1),
                "actual_clouds":    round(actual_clouds,  1),
                "actual_humidity":  round(actual_hum,     1),
                # Předpovídané hodnoty — vždy načítaná (None pokud forecast nedostupný)
                "forecast_wind":    round(forecast_wind,   1) if forecast_wind   is not None else None,
                "forecast_rain":    round(forecast_rain,   1) if forecast_rain   is not None else None,
                "forecast_clouds":  round(forecast_clouds, 1) if forecast_clouds is not None else None,
                "forecast_humidity":round(forecast_hum,    1) if forecast_hum    is not None else None,
                "forecast_temp":    round(forecast_temp,   1) if forecast_temp   is not None else None,
                # applied_* interní proměnné se dál používají pro výpočet, ale neukládají se jako diag senzory
                "corr_wind":        round(corr_wind,      2),
                "corr_rain":        round(corr_rain,      2),
                "corr_humidity":    round(corr_hum,       2),
                "corr_clouds":      round(corr_clouds,    2),
                "corr_sun":         round(corr_sun,       2),
                "was_clamped":      was_clamped,
                "night_active":     night_active,
                "frost_active":     frost_active,
                "boost_active":     boost_corr != 0.0,
                "bypass_active":    False,  # bude přepsáno níže pokud bypass aktivní
            })

            self._state = round(clamped_temp, 1)
            self._notify_diag_sensors()

            # ── Vyhodnocení časových plánů ────────────────────────────────────
            await self._evaluate_schedules(raw_outdoor)

            if not write_thermostat or not regulation_active:
                return

            # ── Letní bypass ──────────────────────────────────────────────────
            if self._sw("letni_bypass"):
                bypass_temp = self._num("letni_bypass_temp", 18.0)
                if bypass_temp is not None and raw_outdoor >= bypass_temp:
                    data["bypass_active"] = True
                    self._notify_diag_sensors()
                    _LOGGER.debug("BMS: Letní bypass aktivní (venku %.1f°C ≥ %.1f°C) — termostat se nenastavuje.", raw_outdoor, bypass_temp)
                    return  # přeskočit zápis na termostat

            # ── Bezpečný bod křivky při výpadku senzorů ──────────────────────
            if temp_source == TEMP_SOURCE_SAFE:
                safe_out  = self._num("safe_curve_outdoor", 0.0)
                safe_heat = self._num("safe_curve_temp",   40.0)
                if safe_out is not None and safe_heat is not None:
                    temp_for_thermostat = round(safe_heat)
                    _LOGGER.info("BMS: Výpadek senzorů — používám bezpečný bod křivky %.1f°C.", safe_heat)
                    thermostat_eid = self._entry.data.get("target_thermostat")
                    if thermostat_eid:
                        try:
                            await self._hass.services.async_call(
                                "climate", "set_temperature",
                                {"entity_id": thermostat_eid, "temperature": temp_for_thermostat},
                                blocking=False,
                            )
                        except Exception as e:
                            _LOGGER.warning("BMS: Chyba termostatu (safe): %s", e)
                    return

            thermostat_eid = self._entry.data.get("target_thermostat")
            if thermostat_eid:
                try:
                    temp_for_thermostat = round(clamped_temp)
                    await self._hass.services.async_call(
                        "climate", "set_temperature",
                        {"entity_id": thermostat_eid, "temperature": temp_for_thermostat},
                        blocking=False,
                    )
                except Exception as e:
                    _LOGGER.warning("BMS: Chyba termostatu: %s", e)

        except Exception as e:
            _LOGGER.error("BMS: Chyba výpočtu: %s", e, exc_info=True)

    def _notify_diag_sensors(self):
        for s in self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {}).get("diag_sensors", []):
            s.async_write_ha_state()

    async def _evaluate_schedules(self, current_outdoor_temp: float):
        """Vyhodnotí časové plány a případně přepne profil."""
        from datetime import datetime
        data     = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        profiles = data.get("profiles", {})
        schedules = profiles.get("__schedules__", [])
        if not schedules:
            return

        now      = datetime.now()
        today_md = now.strftime("%m-%d")

        # Teplotní historie — průměr za temp_days dní
        temp_hist = data.setdefault("schedule_temp_hist", [])
        temp_hist.append({"ts": now.timestamp(), "temp": current_outdoor_temp})
        # Uchovat max 7 dní
        cutoff = now.timestamp() - 7 * 86400
        data["schedule_temp_hist"] = [t for t in temp_hist if t["ts"] > cutoff]

        def _temp_condition(rule: dict) -> bool:
            days = rule.get("temp_days", 3)
            op   = rule.get("temp_op",   "<")
            val  = float(rule.get("temp_val", 5))
            since_ts = now.timestamp() - days * 86400
            relevant = [t["temp"] for t in data["schedule_temp_hist"] if t["ts"] > since_ts]
            if not relevant:
                return False
            avg = sum(relevant) / len(relevant)
            return avg < val if op == "<" else avg > val

        def _date_condition(rule: dict) -> bool:
            from_md = rule.get("date_from", "")
            to_md   = rule.get("date_to",   "")
            if not from_md or not to_md:
                return False
            if from_md <= to_md:
                return from_md <= today_md <= to_md
            else:  # přes rok (např. 11-01 → 03-31)
                return today_md >= from_md or today_md <= to_md

        # Projít pravidla v pořadí, první splněné platí
        for rule in schedules:
            if not rule.get("enabled", True):
                continue
            rtype   = rule.get("type", "date")
            profile = rule.get("profile", "Výchozí")
            if profile not in profiles and profile != "Výchozí":
                continue
            match = _date_condition(rule) if rtype == "date" else _temp_condition(rule)
            if match:
                current_active = profiles.get("__active_profile__", "Výchozí")
                if current_active != profile:
                    _LOGGER.info("BMS Plán: přepínám na profil '%s' (pravidlo: %s).", profile, rtype)
                    await self._hass.services.async_call(
                        DOMAIN, "load_profile", {"name": profile}, blocking=False
                    )
                return  # první splněné pravidlo rozhoduje


class BMSDiagSensor(BMSSensorBase):
    @property
    def should_poll(self) -> bool:
        return False

    @property
    def native_value(self):
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        val = data.get(self.entity_id.replace("sensor.bms_", ""))
        return round(val, 2) if isinstance(val, float) else val


class BMSStorageStatusSensor(BMSSensorBase):
    def __init__(self, hass, entry):
        super().__init__(hass, entry, "Storage křivky", "curve_storage_status", None)
        self._attr_native_unit_of_measurement = None

    @property
    def should_poll(self) -> bool:
        return False

    @property
    def native_value(self) -> str:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        pts = data.get("curve", {}).get("points", [])
        if data.get("storage_ok") and len(pts) >= 2:
            return "OK"
        return "FALLBACK" if len(pts) >= 2 else "ERROR"

    @property
    def extra_state_attributes(self) -> dict:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        pts  = data.get("curve", {}).get("points", [])
        return {"point_count": len(pts), "storage_ok": data.get("storage_ok", False), "points": pts}


class BMSTempSourceSensor(BMSSensorBase):
    def __init__(self, hass, entry):
        super().__init__(hass, entry, "Zdroj venkovní teploty", "temp_source", None)
        self._attr_native_unit_of_measurement = None

    @property
    def should_poll(self) -> bool:
        return False

    @property
    def native_value(self) -> str:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        return {
            TEMP_SOURCE_SENSOR:  "Senzor",
            TEMP_SOURCE_WEATHER: "Weather entita",
            TEMP_SOURCE_SAFE:    "Bezpečná teplota",
        }.get(data.get("temp_source", TEMP_SOURCE_SAFE), "—")

    @property
    def extra_state_attributes(self) -> dict:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        source = data.get("temp_source", TEMP_SOURCE_SAFE)
        safe_s = self._hass.states.get("number.bms_safe_temp")
        return {
            "source_key":  source,
            "is_fallback": source != TEMP_SOURCE_SENSOR,
            "safe_temp":   float(safe_s.state) if safe_s else DEFAULT_SAFE_OUTDOOR_TEMP,
        }

    @property
    def icon(self) -> str:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        return {
            TEMP_SOURCE_SENSOR:  "mdi:thermometer",
            TEMP_SOURCE_WEATHER: "mdi:weather-partly-cloudy",
            TEMP_SOURCE_SAFE:    "mdi:shield-alert",
        }.get(data.get("temp_source", TEMP_SOURCE_SAFE), "mdi:thermometer-alert")


class BMSBoostSensor(BMSSensorBase):
    """Diagnostický senzor — stav boost/útlum módu."""

    def __init__(self, hass, entry):
        super().__init__(hass, entry, "Boost / Útlum stav", "boost_status", None)
        self._attr_native_unit_of_measurement = None

    @property
    def should_poll(self) -> bool:
        return False

    @property
    def native_value(self) -> str:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        boost = data.get("boost", {})
        if not boost.get("active"):
            return "inactive"
        amount = boost.get("amount", 0)
        return "boost" if amount > 0 else "reduction"

    @property
    def extra_state_attributes(self) -> dict:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        boost = data.get("boost", {})
        now_ts = datetime.now(timezone.utc).timestamp()
        until_ts = boost.get("until", 0)
        remaining_min = max(0, int((until_ts - now_ts) / 60)) if boost.get("active") else 0
        return {
            "active":        boost.get("active", False),
            "amount":        boost.get("amount", 0),
            "until_ts":      until_ts,
            "remaining_min": remaining_min,
        }

class BMSWeatherSensor(BMSSensorBase):
    """Aktivní senzor — sleduje weather entitu a ihned fetchuje forecast.

    Při každé změně weather entity (typicky každou hodinu) automaticky:
    - Načte aktuální data (vítr, srážky, oblačnost, vlhkost)
    - Fetchne forecast na nastavený počet hodin dopředu
    - Uloží vše do hass.data i do vlastních atributů
    - Notifikuje ostatní diag senzory aby se překreslily

    Tím pádem jsou forecast hodnoty dostupné ihned po startu HA,
    bez čekání na 30min scan interval BMSResultSensor.
    """

    def __init__(self, hass, entry):
        super().__init__(hass, entry, "Počasí stav", "weather_status", None)
        self._attr_native_unit_of_measurement = None
        self._attr_should_poll = False
        self._last_fetch_ts = 0.0

    @property
    def should_poll(self) -> bool:
        return False

    @property
    def native_value(self) -> str:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        fc_wind = data.get("forecast_wind")
        return "forecast_ok" if fc_wind is not None else "no_forecast"

    @property
    def extra_state_attributes(self) -> dict:
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        return {
            "actual_wind":       data.get("actual_wind"),
            "actual_rain":       data.get("actual_rain"),
            "actual_clouds":     data.get("actual_clouds"),
            "actual_humidity":   data.get("actual_humidity"),
            "forecast_wind":     data.get("forecast_wind"),
            "forecast_rain":     data.get("forecast_rain"),
            "forecast_clouds":   data.get("forecast_clouds"),
            "forecast_humidity": data.get("forecast_humidity"),
            "forecast_temp":     data.get("forecast_temp"),
            "hourly_chart_data": data.get("hourly_chart_data", []),
        }

    async def async_added_to_hass(self) -> None:
        """Po přidání do HA — zaregistrovat sledování weather entity a hned fetchnout."""
        await super().async_added_to_hass()
        weather_eid = self._entry.data.get(CONF_WEATHER)
        if not weather_eid:
            return

        # Okamžitý fetch při startu (s malým zpožděním aby byla weather entita ready)
        async def _startup_fetch():
            import asyncio
            await asyncio.sleep(3)
            await self._fetch_and_store()

        self.hass.async_create_task(_startup_fetch())

        # Sledování změn weather entity — s 60s debounce (weather se mění každou minutu u některých integrací)
        from homeassistant.helpers.event import async_track_state_change_event

        _debounce_task = None

        @callback
        def _on_weather_state_changed(event):
            nonlocal _debounce_task  # jediná deklarace, na začátku funkce
            new_state = event.data.get("new_state")
            if new_state is None or new_state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                return
            # Zrušit předchozí čekající task
            if _debounce_task is not None and not _debounce_task.done():
                _debounce_task.cancel()

            async def _delayed_fetch():
                import asyncio
                await asyncio.sleep(60)
                await self._fetch_and_store()

            _debounce_task = self.hass.async_create_task(_delayed_fetch())

        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [weather_eid], _on_weather_state_changed
            )
        )

    async def _fetch_and_store(self) -> None:
        """Fetchne aktuální data a forecast, uloží do hass.data, notifikuje senzory."""
        weather_eid = self._entry.data.get(CONF_WEATHER)
        if not weather_eid:
            return

        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        weather_state = self._hass.states.get(weather_eid)

        # ── Aktuální data ────────────────────────────────────────────────────
        actual_wind = actual_rain = actual_clouds = actual_hum = 0.0
        if weather_state and weather_state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            a = weather_state.attributes
            actual_wind   = float(a.get("wind_speed",     0.0))
            actual_rain   = float(a.get("precipitation",  0.0))
            actual_clouds = float(a.get("cloud_coverage", 0.0))
            actual_hum    = float(a.get("humidity",       0.0))

        # ── Forecast ────────────────────────────────────────────────────────
        forecast_wind = forecast_rain = forecast_clouds = forecast_hum = None
        forecast_temp = None
        hourly_chart_data = []   # pole všech hodinových bodů pro graf vlivů
        offset_h = int(self._num("predpoved_hodin", 24))
        try:
            resp = await self._hass.services.async_call(
                "weather", "get_forecasts",
                {"entity_id": weather_eid, "type": "hourly"},
                blocking=True, return_response=True,
            )
            if resp and weather_eid in resp:
                forecasts = resp[weather_eid].get("forecast", [])
                if forecasts:
                    target_ts = (datetime.now(timezone.utc) + timedelta(hours=offset_h)).timestamp()
                    fc = min(forecasts, key=lambda f: abs(
                        datetime.fromisoformat(f["datetime"].replace("Z", "+00:00")).timestamp() - target_ts
                    ))
                    forecast_temp   = float(fc.get("temperature",    0.0))
                    forecast_wind   = float(fc.get("wind_speed",     actual_wind))
                    forecast_rain   = float(fc.get("precipitation",  actual_rain))
                    forecast_clouds = float(fc.get("cloud_coverage", actual_clouds))
                    forecast_hum    = float(fc.get("humidity",       actual_hum))
                    _LOGGER.debug(
                        "BMS Weather: forecast načten (+%dh): %.1f°C, vítr %.1f, deště %.1f",
                        offset_h, forecast_temp, forecast_wind, forecast_rain,
                    )
                    # Uložit všechny hodinové body pro graf vlivů (max 48h dopředu)
                    now_utc = datetime.now(timezone.utc)
                    for f in forecasts:
                        try:
                            f_dt  = datetime.fromisoformat(f["datetime"].replace("Z", "+00:00"))
                            f_ts  = int(f_dt.timestamp())
                            f_dh  = (f_dt - now_utc).total_seconds() / 3600
                            if -0.5 <= f_dh <= 48:
                                hourly_chart_data.append({
                                    "ts":         f_ts,
                                    "out":        round(float(f.get("temperature",    0)), 1),
                                    "act_wind":   round(float(f.get("wind_speed",     0)), 1),
                                    "act_rain":   round(float(f.get("precipitation",  0)), 2),
                                    "act_hum":    round(float(f.get("humidity",       0)), 1),
                                    "act_clouds": round(float(f.get("cloud_coverage", 0)), 1),
                                    "_fc":        True,
                                })
                        except Exception:
                            pass
        except Exception as e:
            _LOGGER.warning("BMS Weather: chyba forecast fetche: %s", e)

        # ── Uložit do hass.data ──────────────────────────────────────────────
        data.update({
            "actual_wind":        round(actual_wind,    1),
            "actual_rain":        round(actual_rain,    1),
            "actual_clouds":      round(actual_clouds,  1),
            "actual_humidity":    round(actual_hum,     1),
            "forecast_wind":      round(forecast_wind,   1) if forecast_wind   is not None else None,
            "forecast_rain":      round(forecast_rain,   1) if forecast_rain   is not None else None,
            "forecast_clouds":    round(forecast_clouds, 1) if forecast_clouds is not None else None,
            "forecast_humidity":  round(forecast_hum,    1) if forecast_hum    is not None else None,
            "forecast_temp":      round(forecast_temp,   1) if forecast_temp   is not None else None,
            "hourly_chart_data":  hourly_chart_data,
        })

        # ── Notifikovat všechny diag senzory ─────────────────────────────────
        self.async_write_ha_state()
        for s in self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {}).get("diag_sensors", []):
            s.async_write_ha_state()

        # ── Spustit přepočet výsledné teploty (bez zápisu na termostat) ──────
        # Tím se ihned aktualizují corr_sun, korekce vlivů a všechny diag senzory.
        result_sensor = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {}).get("result_sensor")
        if result_sensor and hasattr(result_sensor, "async_refresh_data"):
            try:
                await result_sensor.async_refresh_data()
                result_sensor.async_write_ha_state()
            except Exception as e:
                _LOGGER.debug("BMS Weather: přepočet po fetch selhal: %s", e)


# ════════════════════════════════════════════════════════════════════════════
# BMSInfluencesLogSensor — ukládá kompletní -24h/+24h data pro graf vlivů
# Každou hodinu přidá snapshot + naplní forecast z weather entity
# ════════════════════════════════════════════════════════════════════════════
class BMSInfluencesLogSensor(BMSSensorBase):
    """Dedikovaný senzor pro graf vnějších vlivů — historie + předpověď."""

    MAX_HIST = 30
    SNAPSHOT_INTERVAL = 1800

    def __init__(self, hass, entry):
        super().__init__(hass, entry, "BMS Influences Log", "influences_log", None)
        self._attr_native_unit_of_measurement = None
        self._history:  list[dict] = []   # historické snapshoty [-24h → nyní]
        self._forecast: list[dict] = []   # předpovídané hodnoty [nyní → +24h]
        self._last_snapshot: float = 0.0
        self._initialized = False

    @property
    def state(self) -> str:
        return f"{len(self._history)}h+{len(self._forecast)}fc"

    @property
    def extra_state_attributes(self) -> dict:
        return {
            "history":  self._history,
            "forecast": self._forecast,
            "ts_generated": int(datetime.now().timestamp()),
        }

    async def async_added_to_hass(self) -> None:
        """Inicializace — načíst historii z HA recorder a předpověď z weather."""
        await super().async_added_to_hass()
        # Počkat až budou ostatní entity připraveny
        async def _init():
            import asyncio
            await asyncio.sleep(8)
            await self._load_history_from_recorder()
            await self._refresh_forecast()
            self.async_write_ha_state()
        self._hass.async_create_task(_init())

        # Registrovat listener na změny weather entity pro auto-refresh forecastu
        weather_eid = self._entry.data.get(CONF_WEATHER)
        if weather_eid:
            from homeassistant.core import callback

            @callback
            def _weather_event_filter(event_data: dict) -> bool:
                return event_data.get("entity_id") == weather_eid

            @callback
            def _on_weather_changed(_event):
                self._hass.async_create_task(self._refresh_forecast())

            self._hass.bus.async_listen(
                "state_changed",
                _on_weather_changed,
                event_filter=_weather_event_filter,
            )

    async def _load_history_from_recorder(self) -> None:
        """Načte historická data ze HA recorder pro weather senzory (-24h)."""
        from datetime import timezone as _tz
        now_utc = datetime.now(_tz.utc)
        start   = now_utc - timedelta(hours=25)

        weather_eid = self._entry.data.get(CONF_WEATHER)
        outdoor_eid = self._entry.data.get(CONF_OUTDOOR_SENSOR)
        if not weather_eid:
            return

        try:
            from homeassistant.components.recorder import get_instance
            from homeassistant.components.recorder.history import get_significant_states

            instance = get_instance(self._hass)
            entity_ids = [eid for eid in [weather_eid, outdoor_eid] if eid]
            states_dict = await instance.async_add_executor_job(
                get_significant_states,
                self._hass, start, now_utc, entity_ids,
            )

            # Sestavit hodinové snapshoty z historických stavů
            weather_states = states_dict.get(weather_eid, [])
            outdoor_states = states_dict.get(outdoor_eid, []) if outdoor_eid else []

            # Seskupit po hodinách
            hist_by_hour: dict[int, dict] = {}
            for s in weather_states:
                if not s or s.state in ("unavailable", "unknown"):
                    continue
                ts_h = int(s.last_updated.timestamp() // 3600) * 3600
                attrs = s.attributes or {}
                if ts_h not in hist_by_hour:
                    hist_by_hour[ts_h] = {
                        "ts":         ts_h,
                        "act_wind":   round(float(attrs.get("wind_speed",     0) or 0), 1),
                        "act_rain":   round(float(attrs.get("precipitation",  0) or 0), 2),
                        "act_hum":    round(float(attrs.get("humidity",       0) or 0), 1),
                        "act_clouds": round(float(attrs.get("cloud_coverage",
                                          attrs.get("cloudiness", 0)) or 0), 1),
                    }

            # Přidat venkovní teplotu z outdoor senzoru
            for s in outdoor_states:
                if not s or s.state in ("unavailable", "unknown"):
                    continue
                ts_h = int(s.last_updated.timestamp() // 3600) * 3600
                try:
                    temp = float(s.state)
                    if ts_h in hist_by_hour:
                        hist_by_hour[ts_h]["out"] = round(temp, 1)
                    else:
                        hist_by_hour[ts_h] = {"ts": ts_h, "out": round(temp, 1)}
                except (ValueError, TypeError):
                    pass

            self._history = sorted(hist_by_hour.values(), key=lambda x: x["ts"])
            _LOGGER.debug("BMS InfluencesLog: načteno %d hist. snapshotů z recorder.", len(self._history))

        except Exception as e:
            _LOGGER.warning("BMS InfluencesLog: chyba při načítání historie z recorder: %s", e)
            # Fallback — alespoň aktuální snapshot
            await self._add_current_snapshot()

    async def _add_current_snapshot(self) -> None:
        """Přidá snapshot aktuálních hodnot do historie."""
        data = self._hass.data.get(DOMAIN, {}).get(self._entry.entry_id, {})
        now_ts = int(datetime.now().timestamp())
        snap = {
            "ts":         now_ts,
            "out":        data.get("raw_outdoor_temp") or data.get("actual_temp"),
            "act_wind":   data.get("actual_wind"),
            "act_rain":   data.get("actual_rain"),
            "act_hum":    data.get("actual_humidity"),
            "act_clouds": data.get("actual_clouds"),
            "result":     data.get("last_compute_temp"),
        }
        # Odstraňte záznamy starší než 25h
        cutoff = now_ts - 25 * 3600
        self._history = [h for h in self._history if h.get("ts", 0) > cutoff]
        self._history.append(snap)
        self._history.sort(key=lambda x: x.get("ts", 0))
        self._last_snapshot = datetime.now().timestamp()

    async def _refresh_forecast(self) -> None:
        """Načte hodinovou předpověď z weather entity (+24h)."""
        from datetime import timezone as _tz
        weather_eid = self._entry.data.get(CONF_WEATHER)
        if not weather_eid:
            return
        try:
            resp = await self._hass.services.async_call(
                "weather", "get_forecasts",
                {"entity_id": weather_eid, "type": "hourly"},
                blocking=True, return_response=True,
            )
            forecasts = []
            if resp and weather_eid in resp:
                forecasts = resp[weather_eid].get("forecast", [])

            # Fallback: twice_daily
            if not forecasts:
                resp2 = await self._hass.services.async_call(
                    "weather", "get_forecasts",
                    {"entity_id": weather_eid, "type": "twice_daily"},
                    blocking=True, return_response=True,
                )
                if resp2 and weather_eid in resp2:
                    forecasts = resp2[weather_eid].get("forecast", [])

            now_utc = datetime.now(_tz.utc)
            result  = []
            for f in forecasts:
                try:
                    f_dt = datetime.fromisoformat(f["datetime"].replace("Z", "+00:00"))
                    f_ts = int(f_dt.timestamp())
                    f_dh = (f_dt - now_utc).total_seconds() / 3600
                    if -1 <= f_dh <= 26:   # trochu přes 24h pro plynulost
                        result.append({
                            "ts":         f_ts,
                            "out":        round(float(f.get("temperature",    0) or 0), 1),
                            "act_wind":   round(float(f.get("wind_speed",     0) or 0), 1),
                            "act_rain":   round(float(f.get("precipitation",  0) or 0), 2),
                            "act_hum":    round(float(f.get("humidity",       0) or 0), 1),
                            # cloud_coverage NEBO cloudiness (záleží na weather integraci)
                            "act_clouds": round(float(
                                f.get("cloud_coverage", f.get("cloudiness", 0)) or 0), 1),
                            "_fc":        True,
                        })
                except Exception:
                    pass
            self._forecast = result
            _LOGGER.debug("BMS InfluencesLog: načteno %d fc bodů.", len(result))
        except Exception as e:
            _LOGGER.warning("BMS InfluencesLog: chyba forecast: %s", e)

    async def async_update(self) -> None:
        """Periodická aktualizace — přidat snapshot každých ~30 min."""
        now_ts = datetime.now().timestamp()
        if now_ts - self._last_snapshot >= self.SNAPSHOT_INTERVAL:
            await self._add_current_snapshot()
            await self._refresh_forecast()
            self.async_write_ha_state()