import { html, nothing, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import { describeRule, validateRule } from "../logic.js";
import { baseStyles } from "../styles.js";
import type { ScheduleRule } from "../types.js";

const EMPTY_RULE: ScheduleRule = {
  id: "", enabled: true, type: "date", profile: "", date_from: "", date_to: "",
  temp_op: "<", temp_val: 5, temp_days: 3,
};

@customElement("bms-sec-schedules")
export class BmsSchedulesSection extends BmsSection {
  static styles = [baseStyles, css`
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--bms-border); border-radius: 8px; }
    li .desc { flex: 1; font-size: var(--ha-font-size-s, 13px); }
    li.disabled .desc { opacity: 0.55; }
    li.current { border-color: var(--primary-color); }
    .order { display: flex; flex-direction: column; }
    ha-icon-button { --mdc-icon-button-size: 32px; --mdc-icon-size: 18px; }
    .icon-btn { border: none; background: none; cursor: pointer; color: var(--bms-muted); padding: 2px; border-radius: 4px; }
    .icon-btn:hover:not(:disabled) { color: var(--primary-text-color); background: var(--bms-surface); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 18px; }
    .two { display: flex; gap: 8px; align-items: center; }
    .two input, .two select { flex: 1; min-width: 0; }
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
            <div class="two">
              <input aria-label=${t("schedule.date_from")} placeholder="11-01" pattern="\\d{2}-\\d{2}" .value=${r.date_from}
                @input=${(e: Event) => this.patch({ date_from: (e.target as HTMLInputElement).value.trim() })} />
              <span>–</span>
              <input aria-label=${t("schedule.date_to")} placeholder="03-31" pattern="\\d{2}-\\d{2}" .value=${r.date_to}
                @input=${(e: Event) => this.patch({ date_to: (e.target as HTMLInputElement).value.trim() })} />
            </div>
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
          <button type="button" class="btn" @click=${() => this.dialog.close()}>${this.t("common.cancel")}</button>
          <button type="submit" class="btn primary">${this.t("common.save")}</button>
        </div>
      </form>`;
  }

  protected render() {
    const { snap, editable, lang } = this.ctx;
    const t = this.t;
    const rules = snap.schedules;
    return html`
      ${rules.length ? html`<ul>
        ${rules.map((rule, i) => html`
          <li class=${rule.enabled ? "" : "disabled"}>
            ${editable ? html`<div class="order">
              <button class="icon-btn" ?disabled=${i === 0} aria-label=${t("schedule.up")} @click=${() => this.move(i, -1)}>
                <ha-icon icon="mdi:chevron-up"></ha-icon></button>
              <button class="icon-btn" ?disabled=${i === rules.length - 1} aria-label=${t("schedule.down")} @click=${() => this.move(i, 1)}>
                <ha-icon icon="mdi:chevron-down"></ha-icon></button>
            </div>` : nothing}
            <ha-switch .checked=${rule.enabled} ?disabled=${!editable} aria-label=${t("schedule.enabled")}
              @change=${(e: Event) => this.run(() => this.ctx.store.callService("save_schedule",
                { ...rule, enabled: (e.target as HTMLInputElement).checked }))}></ha-switch>
            <span class="desc">${describeRule(rule, t, lang)}</span>
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
