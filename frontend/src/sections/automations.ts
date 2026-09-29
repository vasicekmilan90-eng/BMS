import { html, nothing, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned } from "../i18n.js";
import { baseStyles } from "../styles.js";

type Item = SectionOptions["automations"]["items"][number];

const META: Record<Item, { icon: string; toggle: string; tone: string; numbers: string[] }> = {
  frost: { icon: "mdi:snowflake-alert", toggle: "frost_protection", tone: "frost", numbers: ["frost_threshold", "frost_min_heat"] },
  night: { icon: "mdi:weather-night", toggle: "night_mode", tone: "night", numbers: ["night_offset", "day_start", "day_end"] },
  bypass: { icon: "mdi:weather-sunny-off", toggle: "letni_bypass", tone: "warn", numbers: ["letni_bypass_temp"] },
};

@customElement("bms-sec-automations")
export class BmsAutomationsSection extends BmsSection<SectionOptions["automations"]> {
  static styles = [baseStyles, css`
    .controls { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0 16px; }
    .day { width: 100%; height: 22px; display: block; margin: 2px 0 0; }
    .hours { display: flex; justify-content: space-between; font-size: 10px; color: var(--bms-muted); margin-bottom: 4px; }
    .footer { display: flex; justify-content: flex-end; }
  `];

  @state() private editing = false;

  private description(item: Item): string {
    const { lang } = this.ctx;
    const t = this.t;
    switch (item) {
      case "frost":
        return t("auto.frost_desc", {
          threshold: formatNumber(this.num("frost_threshold"), lang, 0), min: formatNumber(this.num("frost_min_heat"), lang, 0),
        });
      case "night":
        return t("auto.night_desc", {
          start: this.num("day_end"), end: this.num("day_start"), offset: formatSigned(this.num("night_offset"), lang, 0),
        });
      case "bypass":
        return t("auto.bypass_desc", { temp: formatNumber(this.num("letni_bypass_temp"), lang, 0) });
    }
  }

  private active(item: Item): boolean {
    const r = this.snap.result;
    return Boolean(item === "frost" ? r?.frost_active : item === "night" ? r?.night_active : r?.bypass_active);
  }

  /** Den a noc během 24 h se značkou aktuálního času. */
  private dayBar() {
    const start = this.num("day_start");
    const end = this.num("day_end");
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    const x = (h: number) => (h / 24) * 240;
    const day = start <= end ? [[start, end]] : [[0, end], [start, 24]];
    return html`
      <svg class="day" viewBox="0 0 240 22" preserveAspectRatio="none" role="img" aria-label=${this.t("auto.day_bar", { start, end })}>
        <rect x="0" y="4" width="240" height="14" rx="4" fill="var(--bms-night)" opacity="0.35"></rect>
        ${day.map(([a, b]) => svg`<rect x=${x(a)} y="4" width=${Math.max(0, x(b) - x(a))} height="14" fill="var(--bms-warn)" opacity="0.45"></rect>`)}
        <line x1=${x(nowH)} x2=${x(nowH)} y1="0" y2="22" stroke="var(--primary-text-color)" stroke-width="2" vector-effect="non-scaling-stroke"></line>
      </svg>
      <div class="hours"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>`;
  }

  protected render() {
    const t = this.t;
    const canEdit = this.options.controls === "full" && this.ctx.editable;
    const editing = canEdit && this.editing;
    return html`
      ${this.options.items.map((item) => {
        const meta = META[item];
        const enabled = this.on(meta.toggle);
        return html`<div class="item">
          <span class="ico ${enabled ? "on" : ""}"><ha-icon icon=${meta.icon}></ha-icon></span>
          <div class="txt">
            <div class="name">${t(`modes.${item}`)}
              ${this.active(item) ? html`<span class="badge ${meta.tone}">${t("auto.active_now")}</span>` : nothing}</div>
            <div class="desc">${enabled ? this.description(item) : t("auto.disabled")}</div>
          </div>
          <ha-switch .checked=${enabled} ?disabled=${!this.ctx.editable} aria-label=${t(`modes.${item}`)}
            @change=${(e: Event) => this.setSetting(meta.toggle, (e.target as HTMLInputElement).checked, t(`modes.${item}`))}></ha-switch>
        </div>
        ${editing ? html`<div class="item-details">
          ${item === "night" ? this.dayBar() : nothing}
          <div class="controls">${meta.numbers.map((key) =>
            html`<bms-number .ctx=${this.ctx} key=${key} label=${t(`setting.${key}`)}></bms-number>`)}</div>
        </div>` : nothing}`;
      })}
      ${canEdit ? html`<div class="footer">
        <button class="btn text" aria-expanded=${this.editing} @click=${() => (this.editing = !this.editing)}>
          <ha-icon icon=${this.editing ? "mdi:check" : "mdi:pencil"}></ha-icon>${t(this.editing ? "common.done" : "common.edit")}</button>
      </div>` : nothing}
    `;
  }
}
