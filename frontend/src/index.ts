/** Registrace karet BMS regulátoru. */

import {
  BmsCard, BmsCurveCard, BmsInfluencesCard, BmsLogCard, BmsModesCard, BmsProfilesCard, BmsSettingsCard, BmsStatusCard,
} from "./card.js";
import "./editor.js";
import pkg from "../package.json";

const VERSION = pkg.version;

interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}

const DOCS = "https://github.com/vasicekmilan90-eng/BMS";
const CARDS: [string, CustomElementConstructor, string, string][] = [
  ["bms-master-card", BmsCard, "BMS Regulátor vytápění", "Celý regulátor — sekce lze zapínat a řadit v editoru."],
  ["bms-status-card", BmsStatusCard, "BMS – Stav regulace", "Výsledná teplota, korekce a upozornění."],
  ["bms-modes-card", BmsModesCard, "BMS – Režimy", "Boost, útlum, protimraz, noční mód a letní bypass."],
  ["bms-profiles-card", BmsProfilesCard, "BMS – Profily a plány", "Rychlé profily, správa profilů a časové plány."],
  ["bms-curve-card", BmsCurveCard, "BMS – Topná křivka", "Graf a editor topné křivky."],
  ["bms-influences-card", BmsInfluencesCard, "BMS – Vlivy počasí", "Graf a nastavení vlivů počasí a slunce."],
  ["bms-log-card", BmsLogCard, "BMS – Výpočetní log", "Historie výpočtů a událostí."],
  ["bms-settings-card", BmsSettingsCard, "BMS – Nastavení", "Limity, bezpečný bod, předpověď a přepočet."],
];

window.customCards = window.customCards ?? [];
for (const [type, ctor, name, description] of CARDS) {
  if (!customElements.get(type)) customElements.define(type, ctor);
  if (!window.customCards.some((c) => c.type === type)) {
    window.customCards.push({ type, name, description, preview: true, documentationURL: DOCS });
  }
}

console.info(`%c BMS-MASTER-CARD %c v${VERSION} `, "color:#fff;background:#43a047;font-weight:600", "color:#43a047");
