import { html, nothing, css, svg } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTemp, formatTime } from "../i18n.js";
import { alerts, breakdown, corrections, regulationState, relativeTime, remainingMinutes } from "../logic.js";
import { baseStyles } from "../styles.js";
import type { ChartPoint } from "../types.js";

export const STATE_TONE: Record<string, string> = {
  inactive: "var(--bms-muted)", boost: "var(--bms-heat)", reduction: "var(--bms-info)", frost: "var(--bms-frost)",
  night: "var(--bms-night)", bypass: "var(--bms-warn)", safe: "var(--bms-warn)", active: "var(--bms-ok)",
};
const ALERT_ICON = { info: "mdi:information-outline", warning: "mdi:alert-outline", error: "mdi:alert-circle-outline" };
const EVENT_ICON: Record<string, string> = {
  recalc: "mdi:timer-refresh-outline", boost_end: "mdi:timer-sand-complete", day_start: "mdi:weather-sunset-up",
  night_start: "mdi:weather-night", schedule: "mdi:calendar-clock",
};

@customElement("bms-sec-status")
export class BmsStatusSection extends BmsSection<SectionOptions["status"]> {
  static styles = [baseStyles, css`
    .bar { height: 4px; border-radius: 2px; margin: -4px 0 12px; transition: background 0.3s; }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .title { font-size: var(--ha-font-size-l, 16px); font-weight: 500; flex: 1; min-width: 120px; }
    .switch { display: inline-flex; align-items: center; gap: 8px; padding: 4px 4px 4px 12px; border-radius: 18px;
      border: 1px solid var(--bms-border); font-size: var(--ha-font-size-s, 13px); }
    .switch.off { border-color: var(--bms-warn); color: var(--bms-warn); }
    .hero { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 10px 0 8px; }
    .result { cursor: pointer; border: none; background: none; padding: 0; color: inherit; text-align: left; font: inherit; }
    .result .value { font-size: 40px; font-weight: 300; line-height: 1; letter-spacing: -1px; }
    .result .caption { font-size: var(--ha-font-size-xs, 11px); text-transform: uppercase; letter-spacing: 0.06em; }
    .thermo { font-size: var(--ha-font-size-s, 13px); }
    .thermo b { font-weight: 500; }
    .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 4px 0 8px; }
    .flow .arrow { color: var(--bms-muted); font-size: 12px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px 16px; margin-bottom: 8px; }
    .fact .v { font-weight: 500; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .trend { width: 100%; height: 56px; display: block; margin: 4px 0 8px; }
    .legend { display: flex; gap: 12px; font-size: var(--ha-font-size-xs, 11px); color: var(--bms-muted); }
    .legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
    .next { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); }
    .next span { display: inline-flex; align-items: center; gap: 4px; }
    .next ha-icon { --mdc-icon-size: 16px; }
  `];

  private has(item: SectionOptions["status"]["show"][number]): boolean {
    return this.options.show.includes(item);
  }

  private async refresh(): Promise<void> {
    await this.run(() => this.ctx.store.callService("force_refresh"), this.t("status.refreshed"));
  }

  private renderThermostat(now: number) {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const th = snap.thermostat;
    const write = snap.last_write;
    if (!th && !write.status) return html`<div class="thermo muted">${t("status.not_written")}</div>`;
    const target = th?.target ?? write.value ?? null;
    const when = write.ts ? relativeTime(write.ts, now, lang) : null;
    return html`<button class="result thermo" ?disabled=${!th} aria-label=${t("status.thermostat")}
      @click=${() => th && this.moreInfoEntity(th.entity_id)}>
      <span class="muted">${t("status.on_thermostat")}</span> <b>${formatTemp(target, lang)}</b>
      ${th?.state === "off" ? html`<span class="chip warn">${t("log.thermostat.off")}</span>` : nothing}
      ${write.status && write.status !== "ok" && write.status !== "unchanged" && th?.state !== "off"
        ? html`<span class="chip warn">${t(`log.thermostat.${write.status}`)}</span>` : nothing}
      ${when ? html`<span class="muted small">· ${t("status.written", { when })}</span>` : nothing}
    </button>`;
  }

  private renderBreakdown() {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const steps = breakdown(snap.result);
    if (!steps.length) return nothing;
    return html`<div class="flow" aria-label=${t("status.breakdown")}>
      ${steps.map((s, i) => html`
        ${i ? html`<span class="arrow" aria-hidden="true">→</span>` : nothing}
        <span class="chip ${s.kind === "result" ? "ok" : s.kind.startsWith("limit") ? "warn" : s.kind === "correction" ? (s.value > 0 ? "boost" : "info") : ""}"
          title=${s.kind === "correction" ? corrections(snap).map((c) => `${t(`corr.${c.key}`)} ${formatSigned(c.value, lang)} °C`).join(", ") : ""}>
          ${t(`breakdown.${s.kind}`)} ${s.kind === "correction" ? formatSigned(s.value, lang) : formatNumber(s.value, lang)} °C
        </span>`)}
    </div>`;
  }

