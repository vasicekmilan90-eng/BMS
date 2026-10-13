# Smart Weather-Compensated Heating Controller (BMS)

**English** | [Čeština](README.cs.md)

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories)
[![GitHub release](https://img.shields.io/github/v/release/vasicekmilan90-eng/BMS)](https://github.com/vasicekmilan90-eng/BMS/releases)
[![Validate](https://github.com/vasicekmilan90-eng/BMS/actions/workflows/validate.yml/badge.svg)](https://github.com/vasicekmilan90-eng/BMS/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/github/license/vasicekmilan90-eng/BMS)](LICENSE)

A Home Assistant integration that calculates the heating flow temperature from a weather-compensation
(heating) curve. It corrects the value for weather influences (wind, precipitation, humidity, cloud
coverage, sun) and adds night mode, frost protection and temporary boost or reduction. The result is
written to your thermostat.

The integration ships with its own Lovelace card, **BMS Regulátor vytápění** (`custom:bms-master-card`),
plus smaller cards, a badge and tile features.

## Features

- Editable heating curve with any number of points and a "what if" simulation.
- Weather corrections for wind, precipitation, humidity, cloud coverage and sun, each with its own
  range, maximum effect and on/off switch.
- Optional use of the forecast, separately for the curve and for each influence. In night mode the
  forecast horizon can be extended automatically.
- Three sun calculation modes: fixed azimuth window, window direction, or whole day above the horizon.
- Night mode, frost protection, summer bypass, and temporary boost or reduction.
- Seasonal profiles with automatic switching by date or by average outdoor temperature.
- The thermostat is written only when the value changes, respecting its step and min/max range.
- Fallbacks when the outdoor sensor fails, Repairs issues for missing entities, and diagnostics.
- Card, badge and tile features registered automatically, with a visual editor, in Czech and English.

## Prerequisites

- Home Assistant **2026.9** or newer.
- A `climate` entity whose target temperature sets the heating flow temperature (for example the
  boiler or heat pump thermostat).
- An outdoor temperature sensor.
- Optional: a `weather` entity that provides hourly or twice-daily forecasts through
  `weather.get_forecasts`. It is the only source of forecasts.
- Optional: separate sensors for wind speed, precipitation, outdoor humidity and cloud coverage.
- The Home Assistant location must be set. The sun position is calculated from it.

## Installation

### HACS (recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=vasicekmilan90-eng&repository=BMS&category=integration)

1. In HACS, open ⋮ → *Custom repositories* and add `https://github.com/vasicekmilan90-eng/BMS`
   with the type **Integration**.
2. Install *Smart Heating Curve Controller (BMS)* and restart Home Assistant.

### Manual

1. Download the latest [release](https://github.com/vasicekmilan90-eng/BMS/releases).
2. Copy the `custom_components/heating_curve` folder to `<config>/custom_components/`.
3. Restart Home Assistant.

## Configuration

[![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=heating_curve)

Go to *Settings → Devices & services → Add integration* and search for
*Smart Heating Curve Controller (BMS)*. Only one instance can be configured.

| Field | Required | Description |
|---|---|---|
| Thermostat | yes | `climate` entity whose target temperature the controller sets. |
| Outdoor temperature sensor | yes | Primary input for the heating curve. |
| Weather entity | no | Source of forecasts, and of current influences that have no own sensor. |
| Wind speed sensor | no | Takes precedence over the weather entity. Converted to km/h. |
| Precipitation sensor | no | Intensity is converted to mm/h; an accumulated amount is used in mm. |
| Outdoor humidity sensor | no | Relative humidity in %. |
| Cloud coverage sensor | no | 0 % = clear, 100 % = overcast. |

For each influence, the current value comes from the first available source:
**own sensor → weather entity → nearest forecast hour**.

> [!IMPORTANT]
> The **main switch** (`switch.bms_main_switch`) is **off** after installation. The controller
> calculates and shows values, but does not set the thermostat until you turn the switch on.
> Review the curve and the thermostat limits first.

### Reconfigure

*Settings → Devices & services → BMS → ⋮ → Reconfigure* changes the selected entities without
removing the integration. Profiles, the curve and all settings are kept. Clear a field to remove an
optional sensor.

### Options

*Settings → Devices & services → BMS → Configure* sets the thermostat limits, the fallback when the
outdoor temperature is unavailable, the recalculation mode, the curve forecast and the sun mode without
using the card. All other settings are available as entities and in the card.

## How it works

1. The curve gives the flow temperature for the outdoor temperature. With the curve forecast on, the
   forecast temperature N hours ahead is used instead. The horizon should match the building's thermal
   inertia, usually 2–6 h.
2. Weather corrections are added. Each influence has no effect below *Effect from*, then grows
   linearly to *Max correction* at *Full effect at*.
3. The night mode offset and an active boost or reduction are added.
4. The result is clamped to the thermostat limits. Frost protection raises the minimum below its
   threshold.
5. The thermostat is set unless the main switch is off, the summer bypass is active, the thermostat is
   off, or the value has not changed.

**Sun modes** (`select.bms_sun_mode`):

- *Fixed azimuth window* – effect only between two azimuths. Sunrise and sunset move during the year,
  the window does not; the card shows how much of the sunny time the window covers in winter, today
  and in summer.
- *By window direction* – set where your windows face (`number.bms_sun_orientation`, 180° = south).
  The effect follows the angle of incidence and fits all year round.
- *Whole day above horizon* – the sun counts the whole time it is above the horizon, relative to
  today's noon elevation.

**Outdoor temperature fallback:** if the outdoor sensor is unavailable, the weather entity's
temperature is used. If that is unavailable too, the controller heats at the configured safe point.

## Cards

Cards are registered automatically with the integration; no manual resource is needed. Find them in
*Add card* under "BMS …". All of them have a visual editor.

| Card | Content |
|---|---|
| `custom:bms-master-card` | the whole controller – presets, sections and their options |
| `custom:bms-status-card` | resulting temperature, thermostat value, why this temperature, alerts |
| `custom:bms-actions-card` | boost / reduce (hold for a custom value, +1 hour) and quick profiles |
| `custom:bms-automations-card` | frost protection, night mode, summer bypass |
| `custom:bms-profiles-card` | quick profiles, profile management, schedules |
| `custom:bms-curve-card` | heating curve chart and editor, "what if" simulation |
| `custom:bms-influences-card` | weather and sun influences with a chart |
| `custom:bms-log-card` | calculation log |
| `custom:bms-settings-card` | limits, outdoor temperature fallback, default boost and reduction, recalculation |

The integration also adds the **badge** `custom:bms-badge` (temperature and control state) and
**tile features** for the controller entities: `custom:bms-temporary-change` (boost/reduction) and
`custom:bms-profile-select` (quick profiles). In the tile card editor, find them under *Features*.

### Card configuration

The quickest start is a **preset** in the editor: *Family* (status, quick actions, automations),
*Technician* (everything), *Mobile* (compact status and actions), *Overview* (read-only). Sections can
then be toggled, reordered and configured. Presets can also be used in YAML (`preset: family`).

```yaml
type: custom:bms-master-card
title: Boiler
layout: auto              # auto (2 columns on a wide card) | single | columns
compact: false
read_only: false          # the card changes nothing
admin_only_settings: true # profiles, schedules and settings only for administrators
sections:
  - type: status
    show: [result, thermostat, breakdown, facts, next, alerts, main_switch, refresh]   # + trend
  - type: actions
    show: [temporary, profiles]
    directions: [boost, reduction]
    durations: [1, 2, 4]  # durations offered under "Other value"
    profiles: []          # empty = starred profiles
  - type: profiles
    tabs: [manage, schedules]
    allow: [load, save, rename, delete, star, transfer]
    collapsed: true
  - type: automations
    items: [frost, night, bypass]
    controls: full        # status = state and switch only, full = also "Edit"
  - type: curve
    series: [result, limits, current]   # + modified, safe_point
    editor: full          # none | shift | points | full (behind the "Edit curve" button)
    simulate: true
    range: [-20, 20]      # outdoor temperature axis (otherwise from the controller settings)
  - type: influences
    items: [wind, rain, humidity, clouds, sun]
    chart: true           # "24 h chart" link
    controls: full        # values | full
  - type: log
    limit: 20
    filter: all           # all | writes
    collapsed: true
  - type: settings
    groups: [limits, fallback, temporary, recalc]
    collapsed: true
```

Every section also accepts `collapsed`, `admin_only`, `column` (1 = left, 2 = right; by default
controls are on the left and curve, influences, log and settings on the right) and `visibility` with
the same conditions as Home Assistant dashboards (`state`, `numeric_state`, `screen`, `user`, `and`,
`or`):

```yaml
  - type: settings
    visibility:
      - condition: screen
        media_query: "(min-width: 768px)"
```

A section can also be written by name only (`- curve`). The 0.2 syntax (`modes`, `quick_profiles`,
`schedules`, `collapsed: [...]`, `curve_editor`) is converted automatically.

## Entities

The integration creates one device, *BMS*. All entity IDs start with `bms_`; entity names are translated.
In the list below, `<influence>` is `wind`, `rain`, `humidity`, `clouds` or `sun`.

| Platform | Entities |
|---|---|
| Sensor | `sensor.bms_calc_temp` (resulting temperature, the main output); diagnostic sensors for the applied and measured outdoor temperature, curve temperature, total correction, result after limits, current and forecast wind / precipitation / humidity / clouds / temperature, sun position, individual corrections, curve storage, outdoor temperature source, boost status, weather status and influences log |
| Binary sensor | `binary_sensor.bms_problem` – on when control needs attention |
| Switch | `main_switch`, `influence_<influence>`, `<influence>_forecast`, `curve_forecast`, `frost_protection`, `night_mode`, `summer_bypass` |
| Number | `limit_min` / `limit_max`, `outdoor_range_min` / `outdoor_range_max`, `<influence>_from` / `_to` / `_max_effect` (sun: `sun_max_effect`), `<influence>_forecast_hours`, `curve_forecast_hours`, `frost_threshold`, `frost_min_heat`, `night_offset`, `day_start`, `day_end`, `night_forecast_extra`, `boost_amount` / `boost_hours`, `reduction_amount` / `reduction_hours`, `solar_window_start` / `solar_window_end`, `sun_orientation`, `recalc_interval`, `recalc_delta`, `summer_bypass_temp`, `safe_temp`, `safe_curve_outdoor`, `safe_curve_temp` |
| Select | `curve_profile`, `recalc_mode` (`time` / `temperature` / `both`), `sun_mode` (`window` / `facade` / `daylight`) |

For example, the wind forecast horizon is `number.bms_wind_forecast_hours`.

Seasonal settings (curve, influences, forecasts, night mode, frost protection, boost defaults) are
part of **profiles**. Integration settings (limits, recalculation, bypass) are not.

## Actions

All actions are in the `heating_curve` domain.

| Action | Description |
|---|---|
| `activate_boost` | Raise the temperature by `amount` °C for `hours` (defaults from the boost settings). |
| `activate_reduction` | Lower the temperature by `amount` °C for `hours`. |
| `cancel_boost` | End an active boost or reduction. |
| `force_refresh` | Reload the forecast, recalculate, set the thermostat and log the result. Returns a response. |
| `save_profile` / `load_profile` / `delete_profile` / `rename_profile` | Manage curve profiles by `name`. |
| `set_starred` | Set the quick profiles shown in the card. |
| `save_schedule` / `delete_schedule` / `reorder_schedules` | Manage automatic profile switching rules (by date `MM-DD` or by average outdoor temperature over N days). |
| `set_curve_points` | Store the complete curve, e.g. `[{"x": -20, "y": 70}, {"x": 20, "y": 20}]`. |
| `get_curve_points` | Return the curve points and storage state. |
| `retry_storage` | Retry writing the curve after a storage failure. |

## Events

| Event | Fired when |
|---|---|
| `heating_curve_boost_expired` | A boost or reduction ends (`kind`, `amount`). |
| `heating_curve_curve_changed` | The curve changes. |
| `heating_curve_profiles_changed` | Profiles, quick profiles or schedules change. |
| `heating_curve_curve_response` | `get_curve_points` was called. |
| `heating_curve_force_refresh_done` | `force_refresh` finished. |

## Examples

Boost the heating for two hours when someone comes home:

```yaml
automation:
  - alias: "Heating boost on arrival"
    triggers:
      - trigger: state
        entity_id: person.jane
        to: home
    actions:
      - action: heating_curve.activate_boost
        data:
          amount: 3
          hours: 2
```

Use a longer curve forecast on cold days:

```yaml
automation:
  - alias: "Longer curve forecast below -5 °C"
    triggers:
      - trigger: numeric_state
        entity_id: sensor.outdoor_temperature
        below: -5
    actions:
      - action: number.set_value
        target:
          entity_id: number.bms_curve_forecast_hours
        data:
          value: 6
```

Recalculate on demand and send the result:

```yaml
script:
  bms_refresh:
    sequence:
      - action: heating_curve.force_refresh
        response_variable: bms
      - action: notify.notify
        data:
          message: "Heating: {{ bms.status }}, thermostat {{ bms.thermostat.value }} °C"
```

## Data updates

- The integration is **calculated** (`iot_class: calculated`); it does not poll devices itself.
- Displayed values update when the input entities change.
- The thermostat is set by the recalculation mode (`select.bms_recalc_mode`): every
  `number.bms_recalc_interval` minutes (default 30), when the outdoor temperature changes by
  `number.bms_recalc_delta` (default 0.5 °C), or both.
- The forecast is fetched with `weather.get_forecasts` (hourly, falling back to twice daily) and reused
  for up to 30 minutes.
- Schedules are evaluated after every calculation. They switch the profile only when a different rule
  starts to match, so a manually selected profile is kept.

## Known limitations

- Only one instance and one thermostat are supported.
- Forecasts come only from the weather entity; own sensors provide current values only.
- Schedules switch whole profiles by date or by average temperature; there are no time-of-day rules.
  Use Home Assistant automations with `number.set_value` / `switch.turn_on` for that.
- Changing a profile setting from an automation marks the active profile as modified.
- The built-in profile names are Czech (*Výchozí* = default, *Zima* = winter, *Jaro/Podzim* =
  spring/autumn, *Léto* = summer). The seasonal ones can be renamed in the card.

## Troubleshooting

- `binary_sensor.bms_problem` and the status card list current problems. Missing entities also appear
  in *Settings → Repairs*.
- If `sensor.bms_curve_storage_status` shows `FALLBACK`, the curve could not be saved; call
  `heating_curve.retry_storage`.
- *Settings → Devices & services → BMS → ⋮ → Download diagnostics* collects the settings, inputs, last
  result, problems and recent calculation log for a bug report.
- Debug logging:

  ```yaml
  logger:
    logs:
      custom_components.heating_curve: debug
  ```

Please report issues at <https://github.com/vasicekmilan90-eng/BMS/issues>.

## Removing the integration

1. *Settings → Devices & services → BMS → ⋮ → Delete*.
2. If installed through HACS, remove the repository in HACS; otherwise delete
   `<config>/custom_components/heating_curve`.
3. Restart Home Assistant.

Profiles, the curve and schedules stay in `<config>/.storage/heating_curve.data`, so they come back
after reinstalling. Delete that file to start fresh. Remove any BMS cards from your dashboards.

## Upgrading

### From 0.5 to 0.6

Entity IDs and setting keys changed from Czech to English (e.g. `switch.bms_hlavni_vypinac` →
`switch.bms_main_switch`, `number.bms_vitr_od` → `number.bms_wind_from`). Entities, stored settings and
profiles are migrated automatically and keep their history, and card configurations with the old
influence names (`vitr`, `srazky`, …) keep working. Update your own automations, scripts and dashboard
cards that reference the old entity IDs.

### From a manual card setup

- Remove the old manual card resource (*Settings → Dashboards → ⋮ → Resources*, typically
  `/local/community/BMS/card.js`) and the old files in `www/community/BMS/`.
- Profiles and the stored curve stay unchanged.
- A sun entity is no longer needed; the position is calculated from the Home Assistant location.
- In 0.2, profiles and settings are migrated to the `heating_curve.data` storage automatically; the
  old files remain as a backup.

## Development

```bash
cd frontend && npm ci && npm test && npm run build   # builds the card into custom_components/…/frontend
pip install -r requirements_test.txt && pytest       # integration tests
```

Card preview without Home Assistant: run `python -m http.server` in the repository root and open
`/frontend/demo/index.html`.

## License

[MIT](LICENSE)
