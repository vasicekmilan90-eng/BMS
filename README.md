# Chytrý ekvitermní regulátor (BMS)

Integrace pro Home Assistant, která počítá teplotu topné vody podle ekvitermní křivky,
koriguje ji vlivy počasí (vítr, srážky, vlhkost, oblačnost, slunce), nočním módem,
protimrazovou ochranou a boostem/útlumem a výsledek zapisuje do termostatu.
Součástí integrace je vlastní Lovelace karta **BMS Regulátor vytápění** (`custom:bms-master-card`).

Požadavky: Home Assistant **2026.9** nebo novější.

## Instalace

### HACS (doporučeno)

1. HACS → ⋮ → *Vlastní repozitáře* → přidat `https://github.com/vasicekmilan90-eng/BMS`, typ **Integrace**.
2. Nainstalovat *Chytrý ekvitermní regulátor (BMS)* a restartovat Home Assistant.
3. *Nastavení → Zařízení a služby → Přidat integraci → Chytrý ekvitermní regulátor (BMS)*.

### Ručně

Zkopírujte složku `custom_components/heating_curve` do `<config>/custom_components/`
a restartujte Home Assistant.

## Karty

Karty se registrují automaticky spolu s integrací, ruční *resource* není potřeba.
Najdete je v *Přidat kartu* pod názvem „BMS …“. Všechny mají vizuální editor.

| Karta | Obsah |
|---|---|
| `custom:bms-master-card` | celý regulátor — předvolby, sekce a jejich volby |
| `custom:bms-status-card` | výsledná teplota, hodnota na termostatu, proč právě tahle teplota, upozornění |
| `custom:bms-actions-card` | Přitopit / Ubrat (jiná hodnota podržením, +1 hodina) a rychlé profily |
| `custom:bms-automations-card` | protimraz, noční útlum, letní bypass |
| `custom:bms-profiles-card` | rychlé profily, správa profilů, časové plány |
| `custom:bms-curve-card` | graf a editor topné křivky, simulace „co kdyby“ |
| `custom:bms-influences-card` | vlivy počasí a slunce s grafem |
| `custom:bms-log-card` | výpočetní log |
| `custom:bms-settings-card` | limity, výpadek venkovní teploty, výchozí přitápění a útlum, přepočet |

Dále integrace přidává **odznak** `custom:bms-badge` (teplota a stav regulace) a **funkce dlaždic**
pro entity regulátoru: `custom:bms-temporary-change` (boost/útlum) a `custom:bms-profile-select`
(rychlé profily) — v editoru dlaždice je najdete pod *Funkce*.

### Konfigurace

Nejrychlejší je zvolit v editoru **předvolbu**: *Rodina* (stav, rychlé akce, automatiky),
*Technik* (vše), *Mobil* (kompaktní stav a akce), *Přehled* (jen pro čtení). Pak lze sekce
zapínat, řadit a každé nastavit vlastní volby. V YAML lze předvolbu použít i přímo (`preset: family`).

```yaml
type: custom:bms-master-card
title: Kotel
layout: auto              # auto (2 sloupce na široké kartě) | single | columns
compact: false
read_only: false          # karta nic nemění
admin_only_settings: true # profily, plány a nastavení jen pro administrátory
sections:
  - type: status
    show: [result, thermostat, breakdown, facts, next, alerts, main_switch, refresh]   # + trend
  - type: actions
    show: [temporary, profiles]
    directions: [boost, reduction]
    durations: [1, 2, 4]  # délky nabízené u „Jiné hodnoty“
    profiles: []          # prázdné = profily s hvězdičkou
  - type: profiles
    tabs: [manage, schedules]
    allow: [load, save, rename, delete, star, transfer]
    collapsed: true
  - type: automations
    items: [frost, night, bypass]
    controls: full        # status = jen stav a vypínač, full = i „Upravit“
  - type: curve
    series: [result, limits, current]   # + modified, safe_point
    editor: full          # none | shift | points | full (úpravy za tlačítkem „Upravit křivku“)
    simulate: true
    range: [-20, 20]      # osa venkovní teploty (jinak podle nastavení regulátoru)
  - type: influences
    items: [vitr, srazky, vlhkost, oblacnost, slunce]
    chart: true           # odkaz „Graf 24 h“
    controls: full        # values | full
  - type: log
    limit: 20
    filter: all           # all | writes
    collapsed: true
  - type: settings
    groups: [limits, fallback, temporary, recalc]
    collapsed: true
```

