import { html, nothing, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTemp, formatTime } from "../i18n.js";
import {
  alerts, corrections, reasonSentence, regulationState, relativeTime, userEvents, weatherCorrection,
} from "../logic.js";
import { baseStyles } from "../styles.js";
import type { ChartPoint } from "../types.js";

export const STATE_TONE: Record<string, string> = {
  inactive: "var(--bms-muted)", boost: "var(--bms-heat)", reduction: "var(--bms-cool)", frost: "var(--bms-frost)",
  night: "var(--bms-night)", bypass: "var(--bms-muted)", safe: "var(--bms-warn)", active: "var(--bms-ok)",
};
const ALERT_ICON = { info: "mdi:information-outline", warning: "mdi:alert-outline", error: "mdi:alert-circle-outline" };
const EVENT_ICON: Record<string, string> = {
  boost_end: "mdi:timer-sand-complete", day_start: "mdi:weather-sunset-up", night_start: "mdi:weather-night",
  schedule: "mdi:calendar-clock",
};

@customElement("bms-sec-status")
export class BmsStatusSection extends BmsSection<SectionOptions["status"]> {
  static styles = [baseStyles, css`
    .head { display: flex; align-items: center; gap: 10px; min-height: 40px; }
    .title { font-size: var(--ha-font-size-l, 16px); font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .state { display: inline-flex; align-items: center; gap: 6px; font-size: var(--ha-font-size-s, 13px); font-weight: 500; white-space: nowrap; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .hero { display: flex; align-items: baseline; gap: 14px; margin: 8px 0 2px; flex-wrap: wrap; }
    .result { cursor: pointer; border: none; background: none; padding: 0; color: inherit; font: inherit; text-align: left; }
    .result:focus-visible { outline: 2px solid var(--primary-color); border-radius: 6px; }
    .big { font-size: 46px; font-weight: 300; letter-spacing: -1.5px; line-height: 1; }
    .big small { font-size: 22px; letter-spacing: 0; }
    .therm { font-size: var(--ha-font-size-s, 13px); color: var(--bms-muted); line-height: 1.5; }
    .therm b { color: var(--primary-text-color); font-weight: 500; }
    .reason { margin-top: 8px; font-size: var(--ha-font-size-s, 13px); display: flex; gap: 4px 8px; align-items: center; flex-wrap: wrap; }
    .limit { color: var(--bms-warn); }
    .why { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: var(--bms-surface); font-size: var(--ha-font-size-s, 13px); }
    .why table { width: 100%; border-collapse: collapse; }
    .why td { padding: 3px 0; }
    .why td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .why tr.sub td { color: var(--bms-muted); padding-left: 14px; font-size: var(--ha-font-size-xs, 12px); }
    .why tr.total td { border-top: 1px solid var(--bms-border); font-weight: 500; padding-top: 6px; }
    .why tr.clamp td { color: var(--bms-warn); }
    .events { display: flex; gap: 6px 16px; margin-top: 12px; font-size: var(--ha-font-size-s, 13px); color: var(--bms-muted); flex-wrap: wrap; }
    .events span { display: inline-flex; gap: 6px; align-items: center; }
    .events ha-icon { --mdc-icon-size: 17px; }
    .events b { color: var(--primary-text-color); font-weight: 500; }
    .trend { width: 100%; height: 48px; display: block; margin-top: 10px; }
  `];

  @state() private whyOpen = false;

  private has(item: SectionOptions["status"]["show"][number]): boolean {
    return this.options.show.includes(item);
  }

  private async toggleMain(e: Event): Promise<void> {
    const target = e.target as HTMLInputElement;
    const t = this.t;
    if (!target.checked) {
      const target_ = this.snap.thermostat?.target ?? this.snap.last_write.value;
      const ok = await this.confirm(t("status.off_title"), t("status.off_text", {
        value: target_ !== null && target_ !== undefined ? formatTemp(target_, this.ctx.lang) : "—",
      }), t("status.off_confirm"), true);
      if (!ok) {
        target.checked = true;
        return;
      }
    }
    if (!(await this.setSetting("hlavni_vypinac", target.checked, t("status.main_switch")))) target.checked = !target.checked;
  }

  private renderThermostat(now: number) {
    const { snap, lang, config } = this.ctx;
    const t = this.t;
    const th = snap.thermostat;
    const write = snap.last_write;
    const target = th?.target ?? write.value ?? null;
    const problem = th?.state === "off" ? "off"
      : write.status && !["ok", "unchanged"].includes(write.status) ? write.status : undefined;
    return html`<span class="therm">
      ${th || write.status ? html`${t("status.on_thermostat")} <b>${formatTemp(target, lang, 0)}</b>
        ${write.ts ? html` · ${relativeTime(write.ts, now, lang)}` : nothing}
        ${problem ? html` <span class="badge warn">${t(`log.thermostat.${problem}`)}</span>` : nothing}`
        : t("status.not_written")}
      ${this.has("facts") && !config.compact ? html`<br />${t("status.outdoor")} <b>${formatTemp(snap.values.raw_outdoor_temp, lang)}</b>
        (${t(`source.${snap.temp_source}`)})` : nothing}
    </span>`;
  }

