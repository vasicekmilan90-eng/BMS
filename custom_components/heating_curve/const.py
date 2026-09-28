"""Konstanty integrace BMS regulátoru."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "heating_curve"
PLATFORMS = [Platform.SENSOR, Platform.BINARY_SENSOR, Platform.NUMBER, Platform.SWITCH, Platform.SELECT]

CONF_THERMOSTAT     = "target_thermostat"
CONF_OUTDOOR_SENSOR = "outdoor_sensor"
CONF_WEATHER        = "weather_entity"
CONF_SUN            = "sun_entity"  # jen kvůli migraci starých záznamů

FRONTEND_URL_BASE = f"/{DOMAIN}"
CARD_FILENAME     = "bms-master-card.js"

DEVICE_NAME     = "BMS Regulátor"
DEFAULT_PROFILE = "Výchozí"

# ── Úložiště ──────────────────────────────────────────────────────────────────
STORE_KEY     = f"{DOMAIN}.data"
STORE_VERSION = 1
LEGACY_PROFILES_KEY = f"{DOMAIN}_profiles"
LEGACY_CURVE_KEY    = f"{DOMAIN}_curve"

DEFAULT_CURVE_POINTS = [
    {"x": -20, "y": 70}, {"x": -10, "y": 57}, {"x": 0, "y": 45},
    {"x": 10,  "y": 33}, {"x": 20,  "y": 20},
]

DEFAULT_SEASONAL_PROFILES: dict[str, list[dict[str, float]]] = {
    "Zima": [
        {"x": -20, "y": 75}, {"x": -10, "y": 65}, {"x": 0, "y": 55},
        {"x": 10,  "y": 42}, {"x": 20,  "y": 30},
    ],
    "Jaro/Podzim": [
        {"x": -20, "y": 65}, {"x": -10, "y": 55}, {"x": 0, "y": 43},
        {"x": 10,  "y": 32}, {"x": 20,  "y": 20},
    ],
    "Léto": [
        {"x": -20, "y": 55}, {"x": -10, "y": 44}, {"x": 0, "y": 34},
        {"x": 10,  "y": 25}, {"x": 20,  "y": 18},
    ],
}
DEFAULT_STARRED = list(DEFAULT_SEASONAL_PROFILES)

# ── Zdroj venkovní teploty ────────────────────────────────────────────────────
TEMP_SOURCE_SENSOR  = "sensor"
TEMP_SOURCE_WEATHER = "weather"
TEMP_SOURCE_SAFE    = "safe_fallback"

# ── Vlivy počasí: klíč nastavení → (klíč měřené veličiny, výchozí od/do/max) ───
INFLUENCES: dict[str, dict] = {
    "vitr":      {"value": "wind",     "from": 10, "to": 60, "max": 5.0, "unit": "km/h"},
    "srazky":    {"value": "rain",     "from":  1, "to": 15, "max": 2.0, "unit": "mm/h"},
    "vlhkost":   {"value": "humidity", "from": 50, "to": 90, "max": 2.0, "unit": "%"},
    "oblacnost": {"value": "clouds",   "from": 20, "to": 80, "max": 2.0, "unit": "%"},
}

# ── Režimy přepočtu ───────────────────────────────────────────────────────────
MODE_TIME = "cas"
MODE_TEMP = "teplota"
MODE_BOTH = "oboji"
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
