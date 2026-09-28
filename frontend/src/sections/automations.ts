import { html, nothing, css, svg } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned } from "../i18n.js";
import { baseStyles } from "../styles.js";

type Item = SectionOptions["automations"]["items"][number];

const META: Record<Item, { icon: string; toggle: string; tone: string }> = {
  frost: { icon: "mdi:snowflake-alert", toggle: "frost_protection", tone: "frost" },
  night: { icon: "mdi:weather-night", toggle: "night_mode", tone: "night" },
  bypass: { icon: "mdi:weather-sunny-off", toggle: "letni_bypass", tone: "warn" },
};

@customElement("bms-sec-automations")
export class BmsAutomationsSection extends BmsSection<SectionOptions["automations"]> {
  static styles = [baseStyles, css`
    .item { padding: 8px 0; }
    .item + .item { border-top: 1px solid var(--bms-border); }
    .head { display: flex; align-items: center; gap: 10px; }
    .head > ha-icon { --mdc-icon-size: 22px; color: var(--bms-muted); }
    .head.on > ha-icon { color: var(--primary-color); }
    .text { flex: 1; min-width: 0; }
    .name { font-weight: 500; display: flex; align-items: center; gap: 6px; }
    .desc { font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); }
    .controls { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0 16px; padding-left: 32px; }
    .day { width: 100%; height: 22px; display: block; margin: 4px 0 0; }
    .hours { display: flex; justify-content: space-between; font-size: 10px; color: var(--bms-muted); }
    .daywrap { padding-left: 32px; margin-top: 4px; }
  `];

  private description(item: Item): string {
    const { lang } = this.ctx;
    const t = this.t;
    switch (item) {
      case "frost":
        return t("auto.frost_desc", {
          threshold: formatNumber(this.num("frost_threshold"), lang), min: formatNumber(this.num("frost_min_heat"), lang),
        });
      case "night":
        return t("auto.night_desc", {
          start: this.num("day_start"), end: this.num("day_end"), offset: formatSigned(this.num("night_offset"), lang),
        });
      case "bypass":
        return t("auto.bypass_desc", { temp: formatNumber(this.num("letni_bypass_temp"), lang) });
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
    const day = start <= end
      ? [[start, end]]
      : [[0, end], [start, 24]];
    return html`<div class="daywrap">
      <svg class="day" viewBox="0 0 240 22" preserveAspectRatio="none" role="img"
        aria-label=${this.t("auto.day_bar", { start, end })}>
        <rect x="0" y="4" width="240" height="14" rx="4" fill="var(--bms-night)" opacity="0.35"></rect>
        ${day.map(([a, b]) => svg`<rect x=${x(a)} y="4" width=${Math.max(0, x(b) - x(a))} height="14" fill="var(--bms-warn)" opacity="0.45"></rect>`)}
        <line x1=${x(nowH)} x2=${x(nowH)} y1="0" y2="22" stroke="var(--primary-text-color)" stroke-width="2"
          vector-effect="non-scaling-stroke"></line>
      </svg>
      <div class="hours"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    </div>`;
  }

  private controls(item: Item) {
    const t = this.t;
    const n = (key: string) => html`<bms-number .ctx=${this.ctx} key=${key} label=${t(`setting.${key}`)}></bms-number>`;
    switch (item) {
      case "frost": return html`<div class="controls">${n("frost_threshold")}${n("frost_min_heat")}</div>`;
      case "night": return html`<div class="controls">${n("night_offset")}${n("day_start")}${n("day_end")}</div>`;
      case "bypass": return html`<div class="controls">${n("letni_bypass_temp")}</div>`;
    }
  }

  protected render() {
    const t = this.t;
    const full = this.options.controls === "full";
    return html`${this.options.items.map((item) => {
      const meta = META[item];
      const enabled = this.on(meta.toggle);
      const active = this.active(item);
      return html`<div class="item">
        <div class="head ${enabled ? "on" : ""}">
          <ha-icon icon=${meta.icon}></ha-icon>
          <div class="text">
            <div class="name">${t(`modes.${item}`)}
              ${active ? html`<span class="chip ${meta.tone}">${t("auto.active_now")}</span>` : nothing}</div>
            <div class="desc">${enabled ? this.description(item) : t("auto.disabled")}</div>
          </div>
          <ha-switch .checked=${enabled} ?disabled=${!this.ctx.editable} aria-label=${t(`modes.${item}`)}
            @change=${(e: Event) => this.setSetting(meta.toggle, (e.target as HTMLInputElement).checked, t(`modes.${item}`))}></ha-switch>
        </div>
        ${item === "night" && enabled && full ? this.dayBar() : nothing}
        ${full && this.ctx.editable ? this.controls(item) : nothing}
      </div>`;
    })}`;
  }
}