  private renderWhy() {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const r = snap.result;
    if (!r) return nothing;
    const weather = weatherCorrection(r);
    const weatherParts = corrections(snap).filter((c) => c.key !== "night" && c.key !== "boost");
    const row = (label: string, value: string, cls = "") => html`<tr class=${cls}><td>${label}</td><td>${value}</td></tr>`;
    return html`<div class="why"><table>
      ${r.safe_mode
        ? row(t("why.safe"), formatTemp(r.raw, lang))
        : row(t("why.curve", { out: formatNumber(snap.values.applied_out_temp, lang) }), formatTemp(r.curve_temp, lang))}
      ${!r.safe_mode && Math.abs(weather) >= 0.05 ? html`
        ${row(t("why.weather"), `${formatSigned(weather, lang)} °C`)}
        ${weatherParts.map((c) => row(t(`corr.${c.key}`).toLowerCase(), formatSigned(c.value, lang), "sub"))}` : nothing}
      ${Math.abs(r.night_offset) >= 0.05 ? row(t("why.night"), `${formatSigned(r.night_offset, lang)} °C`) : nothing}
      ${Math.abs(r.boost) >= 0.05 ? row(t(r.boost > 0 ? "why.boost" : "why.reduction"), `${formatSigned(r.boost, lang)} °C`) : nothing}
      ${r.clamped ? html`
        ${row(t("why.raw"), formatTemp(r.raw, lang))}
        ${row(t(r.raw > r.result ? "why.limit_max" : "why.limit_min"), formatTemp(r.result, lang), "clamp")}` : nothing}
      ${r.frost_active ? row(t("why.frost"), formatTemp(r.t_min, lang), "sub") : nothing}
      ${row(t("why.result"), formatTemp(r.result, lang), "total")}
    </table></div>`;
  }

  private renderTrend(now: number) {
    const { snap, lang } = this.ctx;
    const pts = snap.history.filter((p) => p.ts >= now - 24 * 3600 && typeof p.result === "number");
    if (pts.length < 2) return nothing;
    const ys = pts.map((p) => Number(p.result));
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const span = max - min || 1;
    const x0 = now - 24 * 3600;
    const d = pts.map((p: ChartPoint, i) =>
      `${i ? "L" : "M"}${(((p.ts - x0) / 86_400) * 300).toFixed(1)},${(44 - ((Number(p.result) - min) / span) * 40).toFixed(1)}`).join(" ");
    return html`<svg class="trend" viewBox="0 0 300 48" preserveAspectRatio="none" role="img"
      aria-label=${this.t("status.trend_label", { min: formatNumber(min, lang), max: formatNumber(max, lang) })}>
      ${svg`<path d=${d} fill="none" stroke="var(--bms-heat)" stroke-width="2" vector-effect="non-scaling-stroke"></path>`}
    </svg>`;
  }

  protected render() {
    const { snap, lang, config } = this.ctx;
    const t = this.t;
    const r = snap.result;
    const st = regulationState(snap);
    const now = Date.now() / 1000;
    const on = Boolean(snap.settings.hlavni_vypinac);
    const reason = reasonSentence(snap, t, lang);
    const events = userEvents(snap);

    return html`
      ${this.has("alerts") ? alerts(snap, t, now).map((a) => html`
        <div class="alert ${a.level}" role=${a.level === "error" ? "alert" : "status"}>
          <ha-icon icon=${ALERT_ICON[a.level]}></ha-icon>
          <span>${a.text}
            ${a.target ? html` <button class="link" @click=${() => this.showSection(a.target!)}>${t(`alert.show_${a.target}`)}</button>` : nothing}
          </span>
        </div>`) : nothing}
      <div class="head">
        <span class="title">${config.title ?? t("card.title")}</span>
        <span class="state" style="color:${STATE_TONE[st]}"><span class="dot"></span>${t(`state.${st}`)}</span>
        <span class="spacer"></span>
        ${this.has("refresh") && this.ctx.canAct ? html`<button class="icon-btn" title=${t("status.refresh_hint")}
          aria-label=${t("status.refresh")}
          @click=${() => this.run(() => this.ctx.store.callService("force_refresh"), t("status.refreshed"))}>
          <ha-icon icon="mdi:refresh"></ha-icon></button>` : nothing}
        ${this.has("main_switch") ? html`<ha-switch .checked=${on} ?disabled=${!this.ctx.editable}
          aria-label=${t("status.main_switch")} title=${t("status.main_switch_hint")}
          @change=${(e: Event) => this.toggleMain(e)}></ha-switch>` : nothing}
      </div>
      <div class="hero">
        ${this.has("result") ? html`<button class="result" style="color:${st === "boost" || st === "reduction" ? STATE_TONE[st] : "inherit"}"
          @click=${() => this.moreInfo("sensor.calc_temp")} aria-label=${t("status.result")}>
          <span class="big">${formatNumber(r?.result, lang)}<small> °C</small></span></button>` : nothing}
        ${this.has("thermostat") ? this.renderThermostat(now) : nothing}
      </div>
      ${this.has("breakdown") && r ? html`<div class="reason">
        <span>${reason.text}${reason.limit ? html` · <span class="limit">${reason.limit}</span>` : nothing}</span>
        <button class="link" aria-expanded=${this.whyOpen} @click=${() => (this.whyOpen = !this.whyOpen)}>
          ${t("status.why")}<ha-icon icon=${this.whyOpen ? "mdi:chevron-up" : "mdi:chevron-right"}></ha-icon></button>
      </div>
      ${this.whyOpen ? this.renderWhy() : nothing}` : nothing}
      ${this.has("trend") && !config.compact ? this.renderTrend(now) : nothing}
      ${this.has("next") && events.length ? html`<div class="events" aria-label=${t("status.next")}>
        ${events.map((e) => html`<span><ha-icon icon=${EVENT_ICON[e.kind] ?? "mdi:clock-outline"}></ha-icon>
          ${t(`next.${e.kind}`, { profile: e.profile ?? "" })}
          <b>${e.ts - now < 86_400 ? formatTime(e.ts, lang) : new Intl.DateTimeFormat(lang, { day: "numeric", month: "numeric" }).format(new Date(e.ts * 1000))}</b></span>`)}
      </div>` : nothing}
    `;
  }
}
