import { html, nothing, css } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTime } from "../i18n.js";
import { boostProgress, extendBoost, formatDuration, remainingMinutes } from "../logic.js";
import { baseStyles } from "../styles.js";

type Direction = "boost" | "reduction";
const ICON: Record<Direction, string> = { boost: "mdi:fire", reduction: "mdi:snowflake-thermometer" };
const TONE: Record<Direction, string> = { boost: "var(--bms-heat)", reduction: "var(--bms-cool)" };
const LONG_PRESS_MS = 500;

@customElement("bms-sec-actions")
export class BmsActionsSection extends BmsSection<SectionOptions["actions"]> {
  static styles = [baseStyles, css`
    .block + .block { margin-top: 12px; }
    .big { display: grid; grid-template-columns: repeat(var(--n, 2), minmax(0, 1fr)) auto; gap: 10px; align-items: stretch; }
    .cbtn {
      border: none; cursor: pointer; font: inherit; color: var(--primary-text-color); text-align: left;
      border-radius: 14px; padding: 12px; background: var(--bms-surface-2); min-height: 64px;
      display: flex; flex-direction: column; justify-content: center; gap: 2px; user-select: none; -webkit-user-select: none;
    }
    .cbtn:hover:not(:disabled) { background: color-mix(in srgb, var(--tone) 12%, var(--bms-surface-2)); }
    .cbtn:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .cbtn:disabled { opacity: 0.45; cursor: default; }
    .cbtn .l1 { display: flex; gap: 8px; align-items: center; font-weight: 500; }
    .cbtn .l1 ha-icon { color: var(--tone); --mdc-icon-size: 20px; }
    .cbtn .l2 { font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); padding-left: 28px; }
    .big .icon-btn { align-self: center; }
    .custom { margin-top: 10px; padding: 12px; border-radius: 14px; background: var(--bms-surface); display: flex; flex-direction: column; gap: 10px; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .stepper { display: inline-flex; align-items: center; gap: 2px; background: var(--bms-surface-2); border-radius: 20px; }
    .stepper output { min-width: 72px; text-align: center; font-weight: 500; font-variant-numeric: tabular-nums; }
    .running { border-radius: 14px; padding: 12px 14px; background: color-mix(in srgb, var(--tone) 13%, transparent); }
    .running .l1 { display: flex; gap: 8px; align-items: center; font-weight: 500; color: var(--tone); }
    .running .progress { margin: 10px 0 6px; color: var(--tone); }
    .running .actions { margin-top: 10px; }
  `];

  @state() private customOpen = false;
  @state() private chosenDir?: Direction;
  @state() private amount?: number;
  @state() private hours?: number;
  private pressTimer?: number;
  private longPressed = false;

  private get direction(): Direction {
    const dirs = this.options.directions;
    return this.chosenDir && dirs.includes(this.chosenDir) ? this.chosenDir : dirs[0] ?? "boost";
  }

  private defaults(dir: Direction): { amount: number; hours: number } {
    return { amount: Math.abs(this.num(`${dir}_amount`)) || 2, hours: this.num(`${dir}_hours`) || 2 };
  }

  private get currentAmount(): number {
    return this.amount ?? this.defaults(this.direction).amount;
  }

  private get currentHours(): number {
    return this.hours ?? this.defaults(this.direction).hours;
  }

  private start(dir: Direction, amount: number, hours: number): void {
    const service = dir === "boost" ? "activate_boost" : "activate_reduction";
    this.run(() => this.ctx.store.callService(service, { amount, hours }));
    this.customOpen = false;
  }

  private openCustom(dir: Direction): void {
    this.chosenDir = dir;
    this.amount = undefined;
    this.hours = undefined;
    this.customOpen = true;
  }

  private pressStart(dir: Direction): void {
    this.longPressed = false;
    window.clearTimeout(this.pressTimer);
    this.pressTimer = window.setTimeout(() => {
      this.longPressed = true;
      this.openCustom(dir);
    }, LONG_PRESS_MS);
  }

  private pressEnd(): void {
    window.clearTimeout(this.pressTimer);
  }

  private onBigClick(dir: Direction): void {
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    const d = this.defaults(dir);
    this.start(dir, d.amount, d.hours);
  }

  private hoursLabel(h: number): string {
    return this.t("actions.hours", { hours: formatNumber(h, this.ctx.lang, h % 1 ? 1 : 0) });
  }

  private renderRunning(now: number) {
    const { snap, lang, canAct } = this.ctx;
    const t = this.t;
    const kind: Direction = snap.boost.effective > 0 ? "boost" : "reduction";
    const progress = boostProgress(snap, now);
    const extended = extendBoost(snap, now, 1);
    return html`<div class="running" style="--tone:${TONE[kind]}" role="status">
      <div class="l1"><ha-icon icon=${ICON[kind]}></ha-icon>
        ${t(`actions.running_${kind}`, { value: formatSigned(snap.boost.effective, lang) })}</div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(progress * 100)}>
        <div style="width:${progress * 100}%"></div></div>
      <div class="small muted">${t("actions.remaining", {
        duration: formatDuration(remainingMinutes(snap, now), t),
        until: snap.boost.until ? formatTime(snap.boost.until, lang) : "—",
      })}</div>
      <div class="actions">
        <button class="btn" ?disabled=${!canAct || !extended || extended.hours >= 24}
          @click=${() => extended && this.run(() => this.ctx.store.callService(
            kind === "boost" ? "activate_boost" : "activate_reduction", extended))}>
          <ha-icon icon="mdi:plus"></ha-icon>${t("actions.extend")}</button>
        <button class="btn" ?disabled=${!canAct} @click=${() => this.run(() => this.ctx.store.callService("cancel_boost"))}>
          <ha-icon icon="mdi:stop"></ha-icon>${t("actions.cancel")}</button>
      </div>
    </div>`;
  }

