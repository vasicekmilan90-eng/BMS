import { html, nothing, css } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTime } from "../i18n.js";
import { boostProgress, extendBoost, remainingMinutes } from "../logic.js";
import { baseStyles } from "../styles.js";

type Direction = "boost" | "reduction";
const ICON: Record<Direction, string> = { boost: "mdi:fire", reduction: "mdi:snowflake-thermometer" };

@customElement("bms-sec-actions")
export class BmsActionsSection extends BmsSection<SectionOptions["actions"]> {
  static styles = [baseStyles, css`
    .block + .block { margin-top: 12px; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
    .stepper { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--bms-border); border-radius: 18px; padding: 0 2px; }
    .stepper output { min-width: 64px; text-align: center; font-weight: 500; font-variant-numeric: tabular-nums; }
    .running { padding: 10px 12px; border-radius: 10px; border: 1px solid currentColor; }
    .running .head { display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px; }
    .running .head ha-icon { --mdc-icon-size: 20px; }
    .running .meta { font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); margin: 6px 0 8px; }
    .presets { display: flex; flex-wrap: wrap; gap: 8px; }
    .presets button.btn { min-width: 88px; justify-content: center; }
  `];

  @state() private chosenDir?: Direction;
  @state() private amount?: number;
  @state() private hours?: number;

  private get direction(): Direction {
    const dirs = this.options.directions;
    return this.chosenDir && dirs.includes(this.chosenDir) ? this.chosenDir : dirs[0] ?? "boost";
  }

  private get currentAmount(): number {
    return this.amount ?? (Math.abs(this.num(`${this.direction}_amount`)) || 2);
  }

  private get currentHours(): number {
    const durations = this.options.durations;
    if (this.hours !== undefined) return this.hours;
    const configured = this.num(`${this.direction}_hours`);
    return durations.includes(configured) ? configured : durations[0];
  }

  private stepAmount(delta: number): void {
    this.amount = Math.min(20, Math.max(0.5, Math.round((this.currentAmount + delta) * 2) / 2));
  }

  private start(): void {
    const service = this.direction === "boost" ? "activate_boost" : "activate_reduction";
    this.run(() => this.ctx.store.callService(service, { amount: this.currentAmount, hours: this.currentHours }));
  }

  private renderRunning(now: number) {
    const { snap, lang, canAct } = this.ctx;
    const t = this.t;
    const kind: Direction = snap.boost.effective > 0 ? "boost" : "reduction";
    const tone = kind === "boost" ? "var(--bms-heat)" : "var(--bms-info)";
    const progress = boostProgress(snap, now);
    const extended = extendBoost(snap, now, 1);
    return html`<div class="running" style="color:${tone}" role="status">
      <div class="head"><ha-icon icon=${ICON[kind]}></ha-icon>
        ${t(`actions.running_${kind}`, { value: formatSigned(snap.boost.effective, lang) })}</div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(progress * 100)}>
        <div style="width:${progress * 100}%"></div></div>
      <div class="meta">${t("actions.remaining", {
        minutes: remainingMinutes(snap, now), until: snap.boost.until ? formatTime(snap.boost.until, lang) : "—",
      })}</div>
      <div class="actions">
        <button class="btn" ?disabled=${!canAct || !extended || extended.hours >= 24}
          @click=${() => extended && this.run(() => this.ctx.store.callService(
            kind === "boost" ? "activate_boost" : "activate_reduction", extended))}>
          <ha-icon icon="mdi:plus"></ha-icon>${t("actions.extend")}</button>
        <button class="btn danger" ?disabled=${!canAct}
          @click=${() => this.run(() => this.ctx.store.callService("cancel_boost"))}>
          <ha-icon icon="mdi:stop"></ha-icon>${t("actions.cancel")}</button>
      </div>
    </div>`;
  }

  private renderTemporary() {
    const { lang, canAct } = this.ctx;
    const t = this.t;
    const now = Date.now() / 1000;
    if (this.snap.boost.effective) return this.renderRunning(now);
    const dirs = this.options.directions;
    const dir = this.direction;
    const sign = dir === "boost" ? 1 : -1;
    return html`
      ${dirs.length > 1 ? html`<div class="line"><div class="seg" role="group" aria-label=${t("actions.direction")}>
        ${dirs.map((d) => html`<button aria-pressed=${d === dir} @click=${() => { this.chosenDir = d; this.amount = undefined; this.hours = undefined; }}>
          <ha-icon icon=${ICON[d]}></ha-icon>${t(`actions.${d}`)}</button>`)}
      </div></div>` : nothing}
      <div class="line">
        <div class="stepper" role="group" aria-label=${t("actions.amount")}>
          <button class="icon-btn" aria-label=${t("actions.less")} ?disabled=${this.currentAmount <= 0.5}
            @click=${() => this.stepAmount(-0.5)}><ha-icon icon="mdi:minus"></ha-icon></button>
          <output>${formatSigned(sign * this.currentAmount, lang)} °C</output>
          <button class="icon-btn" aria-label=${t("actions.more")} ?disabled=${this.currentAmount >= 20}
            @click=${() => this.stepAmount(0.5)}><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
        <div class="seg" role="group" aria-label=${t("actions.duration")}>
          ${this.options.durations.map((h) => html`<button aria-pressed=${h === this.currentHours} @click=${() => (this.hours = h)}>
            ${t("actions.hours", { hours: formatNumber(h, lang, h % 1 ? 1 : 0) })}</button>`)}
        </div>
        <span class="spacer"></span>
        <button class="btn primary" ?disabled=${!canAct} @click=${() => this.start()}>
          <ha-icon icon=${ICON[dir]}></ha-icon>${t(`actions.start_${dir}`)}</button>
      </div>`;
  }

  private renderProfiles() {
    const { snap, canAct } = this.ctx;
    const configured = this.options.profiles;
    const source = configured.length ? configured : snap.starred.length ? snap.starred : snap.system_profiles;
    const names = source.filter((n) => snap.profiles.includes(n));
    if (!names.length) return html`<div class="empty">${this.t("quick.empty")}</div>`;
    return html`<div class="presets" role="group" aria-label=${this.t("actions.profiles")}>
      ${names.map((name) => {
        const active = snap.active_profile === name;
        return html`<button class="btn ${active ? "active" : ""}" aria-pressed=${active} ?disabled=${!canAct}
          @click=${() => this.run(() => this.ctx.store.callService("load_profile", { name }), this.t("profiles.loaded", { name }))}>
          <ha-icon icon=${active ? "mdi:check" : "mdi:bookmark-outline"}></ha-icon>${name}${active && snap.profile_modified ? " *" : ""}</button>`;
      })}
    </div>`;
  }

  protected render() {
    const show = this.options.show;
    return html`
      ${show.includes("temporary") && this.options.directions.length ? html`<div class="block">${this.renderTemporary()}</div>` : nothing}
      ${show.includes("profiles") ? html`<div class="block">${this.renderProfiles()}</div>` : nothing}
    `;
  }
}
