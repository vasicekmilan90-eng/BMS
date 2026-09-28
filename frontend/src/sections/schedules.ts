import { html, nothing, css, svg } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import { daysInMonth, describeRule, parseMmdd, toMmdd, validateRule, yearSegments } from "../logic.js";
import { baseStyles } from "../styles.js";
import type { ScheduleRule } from "../types.js";

const EMPTY_RULE: ScheduleRule = {
  id: "", enabled: true, type: "date", profile: "", date_from: "11-01", date_to: "03-31",
  temp_op: "<", temp_val: 5, temp_days: 3,
};
const PALETTE = ["var(--bms-info)", "var(--bms-heat)", "var(--bms-ok)", "var(--bms-night)", "var(--bms-frost)", "var(--bms-warn)"];

@customElement("bms-sec-schedules")
export class BmsSchedulesSection extends BmsSection {
  static styles = [baseStyles, css`
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--bms-border); border-radius: 8px; }
    li .desc { flex: 1; font-size: var(--ha-font-size-s, 13px); }
    li.disabled .desc { opacity: 0.55; }
    li.current { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 6%, transparent); }
    li .swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    .order { display: flex; flex-direction: column; }
    .order .icon-btn { padding: 0; }
    .two { display: flex; gap: 8px; align-items: center; }
    .two input, .two select { flex: 1; min-width: 0; }
    .timeline { width: 100%; display: block; margin-bottom: 10px; }
    .months { display: flex; justify-content: space-between; font-size: 10px; color: var(--bms-muted); margin: -6px 0 10px; }
  `];

  @state() private draft?: ScheduleRule;
  @state() private error?: string;
  @query("dialog") private dialog!: HTMLDialogElement;

  private edit(rule?: ScheduleRule): void {
    this.draft = { ...EMPTY_RULE, profile: this.snap.active_profile, ...rule };
    this.error = undefined;
    this.updateComplete.then(() => this.dialog.showModal());
  }

  private patch(values: Partial<ScheduleRule>): void {
    if (this.draft) this.draft = { ...this.draft, ...values };
  }

  private async save(e: Event): Promise<void> {
    e.preventDefault();
    const rule = this.draft;
    if (!rule) return;
    const problem = validateRule(rule);
    if (problem) {
      this.error = this.t(problem);
      return;
    }
    const ok = await this.run(() => this.ctx.store.callService("save_schedule", { ...rule }));
    if (ok) this.dialog.close();
  }

  private move(index: number, dir: -1 | 1): void {
    const order = this.snap.schedules.map((r) => r.id);
    const target = index + dir;
    [order[index], order[target]] = [order[target], order[index]];
    this.run(() => this.ctx.store.callService("reorder_schedules", { order }));
  }

