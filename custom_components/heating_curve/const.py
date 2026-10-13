"""Konstanty integrace BMS regulátoru."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "heating_curve"
PLATFORMS = [Platform.SENSOR, Platform.BINARY_SENSOR, Platform.NUMBER, Platform.SWITCH, Platform.SELECT]

CONF_THERMOSTAT     = "target_thermostat"
CONF_OUTDOOR_SENSOR = "outdoor_sensor"
CONF_WEATHER        = "weather_entity"
CONF_SUN            = "sun_entity"  # jen kvůli migraci starých záznamů
CONF_WIND_SENSOR     = "wind_sensor"
CONF_RAIN_SENSOR     = "rain_sensor"
CONF_HUMIDITY_SENSOR = "humidity_sensor"
CONF_CLOUDS_SENSOR   = "clouds_sensor"
# Měřená veličina vlivu → volitelný senzor, který má přednost před hodnotou z entity počasí
INFLUENCE_SENSORS = {
    "wind": CONF_WIND_SENSOR,
    "rain": CONF_RAIN_SENSOR,
    "humidity": CONF_HUMIDITY_SENSOR,
    "clouds": CONF_CLOUDS_SENSOR,
}
# Odkud se vzala aktuální hodnota vlivu
SOURCE_SENSOR   = "sensor"
SOURCE_WEATHER  = "weather"
SOURCE_FORECAST = "forecast"
SOURCE_NONE     = "none"

FRONTEND_URL_BASE = f"/{DOMAIN}"
CARD_FILENAME     = "bms-master-card.js"

DEVICE_NAME     = "BMS"
DEFAULT_PROFILE = "Default"

# ── Úložiště ──────────────────────────────────────────────────────────────────
STORE_KEY     = f"{DOMAIN}.data"
STORE_VERSION = 1
STORE_MINOR_VERSION = 2
LEGACY_PROFILES_KEY = f"{DOMAIN}_profiles"
LEGACY_CURVE_KEY    = f"{DOMAIN}_curve"

DEFAULT_CURVE_POINTS = [
    {"x": -20, "y": 70}, {"x": -10, "y": 57}, {"x": 0, "y": 45},
    {"x": 10,  "y": 33}, {"x": 20,  "y": 20},
]

DEFAULT_SEASONAL_PROFILES: dict[str, list[dict[str, float]]] = {
    "Winter": [
        {"x": -20, "y": 75}, {"x": -10, "y": 65}, {"x": 0, "y": 55},
        {"x": 10,  "y": 42}, {"x": 20,  "y": 30},
    ],
    "Spring/Autumn": [
        {"x": -20, "y": 65}, {"x": -10, "y": 55}, {"x": 0, "y": 43},
        {"x": 10,  "y": 32}, {"x": 20,  "y": 20},
    ],
    "Summer": [
        {"x": -20, "y": 55}, {"x": -10, "y": 44}, {"x": 0, "y": 34},
        {"x": 10,  "y": 25}, {"x": 20,  "y": 18},
    ],
}
DEFAULT_STARRED = list(DEFAULT_SEASONAL_PROFILES)
# Názvy výchozích profilů do verze 0.5
LEGACY_PROFILE_NAMES = {"Výchozí": DEFAULT_PROFILE, "Zima": "Winter", "Jaro/Podzim": "Spring/Autumn", "Léto": "Summer"}

# ── Zdroj venkovní teploty ────────────────────────────────────────────────────
TEMP_SOURCE_SENSOR  = "sensor"
TEMP_SOURCE_WEATHER = "weather"
TEMP_SOURCE_SAFE    = "safe_fallback"

# ── Vliv slunce ────────────────────────────────────────────────────────────────────
SUN_MODE_WINDOW   = "window"    # pevné rozpětí azimutu (původní chování)
SUN_MODE_FACADE   = "facade"    # směr oken — účinek podle úhlu dopadu
SUN_MODE_DAYLIGHT = "daylight"  # celý den, vztaženo k dnešnímu poledni
SUN_MODES = [SUN_MODE_WINDOW, SUN_MODE_FACADE, SUN_MODE_DAYLIGHT]

# ── Vlivy počasí: klíč nastavení → (klíč měřené veličiny, výchozí od/do/max) ───
INFLUENCES: dict[str, dict] = {
    "wind":     {"value": "wind",     "from": 10, "to": 60, "max": 5.0, "unit": "km/h"},
    "rain":     {"value": "rain",     "from":  1, "to": 15, "max": 2.0, "unit": "mm/h"},
    "humidity": {"value": "humidity", "from": 50, "to": 90, "max": 2.0, "unit": "%"},
    "clouds":   {"value": "clouds",   "from": 20, "to": 80, "max": 2.0, "unit": "%"},
}

# ── Režimy přepočtu ───────────────────────────────────────────────────────────
MODE_TIME = "time"
MODE_TEMP = "temperature"
MODE_BOTH = "both"
RECALC_MODES = [MODE_TIME, MODE_TEMP, MODE_BOTH]

# ── Limity logů a historie ────────────────────────────────────────────────────
CALC_LOG_SIZE      = 20
CLAMP_LOG_SIZE     = 50
HISTORY_HOURS      = 25        # historie vlivů pro graf
TEMP_HISTORY_DAYS  = 31        # historie venkovní teploty pro plány
SNAPSHOT_INTERVAL  = 1800      # s — minimální rozestup vzorků historie
FORECAST_MAX_AGE   = 1800      # s — stáří předpovědi, po kterém se stahuje znovu
WEATHER_DEBOUNCE   = 60        # s — zpoždění po změně weather entity
SETTINGS_DEBOUNCE  = 1.0       # s — přepočet po změně nastavení

# ── Události ──────────────────────────────────────────────────────────────────
EVENT_CURVE_CHANGED      = f"{DOMAIN}_curve_changed"
EVENT_CURVE_RESPONSE     = f"{DOMAIN}_curve_response"
EVENT_PROFILES_CHANGED   = f"{DOMAIN}_profiles_changed"
EVENT_BOOST_EXPIRED      = f"{DOMAIN}_boost_expired"
EVENT_FORCE_REFRESH_DONE = f"{DOMAIN}_force_refresh_done"