Každá sekce může mít navíc `collapsed`, `admin_only`, `column` (1 = levý, 2 = pravý sloupec; jinak vlevo
ovládání a vpravo křivka, vlivy, log a nastavení) a `visibility`
se stejnými podmínkami jako dashboardy HA (`state`, `numeric_state`, `screen`, `user`, `and`, `or`):

```yaml
  - type: settings
    visibility:
      - condition: screen
        media_query: "(min-width: 768px)"
```

Sekce lze zapsat i jen názvem (`- curve`). Zápis z verze 0.2 (`modes`, `quick_profiles`,
`schedules`, `collapsed: [...]`, `curve_editor`) se převede automaticky.

## Regulace

- **Přepočet** (`select.bms_prepocet_rezim`): termostat se nastavuje podle intervalu, při změně venkovní
  teploty o `number.bms_prepocet_delta`, nebo obojí. Zobrazené hodnoty se obnovují průběžně.
- **Termostat** se nastavuje s ohledem na jeho krok a rozsah (`target_temp_step`, `min_temp`, `max_temp`),
  jen když se hodnota liší a termostat není vypnutý.
- **Předpověď** se stahuje jednou a sdílí.
  - **Křivka** může počítat s teplotou teď, nebo s předpovězenou teplotou za N hodin — přepíná se přímo
    pod grafem křivky („Počítá s: Teď | Předpověď za N h“). Výhled odpovídá setrvačnosti domu, obvykle 2–6 h.
  - **Každý vliv** včetně slunce má vlastní „Použít předpověď“ a výhled v hodinách. U slunce se pak bere
    poloha slunce i oblačnost ze stejného okamžiku.
- **Slunce** (`select.bms_slunce_rezim`) má tři způsoby výpočtu:
  - *Pevné okno* — účinek jen mezi dvěma azimuty (původní chování). Východ a západ slunce se během roku
    posouvají, okno ne, takže v zimě a v létě pokrývá jinou část dne; karta ukazuje, kolik procent
    slunečné doby okno pokrývá v zimě, dnes a v létě.
  - *Směr oken* — zadáte, kam okna míří (`number.bms_slunce_orientace`, 180° = jih). Účinek odpovídá
    úhlu, pod kterým slunce do oken svítí, a sedí po celý rok bez přenastavení.
  - *Celý den* — slunce se počítá po celou dobu nad obzorem, vztaženo k dnešní polední výšce
    (0 při východu a západu, plný účinek v poledne v zimě i v létě).
- **Plány** přepnou profil jen při změně splněného pravidla — ruční volba profilu má přednost.
- **Problémy** hlásí `binary_sensor.bms_problem`, chybějící entity se objeví v *Opravách*.
- **Možnosti** integrace (*Nastavení → Zařízení a služby → BMS → Konfigurovat*) nastaví limity,
  výpadek venkovní teploty, přepočet a předpověď i bez karty.

## Vývoj

```bash
cd frontend && npm ci && npm test && npm run build   # sestaví kartu do custom_components/…/frontend
pip install -r requirements_test.txt && pytest       # testy integrace
```

Náhled karty bez Home Assistantu: `python -m http.server` v kořeni repozitáře a otevřít
`/frontend/demo/index.html`.

## Přechod ze staršího ručního nasazení

- Odstraňte starou ruční registraci karty (*Nastavení → Dashboardy → ⋮ → Zdroje*,
  typicky `/local/community/BMS/card.js`) a staré soubory v `www/community/BMS/`.
- Entity (`number.bms_*`, `switch.bms_*`, `select.bms_*`, `sensor.bms_*`), profily
  i uložená křivka zůstávají beze změny.
- Vybrané entity (termostat, senzory, počasí) lze změnit přes *Znovu nakonfigurovat*
  bez smazání integrace. Entita slunce už není potřeba — poloha se počítá z polohy HA.
- Ve verzi 0.2 se profily a nastavení převedou do nového úložiště `heating_curve.data`
  automaticky; staré soubory zůstanou jako záloha.
