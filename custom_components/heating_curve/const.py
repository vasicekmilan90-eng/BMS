from homeassistant.const import Platform

DOMAIN = "heating_curve"
PLATFORMS = [Platform.SENSOR, Platform.NUMBER, Platform.SWITCH, Platform.SELECT]

# ── Frontend (karta dodávaná integrací) ──────────────────────────────────────
FRONTEND_URL_BASE = f"/{DOMAIN}"
CARD_FILENAME     = "bms-master-card.js"

DEVICE_NAME       = "BMS Regulátor"
DEFAULT_PROFILE   = "Výchozí"

CONF_THERMOSTAT    = "target_thermostat"
CONF_OUTDOOR_SENSOR = "outdoor_sensor"
CONF_WEATHER       = "weather_entity"
CONF_SUN           = "sun_entity"

STORAGE_KEY      = f"{DOMAIN}_profiles"
STORAGE_VERSION  = 1
CURVE_STORAGE_KEY     = f"{DOMAIN}_curve"
CURVE_STORAGE_VERSION = 1

FALLBACK_CURVE_POINTS = 10

DEFAULT_CURVE_POINTS = [
    {"x": -20, "y": 70}, {"x": -10, "y": 57}, {"x": 0, "y": 45},
    {"x": 10,  "y": 33}, {"x": 20,  "y": 20},
]

DEFAULT_TEMP_MIN      = 25.0
DEFAULT_TEMP_MAX      = 42.0
DEFAULT_OUT_RANGE_MIN = -20
DEFAULT_OUT_RANGE_MAX =  20
DEFAULT_SAFE_OUTDOOR_TEMP = 0.0

TEMP_SOURCE_SENSOR  = "sensor"
TEMP_SOURCE_WEATHER = "weather"
TEMP_SOURCE_SAFE    = "safe_fallback"

INFLUENCE_DEFAULTS = {
    "vitr":      {"from": 10, "to": 60, "max": 5.0},
    "srazky":    {"from":  1, "to": 15, "max": 2.0},
    "vlhkost":   {"from": 50, "to": 90, "max": 2.0},
    "oblacnost": {"from": 20, "to": 80, "max": 2.0},
}

# ── Protimrazová ochrana ──────────────────────────────────────────────────────
DEFAULT_FROST_THRESHOLD = -5.0   # °C — pod touto venkovní teplotou aktivní
DEFAULT_FROST_MIN_HEAT  = 35.0   # °C — minimální teplota topení při protimrazu

# ── Noční mód ─────────────────────────────────────────────────────────────────
DEFAULT_NIGHT_OFFSET    = -5.0   # °C — o kolik snížit křivku v noci
DEFAULT_DAY_START       = 6      # hodina začátku dne
DEFAULT_DAY_END         = 22     # hodina konce dne

# ── Boost / Útlum ─────────────────────────────────────────────────────────────
DEFAULT_BOOST_AMOUNT    = 5.0    # °C — výchozí boost
DEFAULT_BOOST_HOURS     = 2      # hodiny — výchozí doba
DEFAULT_REDUCTION_AMOUNT = 5.0  # °C — výchozí útlum
# ── Hystereze / interval přepočtu ─────────────────────────────────────────────
DEFAULT_PREPOCET_INTERVAL   = 30    # minut
DEFAULT_PREPOCET_DELTA      = 0.5   # °C — změna venkovní teploty pro přepočet

# ── Letní bypass ──────────────────────────────────────────────────────────────
DEFAULT_LETNI_BYPASS_TEMP   = 18.0  # °C — venkovní teplota pro bypass

# ── Bezpečný bod křivky ───────────────────────────────────────────────────────
DEFAULT_SAFE_CURVE_OUTDOOR  = 0.0   # °C — venkovní teplota bezpečného bodu
DEFAULT_SAFE_CURVE_TEMP     = 40.0  # °C — výstupní teplota bezpečného bodu

CALC_LOG_SIZE = 20   # počet uchovaných záznamů ve výpočetním logu

# ── Whitelist entit pro profil křivky ─────────────────────────────────────────
# Tyto entity se ukládají a obnovují při přepínání profilů.
# Reprezentují sezónní/situační nastavení křivky a vlivů.
PROFILE_ENTITIES = {
    # Předpověď
    "number.bms_predpoved_hodin",
    # Vnější vlivy — rozsahy a efekty
    "number.bms_vitr_od",      "number.bms_vitr_do",      "number.bms_vitr_max_eff",
    "number.bms_srazky_od",    "number.bms_srazky_do",    "number.bms_srazky_max_eff",
    "number.bms_vlhkost_od",   "number.bms_vlhkost_do",   "number.bms_vlhkost_max_eff",
    "number.bms_oblacnost_od", "number.bms_oblacnost_do", "number.bms_oblacnost_max_eff",
    # Vliv slunce
    "number.bms_solarni_start", "number.bms_solarni_konec", "number.bms_slunce_max_eff",
    # Zapnutí/vypnutí vlivů
    "switch.bms_vliv_vitr", "switch.bms_vliv_srazky",
    "switch.bms_vliv_vlhkost", "switch.bms_vliv_oblacnost", "switch.bms_vliv_slunce",
    # Použití předpovědi — globální (slunce + teplota) a per-vliv
    "switch.bms_pouziti_predpovedi",
    # Per-vliv předpověď — přepínač + počet hodin
    "switch.bms_vitr_predpoved",    "number.bms_vitr_predpoved_hodin",
    "switch.bms_srazky_predpoved",  "number.bms_srazky_predpoved_hodin",
    "switch.bms_vlhkost_predpoved", "number.bms_vlhkost_predpoved_hodin",
    "switch.bms_oblacnost_predpoved","number.bms_oblacnost_predpoved_hodin",
    "number.bms_slunce_predpoved_hodin",
    "switch.bms_srazky_predpoved",
    "switch.bms_vlhkost_predpoved", "switch.bms_oblacnost_predpoved",
    # Noční mód
    "number.bms_night_offset", "number.bms_day_start", "number.bms_day_end",
    "switch.bms_night_mode",
    # Protimrazová ochrana
    "number.bms_frost_threshold", "number.bms_frost_min_heat",
    "switch.bms_frost_protection",
    # Boost / Útlum výchozí hodnoty
    "number.bms_boost_amount", "number.bms_boost_hours",
    "number.bms_reduction_amount", "number.bms_reduction_hours",
    # Bezpečný bod křivky
    "number.bms_safe_curve_outdoor", "number.bms_safe_curve_temp",
}

# Nastavení integrace — NEJSOU součástí profilu, nemění se přepínáním profilů
INTEGRATION_ENTITIES = {
    # Technická omezení soustavy
    "number.bms_limit_min", "number.bms_limit_max",
    "number.bms_rozsah_venku_min", "number.bms_rozsah_venku_max",
    "number.bms_safe_temp",
    # Chování regulátoru
    "number.bms_prepocet_interval", "number.bms_prepocet_delta",
    "number.bms_letni_bypass_temp",
    "switch.bms_letni_bypass",
    "switch.bms_hlavni_vypinac",
}