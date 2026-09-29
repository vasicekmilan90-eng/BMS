/** Registrace karet BMS regulátoru. */

import {
  BmsActionsCard, BmsAutomationsCard, BmsCard, BmsCurveCard, BmsInfluencesCard, BmsLogCard, BmsModesCard, BmsProfilesCard,
  BmsSettingsCard, BmsStatusCard,
} from "./card.js";
import { registerBadge } from "./badge.js";
import "./editor.js";
import { registerFeatures } from "./features.js";
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
/** [typ, třída, název, popis, nabízet ve výběru karet] */
const CARDS: [string, CustomElementConstructor, string, string, boolean][] = [
  ["bms-master-card", BmsCard, "BMS Regulátor vytápění", "Celý regulátor — předvolby, sekce a jejich volby v editoru.", true],
  ["bms-status-card", BmsStatusCard, "BMS – Stav regulace", "Výsledná teplota, termostat, rozpad výpočtu a upozornění.", true],
  ["bms-actions-card", BmsActionsCard, "BMS – Rychlé akce", "Boost, útlum a rychlé profily.", true],
  ["bms-automations-card", BmsAutomationsCard, "BMS – Automatiky", "Protimraz, noční útlum a letní bypass.", true],
  ["bms-profiles-card", BmsProfilesCard, "BMS – Profily a plány", "Rychlé profily, správa profilů a časové plány.", true],
  ["bms-curve-card", BmsCurveCard, "BMS – Topná křivka", "Graf, editor a simulace topné křivky.", true],
  ["bms-influences-card", BmsInfluencesCard, "BMS – Vlivy počasí", "Vlivy počasí a slunce s grafem.", true],
  ["bms-log-card", BmsLogCard, "BMS – Výpočetní log", "Historie výpočtů a událostí.", true],
  ["bms-settings-card", BmsSettingsCard, "BMS – Nastavení", "Limity, bezpečný bod, předpověď a přepočet.", true],
  ["bms-modes-card", BmsModesCard, "BMS – Režimy", "Starší karta (akce + automatiky).", false],
];

window.customCards = window.customCards ?? [];
for (const [type, ctor, name, description, listed] of CARDS) {
  if (!customElements.get(type)) customElements.define(type, ctor);
  if (listed && !window.customCards.some((c) => c.type === type)) {
    window.customCards.push({ type, name, description, preview: true, documentationURL: DOCS });
  }
}
registerFeatures();
registerBadge();

console.info(`%c BMS-MASTER-CARD %c v${VERSION} `, "color:#fff;background:#43a047;font-weight:600", "color:#43a047");