  private renderTrend(now: number) {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const pts = snap.history.filter((p) => p.ts >= now - 24 * 3600);
    if (pts.length < 2) return nothing;
    const x0 = now - 24 * 3600;
    const line = (key: keyof ChartPoint) => {
      const vals = pts.filter((p) => typeof p[key] === "number") as (ChartPoint & Record<string, number>)[];
      if (vals.length < 2) return { d: "", min: Number.NaN, max: Number.NaN };
      const ys = vals.map((p) => Number(p[key]));
      const min = Math.min(...ys);
      const max = Math.max(...ys);
      const span = max - min || 1;
      const d = vals.map((p, i) => `${i ? "L" : "M"}${(((p.ts - x0) / (24 * 3600)) * 300).toFixed(1)},${(52 - ((Number(p[key]) - min) / span) * 48).toFixed(1)}`).join(" ");
      return { d, min, max };
    };
    const res = line("result");
    const out = line("out");
    return html`
      <svg class="trend" viewBox="0 0 300 56" preserveAspectRatio="none" role="img"
        aria-label=${t("status.trend_label", { min: formatNumber(res.min, lang), max: formatNumber(res.max, lang) })}>
        ${out.d ? svg`<path d=${out.d} fill="none" stroke="var(--bms-info)" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"></path>` : nothing}
        ${res.d ? svg`<path d=${res.d} fill="none" stroke="var(--bms-heat)" stroke-width="2" vector-effect="non-scaling-stroke"></path>` : nothing}
      </svg>
      <div class="legend">
        <span><i style="background:var(--bms-heat)"></i>${t("status.trend_result")} ${formatNumber(res.min, lang)}–${formatNumber(res.max, lang)} °C</span>
        <span><i style="background:var(--bms-info)"></i>${t("status.outdoor")} ${formatNumber(out.min, lang)}–${formatNumber(out.max, lang)} °C</span>
        <span class="spacer"></span><span>${t("status.trend_24h")}</span>
      </div>`;
  }

  private renderNext(now: number) {
    const { snap, lang } = this.ctx;
    const events = snap.next_events.slice(0, 3);
    if (!events.length) return nothing;
    return html`<div class="next" aria-label=${this.t("status.next")}>
      ${events.map((e) => html`<span><ha-icon icon=${EVENT_ICON[e.kind] ?? "mdi:clock-outline"}></ha-icon>
        ${this.t(`next.${e.kind}`, { profile: e.profile ?? "" })}
        <b>${e.ts - now < 86_400 ? formatTime(e.ts, lang) : relativeTime(e.ts, now, lang)}</b></span>`)}
    </div>`;
  }

  protected render() {
    const { snap, lang, config } = this.ctx;
    const t = this.t;
    const r = snap.result;
    const state = regulationState(snap);
    const now = Date.now() / 1000;
    const remaining = remainingMinutes(snap, now);
    const on = Boolean(snap.settings.hlavni_vypinac);
    const compact = config.compact;

    return html`
      <div class="bar" style="background:${STATE_TONE[state]}" role="presentation"></div>
      ${this.has("alerts") ? alerts(snap, t, now).map((a) => html`
        <div class="alert ${a.level}" role=${a.level === "error" ? "alert" : "status"}>
          <ha-icon icon=${ALERT_ICON[a.level]}></ha-icon><span>${a.text}</span>
        </div>`) : nothing}
      <div class="top">
        <div class="title">${config.title ?? t("card.title")}</div>
        <span class="chip ${snap.profile_modified ? "warn" : "ok"}" title=${snap.profile_modified ? t("profiles.modified_hint") : ""}>
          <ha-icon icon="mdi:bookmark-outline"></ha-icon>${snap.active_profile}${snap.profile_modified ? " *" : ""}</span>
        <span class="chip" style="color:${STATE_TONE[state]}">${t(`state.${state}`)}</span>
        ${this.has("refresh") && this.ctx.canAct
          ? html`<button class="icon-btn" @click=${() => this.refresh()} title=${t("status.refresh_hint")} aria-label=${t("status.refresh")}>
              <ha-icon icon="mdi:refresh"></ha-icon></button>`
          : nothing}
      </div>
      ${this.has("main_switch") ? html`<div style="margin-top:8px">
        <label class="switch ${on ? "" : "off"}" title=${t("status.main_switch_hint")}>
          ${on ? t("status.regulating") : t("status.only_calculating")}
          <ha-switch .checked=${on} ?disabled=${!this.ctx.editable} aria-label=${t("status.main_switch")}
            @change=${(e: Event) => this.setSetting("hlavni_vypinac", (e.target as HTMLInputElement).checked, t("status.main_switch"))}></ha-switch>
        </label></div>` : nothing}

      <div class="hero">
        ${this.has("result") ? html`<button class="result" style="color:${STATE_TONE[state]}"
          @click=${() => this.moreInfo("sensor.calc_temp")} aria-label=${t("status.result")}>
          <div class="caption">${t("status.result")}</div>
          <div class="value">${formatTemp(r?.result, lang)}</div>
        </button>` : nothing}
        ${this.has("thermostat") ? this.renderThermostat(now) : nothing}
      </div>

      ${this.has("breakdown") ? this.renderBreakdown() : nothing}

      ${remaining ? html`<div class="chips"><span class="chip ${state}">${t("status.boost_remaining", { minutes: remaining })}</span></div>` : nothing}

      ${this.has("facts") && !compact ? html`<div class="facts small">
        <div class="fact"><div class="muted">${t("status.outdoor")}</div>
          <div class="v">${formatTemp(snap.values.raw_outdoor_temp, lang)} <span class="muted">(${t(`source.${snap.temp_source}`)})</span></div></div>
        <div class="fact"><div class="muted">${t("status.limits")}</div>
          <div class="v">${formatNumber(r?.t_min, lang)} – ${formatNumber(r?.t_max, lang)} °C</div></div>
        ${snap.thermostat?.current !== null && snap.thermostat?.current !== undefined ? html`
          <div class="fact"><div class="muted">${t("status.thermostat_current")}</div>
            <div class="v">${formatTemp(snap.thermostat.current, lang)}</div></div>` : nothing}
      </div>` : nothing}

      ${this.has("trend") && !compact ? this.renderTrend(now) : nothing}
      ${this.has("next") ? this.renderNext(now) : nothing}
    `;
  }
}
