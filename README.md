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
| `custom:bms-master-card` | celý regulátor, sekce lze zapínat, řadit a sbalovat |
| `custom:bms-status-card` | výsledná teplota, korekce, upozornění |
| `custom:bms-modes-card` | boost, útlum, protimraz, noční mód, letní bypass |
| `custom:bms-profiles-card` | rychlé profily, správa profilů, časové plány |
| `custom:bms-curve-card` | graf a editor topné křivky |
| `custom:bms-influences-card` | graf a nastavení vlivů počasí a slunce |
| `custom:bms-log-card` | výpočetní log |
| `custom:bms-settings-card` | limity, bezpečný bod, předpověď, přepočet |

Volby (všechny nepovinné):

```yaml
type: custom:bms-master-card
title: Kotel
sections: [status, modes, quick_profiles, curve]   # pořadí = pořadí zobrazení
modes: [boost, reduction, night]                   # režimy v sekci „Režimy“
collapsed: [log, settings]                         # sekce sbalené po načtení
compact: false                                     # jen podstatné údaje
curve_editor: true                                 # tabulka bodů křivky
read_only: false                                   # karta nic nemění
admin_only_settings: true                          # správu vidí jen administrátoři
```

Sekce: `status`, `modes`, `quick_profiles`, `profiles`, `schedules`, `curve`, `influences`, `log`, `settings`.

## Regulace

- **Přepočet** (`select.bms_prepocet_rezim`): termostat se nastavuje podle intervalu, při změně venkovní
  teploty o `number.bms_prepocet_delta`, nebo obojí. Zobrazené hodnoty se obnovují průběžně.
- **Termostat** se nastavuje s ohledem na jeho krok a rozsah (`target_temp_step`, `min_temp`, `max_temp`),
  jen když se hodnota liší a termostat není vypnutý.
- **Předpověď** se stahuje jednou a sdílí; každý vliv má vlastní výhled v hodinách.
- **Plány** přepnou profil jen při změně splněného pravidla — ruční volba profilu má přednost.
- **Problémy** hlásí `binary_sensor.bms_problem`, chybějící entity se objeví v *Opravách*.

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
