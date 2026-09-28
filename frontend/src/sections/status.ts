import { html, nothing, css } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import { formatSigned, formatTemp, formatNumber } from "../i18n.js";
import { alerts, corrections, regulationState, remainingMinutes } from "../logic.js";
import { baseStyles } from "../styles.js";

const STATE_TONE: Record<string, string> = {
  inactive: "var(--bms-muted)", boost: "var(--bms-heat)", reduction: "var(--bms-info)", frost: "var(--bms-frost)",
  night: "var(--bms-night)", bypass: "var(--bms-warn)", safe: "var(--bms-warn)", active: "var(--bms-ok)",
};
const ALERT_ICON = { info: "mdi:information-outline", warning: "mdi:alert-outline", error: "mdi:alert-circle-outline" };

@customElement("bms-sec-status")
export class BmsStatusSection extends BmsSection {
  static styles = [baseStyles, css`
    .bar { height: 4px; border-radius: 2px; margin: -4px 0 12px; transition: background 0.3s; }
    .top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .title { font-size: var(--ha-font-size-l, 16px); font-weight: 500; flex: 1; min-width: 140px; }
    .hero { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 10px 0; }
    .result { cursor: pointer; border: none; background: none; padding: 0; color: inherit; text-align: left; font: inherit; }
    .result .value { font-size: 40px; font-weight: 300; line-height: 1; letter-spacing: -1px; }
    .result .caption { font-size: var(--ha-font-size-xs, 11px); text-transform: uppercase; letter-spacing: 0.06em; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px 16px; flex: 1; }
    .fact .v { font-weight: 500; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  `];

  private async refresh(): Promise<void> {
    await this.run(() => this.ctx.store.callService("force_refresh"), this.t("status.refreshed"));
  }

  protected render() {
    const { snap, lang, config } = this.ctx;
    const t = this.t;
    const r = snap.result;
    const state = regulationState(snap);
    const now = Date.now() / 1000;
    const remaining = remainingMinutes(snap, now);
    const write = snap.last_write;
    const source = t(`source.${snap.temp_source}`);

    return html`
      <div class="bar" style="background:${STATE_TONE[state]}" role="presentation"></div>
      <div class="top">
        <div class="title">${config.title ?? t("card.title")}</div>
        ${snap.active_profile !== snap.profiles[0]
          ? html`<span class="chip ok"><ha-icon icon="mdi:bookmark-outline"></ha-icon>${snap.active_profile}</span>`
          : nothing}
        <span class="chip" style="color:${STATE_TONE[state]}">${t(`state.${state}`)}</span>
        <ha-switch
          .checked=${Boolean(snap.settings.hlavni_vypinac)}
          ?disabled=${!this.ctx.editable}
          aria-label=${t("status.main_switch")}
          title=${t("status.main_switch_hint")}
          @change=${(e: Event) => this.setSetting("hlavni_vypinac", (e.target as HTMLInputElement).checked)}
        ></ha-switch>
        ${this.ctx.canAct
          ? html`<button class="btn" @click=${() => this.refresh()} title=${t("status.refresh_hint")}>
              <ha-icon icon="mdi:refresh"></ha-icon>${t("status.refresh")}
            </button>`
          : nothing}
      </div>

      <div class="hero">
        <button class="result" style="color:${STATE_TONE[state]}" @click=${() => this.moreInfo("sensor.calc_temp")}
          aria-label=${t("status.result")}>
          <div class="caption">${t("status.result")}</div>
          <div class="value">${formatTemp(r?.result, lang)}</div>
        </button>
        ${config.compact ? nothing : html`
          <div class="facts small">
            <div class="fact"><div class="muted">${t("status.curve")}</div><div class="v">${formatTemp(r?.curve_temp, lang)}</div></div>
            <div class="fact"><div class="muted">${t("status.correction")}</div><div class="v">${formatSigned(r?.total_correction, lang)} °C</div></div>
            <div class="fact"><div class="muted">${t("status.outdoor")}</div>
              <div class="v">${formatTemp(snap.values.raw_outdoor_temp, lang)} <span class="muted">(${source})</span></div></div>
            <div class="fact"><div class="muted">${t("status.limits")}</div>
              <div class="v">${formatNumber(r?.t_min, lang)} – ${formatNumber(r?.t_max, lang)} °C</div></div>
            <div class="fact"><div class="muted">${t("status.thermostat")}</div>
              <div class="v">${write.status
                ? html`${write.value !== null && write.value !== undefined ? formatTemp(write.value, lang) : "—"}
                  <span class="muted">${t(`log.thermostat.${write.status}`)} ${write.time ?? ""}</span>`
                : t("status.not_written")}</div></div>
          </div>`}
      </div>

      <div class="chips">
        ${corrections(snap).map((c) => html`<span class="chip ${c.value > 0 ? "boost" : "info"}">
          ${t(`corr.${c.key}`)} ${formatSigned(c.value, lang)} °C</span>`)}
        ${r?.clamped ? html`<span class="chip warn">${t("status.clamped")}</span>` : nothing}
        ${remaining ? html`<span class="chip ${state}">${t("status.boost_remaining", { minutes: remaining })}</span>` : nothing}
      </div>

      ${config.compact ? nothing : alerts(snap, t, now).map((a) => html`
        <div class="alert ${a.level}" role=${a.level === "error" ? "alert" : "status"}>
          <ha-icon icon=${ALERT_ICON[a.level]}></ha-icon><span>${a.text}</span>
        </div>`)}
    `;
  }
}