  private renderCustom() {
    const { lang, canAct } = this.ctx;
    const t = this.t;
    const dirs = this.options.directions;
    const dir = this.direction;
    const sign = dir === "boost" ? 1 : -1;
    const durations = [...new Set([...this.options.durations, this.defaults(dir).hours])].sort((a, b) => a - b);
    return html`<div class="custom" role="group" aria-label=${t("actions.custom")}>
      ${dirs.length > 1 ? html`<div class="seg" role="group" aria-label=${t("actions.direction")}>
        ${dirs.map((d) => html`<button aria-pressed=${d === dir}
          @click=${() => { this.chosenDir = d; this.amount = undefined; this.hours = undefined; }}>
          <ha-icon icon=${ICON[d]}></ha-icon>${t(`actions.${d}`)}</button>`)}
      </div>` : nothing}
      <div class="line">
        <div class="stepper" role="group" aria-label=${t("actions.amount")}>
          <button class="icon-btn" aria-label=${t("actions.less")} ?disabled=${this.currentAmount <= 0.5}
            @click=${() => (this.amount = Math.max(0.5, this.currentAmount - 0.5))}><ha-icon icon="mdi:minus"></ha-icon></button>
          <output>${formatSigned(sign * this.currentAmount, lang)} °C</output>
          <button class="icon-btn" aria-label=${t("actions.more")} ?disabled=${this.currentAmount >= 20}
            @click=${() => (this.amount = Math.min(20, this.currentAmount + 0.5))}><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
        <div class="seg" role="group" aria-label=${t("actions.duration")}>
          ${durations.map((h) => html`<button aria-pressed=${h === this.currentHours} @click=${() => (this.hours = h)}>
            ${this.hoursLabel(h)}</button>`)}
        </div>
      </div>
      <div class="actions" style="justify-content:flex-end">
        <button class="btn text" @click=${() => (this.customOpen = false)}>${t("common.cancel")}</button>
        <button class="btn primary" ?disabled=${!canAct} @click=${() => this.start(dir, this.currentAmount, this.currentHours)}>
          <ha-icon icon=${ICON[dir]}></ha-icon>${t(`actions.start_${dir}`)}</button>
      </div>
    </div>`;
  }

  private renderTemporary() {
    const now = Date.now() / 1000;
    if (this.snap.boost.effective) return this.renderRunning(now);
    const { lang, canAct } = this.ctx;
    const t = this.t;
    const dirs = this.options.directions;
    return html`
      <div class="big" style="--n:${dirs.length}">
        ${dirs.map((d) => {
          const def = this.defaults(d);
          return html`<button class="cbtn" style="--tone:${TONE[d]}" ?disabled=${!canAct} title=${t("actions.long_press")}
            @pointerdown=${() => this.pressStart(d)} @pointerup=${() => this.pressEnd()} @pointerleave=${() => this.pressEnd()}
            @contextmenu=${(e: Event) => { e.preventDefault(); this.openCustom(d); }}
            @click=${() => this.onBigClick(d)}>
            <span class="l1"><ha-icon icon=${ICON[d]}></ha-icon>${t(`actions.${d}`)}</span>
            <span class="l2">${t("actions.default", {
              value: formatSigned((d === "boost" ? 1 : -1) * def.amount, lang), hours: this.hoursLabel(def.hours),
            })}</span>
          </button>`;
        })}
        <button class="icon-btn" aria-expanded=${this.customOpen} aria-label=${t("actions.custom")} title=${t("actions.custom")}
          ?disabled=${!canAct} @click=${() => (this.customOpen ? (this.customOpen = false) : this.openCustom(this.direction))}>
          <ha-icon icon="mdi:tune-variant"></ha-icon></button>
      </div>
      ${this.customOpen ? this.renderCustom() : nothing}`;
  }

  private renderProfiles() {
    const { snap, canAct } = this.ctx;
    const configured = this.options.profiles;
    const source = configured.length ? configured : snap.starred.length ? snap.starred : snap.system_profiles;
    const names = source.filter((n) => snap.profiles.includes(n));
    if (!names.length) return html`<div class="empty">${this.t("quick.empty")}</div>`;
    return html`<div class="chips" role="group" aria-label=${this.t("actions.profiles")}>
      ${names.map((name) => {
        const active = snap.active_profile === name;
        return html`<button class="chip" aria-pressed=${active} ?disabled=${!canAct}
          @click=${() => !active && this.run(() => this.ctx.store.callService("load_profile", { name }), this.t("profiles.loaded", { name }))}>
          ${active ? html`<ha-icon icon="mdi:check"></ha-icon>` : nothing}${name}</button>`;
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
