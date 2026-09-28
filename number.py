from homeassistant.components.number import RestoreNumber
from .const import (
    DOMAIN,
    DEFAULT_TEMP_MIN, DEFAULT_TEMP_MAX,
    DEFAULT_OUT_RANGE_MIN, DEFAULT_OUT_RANGE_MAX,
    INFLUENCE_DEFAULTS, DEFAULT_SAFE_OUTDOOR_TEMP,
    DEFAULT_FROST_THRESHOLD, DEFAULT_FROST_MIN_HEAT,
    DEFAULT_NIGHT_OFFSET, DEFAULT_DAY_START, DEFAULT_DAY_END,
    DEFAULT_BOOST_AMOUNT, DEFAULT_BOOST_HOURS, DEFAULT_REDUCTION_AMOUNT,
    DEFAULT_PREPOCET_INTERVAL, DEFAULT_PREPOCET_DELTA,
    DEFAULT_LETNI_BYPASS_TEMP,
    DEFAULT_SAFE_CURVE_OUTDOOR, DEFAULT_SAFE_CURVE_TEMP,
)


async def async_setup_entry(hass, entry, async_add_entities):
    entities = []

    # --- Bezpečná venkovní teplota ---
    entities.append(BMSNumber(entry, "Bezpečná venkovní teplota", "safe_temp", -30, 30, 0.5, DEFAULT_SAFE_OUTDOOR_TEMP))

    # --- Rozsah venkovních teplot křivky ---
    entities.append(BMSNumber(entry, "Rozsah venku: Min", "rozsah_venku_min", -30, 29, 1, DEFAULT_OUT_RANGE_MIN))
    entities.append(BMSNumber(entry, "Rozsah venku: Max", "rozsah_venku_max", -29, 30, 1, DEFAULT_OUT_RANGE_MAX))

    # --- Bezpečnostní limity termostatu ---
    entities.append(BMSNumber(entry, "Limit termostatu: Min", "limit_min", 10, 89, 0.5, DEFAULT_TEMP_MIN))
    entities.append(BMSNumber(entry, "Limit termostatu: Max", "limit_max", 11, 90, 0.5, DEFAULT_TEMP_MAX))

    # --- Předpověď ---
    entities.append(BMSNumber(entry, "Předpověď: Výhled hodin", "predpoved_hodin", 1, 72, 1, 24))
    # Per-vliv předpověď hodin (kolik hodin dopředu použít pro každý vliv)
    entities.append(BMSNumber(entry, "Vítr: Předpověď hodin",      "vitr_predpoved_hodin",      1, 48, 1, 6))
    entities.append(BMSNumber(entry, "Srážky: Předpověď hodin",    "srazky_predpoved_hodin",    1, 48, 1, 6))
    entities.append(BMSNumber(entry, "Vlhkost: Předpověď hodin",   "vlhkost_predpoved_hodin",   1, 48, 1, 6))
    entities.append(BMSNumber(entry, "Oblačnost: Předpověď hodin", "oblacnost_predpoved_hodin", 1, 48, 1, 6))
    entities.append(BMSNumber(entry, "Slunce: Předpověď hodin",    "slunce_predpoved_hodin",    1, 48, 1, 6))

    # --- Protimrazová ochrana ---
    entities.append(BMSNumber(entry, "Protimraz: Práh teploty",   "frost_threshold", -20, 5,   0.5, DEFAULT_FROST_THRESHOLD))
    entities.append(BMSNumber(entry, "Protimraz: Min topení",     "frost_min_heat",  20,  60,  0.5, DEFAULT_FROST_MIN_HEAT))

    # --- Noční mód ---
    entities.append(BMSNumber(entry, "Noční mód: Offset křivky",  "night_offset",    -15, 0,   0.5, DEFAULT_NIGHT_OFFSET))
    entities.append(BMSNumber(entry, "Noční mód: Začátek dne (h)","day_start",       0,   23,  1,   DEFAULT_DAY_START))
    entities.append(BMSNumber(entry, "Noční mód: Konec dne (h)",  "day_end",         0,   23,  1,   DEFAULT_DAY_END))

    # --- Boost / Útlum ---
    entities.append(BMSNumber(entry, "Boost: Přídavek °C",        "boost_amount",    0.5, 20,  0.5, DEFAULT_BOOST_AMOUNT))
    entities.append(BMSNumber(entry, "Boost: Trvání hodin",       "boost_hours",     0.5, 24,  0.5, DEFAULT_BOOST_HOURS))
    entities.append(BMSNumber(entry, "Útlum: Snížení °C",         "reduction_amount",0.5, 20,  0.5, DEFAULT_REDUCTION_AMOUNT))
    entities.append(BMSNumber(entry, "Útlum: Trvání hodin",       "reduction_hours", 0.5, 24,  0.5, DEFAULT_BOOST_HOURS))

    # --- Lineární rozsahy vnějších vlivů ---
    for key, cfg in INFLUENCE_DEFAULTS.items():
        entities.append(BMSNumber(entry, f"Vliv {key}: Efekt od",     f"{key}_od",      0,     cfg["to"], 1,   cfg["from"]))
        entities.append(BMSNumber(entry, f"Vliv {key}: Efekt do",     f"{key}_do",      1,     200,       1,   cfg["to"]))
        entities.append(BMSNumber(entry, f"Vliv {key}: Max efekt °C", f"{key}_max_eff", 0.0,   20.0,      0.1, cfg["max"]))

    # --- Solární okno ---
    entities.append(BMSNumber(entry, "Solární okno: Start",  "solarni_start",  0,   359, 1,   140))
    entities.append(BMSNumber(entry, "Solární okno: Konec",  "solarni_konec",  1,   360, 1,   220))
    entities.append(BMSNumber(entry, "Slunce: Max efekt °C", "slunce_max_eff", -10, 0,   0.1, -2.0))

    # --- Hystereze / interval přepočtu ---
    entities.append(BMSNumber(entry, "Přepočet: Interval (min)",       "prepocet_interval",  1, 120, 1,   DEFAULT_PREPOCET_INTERVAL))
    entities.append(BMSNumber(entry, "Přepočet: Delta teploty (°C)",   "prepocet_delta",     0.1, 5, 0.1, DEFAULT_PREPOCET_DELTA))

    # --- Letní bypass ---
    entities.append(BMSNumber(entry, "Letní bypass: Teplota (°C)",     "letni_bypass_temp",  5, 30, 0.5, DEFAULT_LETNI_BYPASS_TEMP))

    # --- Bezpečný bod křivky ---
    entities.append(BMSNumber(entry, "Bezpečný bod: Venkovní (°C)",    "safe_curve_outdoor", -20, 30, 0.5, DEFAULT_SAFE_CURVE_OUTDOOR))
    entities.append(BMSNumber(entry, "Bezpečný bod: Topení (°C)",      "safe_curve_temp",    10,  90, 0.5, DEFAULT_SAFE_CURVE_TEMP))

    async_add_entities(entities)


class BMSNumber(RestoreNumber):
    def __init__(self, entry, name, key, min_v, max_v, step, default):
        self._default = default
        self._attr_name = f"BMS {name}"
        self.entity_id = f"number.bms_{key}"
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_native_min_value = min_v
        self._attr_native_max_value = max_v
        self._attr_native_step = step
        self._attr_native_value = default
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "BMS Regulátor",
        }

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_number_data()
        if last and last.native_value is not None:
            self._attr_native_value = last.native_value
        self.async_write_ha_state()

    async def async_set_native_value(self, value: float) -> None:
        self._attr_native_value = value
        self.async_write_ha_state()