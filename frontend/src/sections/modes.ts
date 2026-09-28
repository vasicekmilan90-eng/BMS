import { html, nothing, css } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { ModeId } from "../config.js";
import { remainingMinutes } from "../logic.js";
import { baseStyles } from "../styles.js";

const ICONS: Record<ModeId, string> = {
  boost: "mdi:fire", reduction: "mdi:snowflake-thermometer", frost: "mdi:snowflake-alert",
  night: "mdi:weather-night", bypass: "mdi:weather-sunny-off",
};

@customElement("bms-sec-modes")
export class BmsModesSection extends BmsSection {
  static styles = [baseStyles, css`:host { --bms-col: 210px; }`];

  private boostTile(kind: "boost" | "reduction") {
    const { snap, canAct } = this.ctx;
    const t = this.t;
    const active = kind === "boost" ? snap.boost.effective > 0 : snap.boost.effective < 0;
    const other = kind === "boost" ? snap.boost.effective < 0 : snap.boost.effective > 0;
    const remaining = active ? remainingMinutes(snap, Date.now() / 1000) : 0;
    return html`
      <bms-number .ctx=${this.ctx} key="${kind}_amount" label=${t(`setting.${kind}_amount`)}></bms-number>
      <bms-number .ctx=${this.ctx} key="${kind}_hours" label=${t(`setting.${kind}_hours`)}></bms-number>
      <div class="actions">
        ${active
          ? html`<span class="chip ${kind}">${t("status.boost_remaining", { minutes: remaining })}</span>
              <button class="btn danger" ?disabled=${!canAct}
                @click=${() => this.run(() => this.ctx.store.callService("cancel_boost"))}>${t("modes.cancel")}</button>`
          : html`<button class="btn primary" ?disabled=${!canAct || other}
              @click=${() => this.run(() => this.ctx.store.callService(kind === "boost" ? "activate_boost" : "activate_reduction"))}>
              ${t(`modes.start_${kind}`)}</button>`}
      </div>`;
  }

  private tileBody(mode: ModeId) {
    const t = this.t;
    const r = this.snap.result;
    switch (mode) {
      case "boost":
      case "reduction":
        return this.boostTile(mode);
      case "frost":
        return html`
          <bms-toggle .ctx=${this.ctx} key="frost_protection" label=${t("modes.enabled")}></bms-toggle>
          <bms-number .ctx=${this.ctx} key="frost_threshold" label=${t("setting.frost_threshold")}></bms-number>
          <bms-number .ctx=${this.ctx} key="frost_min_heat" label=${t("setting.frost_min_heat")}></bms-number>
          ${r?.frost_active ? html`<span class="chip frost">${t("state.frost")}</span>` : nothing}`;
      case "night":
        return html`
          <bms-toggle .ctx=${this.ctx} key="night_mode" label=${t("modes.enabled")}></bms-toggle>
          <bms-number .ctx=${this.ctx} key="night_offset" label=${t("setting.night_offset")}></bms-number>
          <bms-number .ctx=${this.ctx} key="day_start" label=${t("setting.day_start")}></bms-number>
          <bms-number .ctx=${this.ctx} key="day_end" label=${t("setting.day_end")}></bms-number>
          ${r?.night_active ? html`<span class="chip night">${t("state.night")}</span>` : nothing}`;
      case "bypass":
        return html`
          <bms-toggle .ctx=${this.ctx} key="letni_bypass" label=${t("modes.enabled")}></bms-toggle>
          <bms-number .ctx=${this.ctx} key="letni_bypass_temp" label=${t("setting.letni_bypass_temp")}></bms-number>
          ${r?.bypass_active ? html`<span class="chip warn">${t("state.bypass")}</span>` : nothing}`;
    }
  }

  protected render() {
    return html`<div class="grid">
      ${this.ctx.config.modes.map((mode) => html`
        <div class="tile">
          <div class="tile-title"><ha-icon icon=${ICONS[mode]}></ha-icon>${this.t(`modes.${mode}`)}</div>
          ${this.tileBody(mode)}
        </div>`)}
    </div>`;
  }
}