  private monthNames(): string[] {
    const fmt = new Intl.DateTimeFormat(this.ctx.lang, { month: "short" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2024, i, 15))));
  }

  private datePicker(field: "date_from" | "date_to", label: string) {
    const value = parseMmdd(this.draft?.[field] ?? "");
    const months = this.monthNames();
    return html`<div class="two" role="group" aria-label=${label}>
      <span class="small" style="min-width:28px">${label}</span>
      <select aria-label=${this.t("schedule.day")} .value=${String(value.day)}
        @change=${(e: Event) => this.patch({ [field]: toMmdd(value.month, Number((e.target as HTMLSelectElement).value)) })}>
        ${Array.from({ length: daysInMonth(value.month) }, (_, i) => i + 1).map((d) =>
          html`<option value=${d} ?selected=${d === value.day}>${d}.</option>`)}
      </select>
      <select aria-label=${this.t("schedule.month")} .value=${String(value.month)}
        @change=${(e: Event) => this.patch({ [field]: toMmdd(Number((e.target as HTMLSelectElement).value), value.day) })}>
        ${months.map((m, i) => html`<option value=${i + 1} ?selected=${i + 1 === value.month}>${m}</option>`)}
      </select>
    </div>`;
  }

  private renderDialog() {
    const t = this.t;
    const r = this.draft;
    if (!r) return nothing;
    return html`
      <form @submit=${(e: Event) => this.save(e)}>
        <h3>${r.id ? t("schedule.edit") : t("schedule.add")}</h3>
        <div class="field">
          <label for="stype">${t("schedule.type")}</label>
          <select id="stype" .value=${r.type} @change=${(e: Event) => this.patch({ type: (e.target as HTMLSelectElement).value as ScheduleRule["type"] })}>
            <option value="date" ?selected=${r.type === "date"}>${t("schedule.type_date")}</option>
            <option value="temp" ?selected=${r.type === "temp"}>${t("schedule.type_temp")}</option>
          </select>
        </div>
        ${r.type === "date" ? html`
          <div class="field">
            <label>${t("schedule.date_range")}</label>
            ${this.datePicker("date_from", t("schedule.date_from"))}
            ${this.datePicker("date_to", t("schedule.date_to"))}
            <span class="small muted">${t("schedule.date_hint")}</span>
          </div>` : html`
          <div class="field">
            <label>${t("schedule.temp_condition")}</label>
            <div class="two">
              <select aria-label=${t("schedule.temp_op")} .value=${r.temp_op}
                @change=${(e: Event) => this.patch({ temp_op: (e.target as HTMLSelectElement).value as ScheduleRule["temp_op"] })}>
                <option value="<" ?selected=${r.temp_op === "<"}>${t("schedule.below")}</option>
                <option value=">" ?selected=${r.temp_op === ">"}>${t("schedule.above")}</option>
              </select>
              <input type="number" step="0.5" aria-label=${t("schedule.temp_val")} .value=${String(r.temp_val)}
                @input=${(e: Event) => this.patch({ temp_val: Number((e.target as HTMLInputElement).value) })} />
              <span>°C</span>
            </div>
            <div class="two">
              <label for="sdays" class="small">${t("schedule.days")}</label>
              <input id="sdays" type="number" min="1" max="30" step="1" .value=${String(r.temp_days)}
                @input=${(e: Event) => this.patch({ temp_days: Number((e.target as HTMLInputElement).value) })} />
            </div>
          </div>`}
        <div class="field">
          <label for="sprofile">${t("schedule.profile")}</label>
          <select id="sprofile" .value=${r.profile} @change=${(e: Event) => this.patch({ profile: (e.target as HTMLSelectElement).value })}>
            ${this.snap.profiles.map((p) => html`<option value=${p} ?selected=${p === r.profile}>${p}</option>`)}
          </select>
        </div>
        ${this.error ? html`<div class="alert error" role="alert">${this.error}</div>` : nothing}
        <div class="actions">
          <button type="button" class="btn" @click=${() => this.dialog.close()}>${t("common.cancel")}</button>
          <button type="submit" class="btn primary">${t("common.save")}</button>
        </div>
      </form>`;
  }

  /** Roční osa s obdobími pravidel a dnešním dnem. */
  private renderTimeline(rules: ScheduleRule[]) {
    const dated = rules.map((r, i) => ({ r, color: PALETTE[i % PALETTE.length] })).filter((x) => x.r.type === "date");
    if (!dated.length) return nothing;
    const now = new Date();
    const today = (Date.UTC(2024, now.getMonth(), now.getDate()) - Date.UTC(2024, 0, 1)) / (366 * 86_400_000);
    const rowH = 8;
    const height = dated.length * (rowH + 3) + 4;
    return html`
      <svg class="timeline" viewBox="0 0 360 ${height}" preserveAspectRatio="none" style="height:${height}px"
        role="img" aria-label=${this.t("schedule.timeline")}>
        ${Array.from({ length: 11 }, (_, i) => svg`<line x1=${((i + 1) / 12) * 360} x2=${((i + 1) / 12) * 360} y1="0" y2=${height}
          stroke="var(--bms-border)" vector-effect="non-scaling-stroke"></line>`)}
        ${dated.map(({ r, color }, row) => yearSegments(r.date_from, r.date_to).map(([a, b]) => svg`
          <rect x=${a * 360} y=${2 + row * (rowH + 3)} width=${Math.max(1, (b - a) * 360)} height=${rowH} rx="2"
            fill=${color} opacity=${r.enabled ? (r.id === this.snap.active_rule ? 1 : 0.55) : 0.15}></rect>`))}
        <line x1=${today * 360} x2=${today * 360} y1="0" y2=${height} stroke="var(--primary-text-color)" stroke-width="2"
          vector-effect="non-scaling-stroke"></line>
      </svg>
      <div class="months">${this.monthNames().map((m) => html`<span>${m}</span>`)}</div>`;
  }

  protected render() {
    const { snap, editable, lang } = this.ctx;
    const t = this.t;
    const rules = snap.schedules;
    const colors = rules.map((r, i) => (r.type === "date" ? PALETTE[i % PALETTE.length] : "transparent"));
    return html`
      ${this.renderTimeline(rules)}
      ${rules.length ? html`<ul>
        ${rules.map((rule, i) => html`
          <li class="${rule.enabled ? "" : "disabled"} ${rule.id === snap.active_rule ? "current" : ""}"
            aria-current=${rule.id === snap.active_rule ? "true" : nothing}>
            ${editable ? html`<div class="order">
              <button class="icon-btn" ?disabled=${i === 0} aria-label=${t("schedule.up")} @click=${() => this.move(i, -1)}>
                <ha-icon icon="mdi:chevron-up"></ha-icon></button>
              <button class="icon-btn" ?disabled=${i === rules.length - 1} aria-label=${t("schedule.down")} @click=${() => this.move(i, 1)}>
                <ha-icon icon="mdi:chevron-down"></ha-icon></button>
            </div>` : nothing}
            <span class="swatch" style="background:${colors[i]}"></span>
            <ha-switch .checked=${rule.enabled} ?disabled=${!editable} aria-label=${t("schedule.enabled")}
              @change=${(e: Event) => this.run(() => this.ctx.store.callService("save_schedule",
                { ...rule, enabled: (e.target as HTMLInputElement).checked }))}></ha-switch>
            <span class="desc">${describeRule(rule, t, lang)}
              ${rule.id === snap.active_rule ? html`<span class="chip ok">${t("schedule.current")}</span>` : nothing}</span>
            ${editable ? html`
              <button class="icon-btn" aria-label=${t("schedule.edit")} @click=${() => this.edit(rule)}><ha-icon icon="mdi:pencil"></ha-icon></button>
              <button class="icon-btn" aria-label=${t("schedule.delete")}
                @click=${() => confirm(t("schedule.confirm_delete")) && this.run(() => this.ctx.store.callService("delete_schedule", { id: rule.id }))}>
                <ha-icon icon="mdi:delete"></ha-icon></button>` : nothing}
          </li>`)}
      </ul>` : html`<div class="empty">${t("schedule.empty")}</div>`}
      ${editable ? html`<div class="actions" style="margin-top:8px">
        <button class="btn" @click=${() => this.edit()}><ha-icon icon="mdi:plus"></ha-icon>${t("schedule.add")}</button>
        <span class="small muted">${t("schedule.hint")}</span>
      </div>
      <dialog @close=${() => (this.draft = undefined)}>${this.renderDialog()}</dialog>` : nothing}
    `;
  }
}
