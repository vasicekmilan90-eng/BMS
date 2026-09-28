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

## Karta

Karta se registruje automaticky spolu s integrací (včetně Chart.js), žádný ruční
*resource* není potřeba. Do dashboardu ji přidáte přes *Přidat kartu → BMS Regulátor vytápění*
nebo v YAML:

```yaml
type: custom:bms-master-card
```

## Přechod ze staršího ručního nasazení

- Odstraňte starou ruční registraci karty (*Nastavení → Dashboardy → ⋮ → Zdroje*,
  typicky `/local/community/BMS/card.js`) a staré soubory v `www/community/BMS/`.
- Entity (`number.bms_*`, `switch.bms_*`, `select.bms_*`, `sensor.bms_*`), profily
  i uložená křivka zůstávají beze změny.
- Vybrané entity (termostat, senzory, počasí, slunce) lze nově změnit přes
  *Znovu nakonfigurovat* bez smazání integrace.
