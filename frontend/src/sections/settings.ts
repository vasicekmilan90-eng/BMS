import { html, css } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import { baseStyles } from "../styles.js";

const GROUPS: { id: string; icon: string; numbers: string[]; toggles?: string[] }[] = [
  { id: "limits", icon: "mdi:thermometer-lines", numbers: ["limit_min", "limit_max"] },
  { id: "outdoor", icon: "mdi:home-thermometer-outline", numbers: ["safe_temp", "rozsah_venku_min", "rozsah_venku_max"] },
  { id: "safe_point", icon: "mdi:shield-check-outline", numbers: ["safe_curve_outdoor", "safe_curve_temp"] },
  { id: "forecast", icon: "mdi:weather-partly-cloudy", toggles: ["pouziti_predpovedi"], numbers: ["predpoved_hodin"] },
  { id: "recalc", icon: "mdi:timer-refresh-outline", numbers: ["prepocet_interval", "prepocet_delta"] },
];

@customElement("bms-sec-settings")
export class BmsSettingsSection extends BmsSection {
  static styles = [baseStyles, css`:host { --bms-col: 240px; }`];

  protected render() {
    const t = this.t;
    const mode = String(this.snap.settings.prepocet_rezim);
    return html`<div class="grid">
      ${GROUPS.map((g) => html`<div class="tile">
        <div class="tile-title"><ha-icon icon=${g.icon}></ha-icon>${t(`settings.${g.id}`)}</div>
        ${(g.toggles ?? []).map((key) => html`<bms-toggle .ctx=${this.ctx} key=${key} label=${t(`setting.${key}`)}></bms-toggle>`)}
        ${g.id === "recalc" ? html`<div class="row">
          <label class="label small" for="mode">${t("setting.prepocet_rezim")}</label>
          <select id="mode" ?disabled=${!this.ctx.editable} .value=${mode}
            @change=${(e: Event) => this.setSetting("prepocet_rezim", (e.target as HTMLSelectElement).value)}>
            ${["cas", "teplota", "oboji"].map((m) => html`<option value=${m} ?selected=${m === mode}>${t(`mode.${m}`)}</option>`)}
          </select>
        </div>` : ""}
        ${g.numbers.map((key) => html`<bms-number .ctx=${this.ctx} key=${key} label=${t(`setting.${key}`)}></bms-number>`)}
        <div class="small muted">${t(`settings.${g.id}_hint`)}</div>
      </div>`)}
    </div>`;
  }
}
