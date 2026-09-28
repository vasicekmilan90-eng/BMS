import { html, css, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber } from "../i18n.js";
import { baseStyles } from "../styles.js";

type GroupId = SectionOptions["settings"]["groups"][number];

const GROUPS: Record<GroupId, { icon: string; numbers: string[]; toggles?: string[] }> = {
  limits: { icon: "mdi:thermometer-lines", numbers: ["limit_min", "limit_max"] },
  fallback: { icon: "mdi:shield-check-outline", numbers: ["safe_temp", "safe_curve_temp"] },
  temporary: { icon: "mdi:timer-outline", numbers: ["boost_amount", "boost_hours", "reduction_amount", "reduction_hours"] },
  forecast: { icon: "mdi:weather-partly-cloudy", toggles: ["pouziti_predpovedi"], numbers: ["predpoved_hodin"] },
  recalc: { icon: "mdi:timer-refresh-outline", numbers: ["prepocet_interval", "prepocet_delta"] },
};

@customElement("bms-sec-settings")
export class BmsSettingsSection extends BmsSection<SectionOptions["settings"]> {
  static styles = [baseStyles, css`:host { --bms-col: 240px; }`];

  private hint(id: GroupId): string {
    const { lang } = this.ctx;
    if (id === "fallback") {
      return this.t("settings.fallback_hint", {
        out: formatNumber(this.num("safe_temp"), lang), flow: formatNumber(this.num("safe_curve_temp"), lang),
      });
    }
    return this.t(`settings.${id}_hint`);
  }

  protected render() {
    const t = this.t;
    const mode = String(this.snap.settings.prepocet_rezim);
    return html`<div class="grid">
      ${this.options.groups.map((id) => {
        const g = GROUPS[id];
        return html`<div class="tile">
          <div class="tile-title"><ha-icon icon=${g.icon}></ha-icon>${t(`settings.${id}`)}</div>
          ${(g.toggles ?? []).map((key) => html`<bms-toggle .ctx=${this.ctx} key=${key} label=${t(`setting.${key}`)}></bms-toggle>`)}
          ${id === "recalc" ? html`<div class="row">
            <label class="label small" for="mode">${t("setting.prepocet_rezim")}</label>
            <select id="mode" ?disabled=${!this.ctx.editable} .value=${mode}
              @change=${(e: Event) => this.setSetting("prepocet_rezim", (e.target as HTMLSelectElement).value)}>
              ${["cas", "teplota", "oboji"].map((m) => html`<option value=${m} ?selected=${m === mode}>${t(`mode.${m}`)}</option>`)}
            </select>
          </div>` : nothing}
          ${g.numbers.map((key) => html`<bms-number .ctx=${this.ctx} key=${key} label=${t(`setting.${key}`)}></bms-number>`)}
          <div class="small muted">${this.hint(id)}</div>
        </div>`;
      })}
    </div>`;
  }
}
