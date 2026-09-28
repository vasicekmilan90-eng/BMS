import { html, nothing, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { BmsSection, notify } from "../components.js";
import type { SectionOptions } from "../config.js";
import { baseStyles } from "../styles.js";

import "./schedules.js";

type DialogMode = "save_as" | "rename";
type Tab = SectionOptions["profiles"]["tabs"][number];

@customElement("bms-sec-profiles")
export class BmsProfilesSection extends BmsSection<SectionOptions["profiles"]> {
  static styles = [baseStyles, css`
    .tabs { margin-bottom: 10px; }
    .modified { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 8px;
      border: 1px solid var(--bms-warn); margin-bottom: 10px; font-size: var(--ha-font-size-s, 13px); }
    .modified span { flex: 1; min-width: 160px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: center; gap: 6px; padding: 4px 0; min-height: 40px; }
    li + li { border-top: 1px solid var(--bms-border); }
    li .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    li.active .name { font-weight: 500; }
    .star[aria-pressed="true"] { color: var(--bms-warn); }
    .footer { margin-top: 10px; }
  `];

  @state() private tab?: Tab;
  @state() private dialogMode?: DialogMode;
  @state() private dialogFor = "";
  @state() private dialogName = "";
  @query("dialog") private dialog!: HTMLDialogElement;
  @query("input[type=file]") private fileInput!: HTMLInputElement;

  private allowed(action: SectionOptions["profiles"]["allow"][number]): boolean {
    if (!this.options.allow.includes(action)) return false;
    return action === "load" ? this.ctx.canAct : this.ctx.editable;
  }

  private isDefault(name: string): boolean {
    return name === this.snap.profiles[0];
  }

  private openDialog(mode: DialogMode, name = ""): void {
    this.dialogMode = mode;
    this.dialogFor = name;
    this.dialogName = mode === "rename" ? name : "";
    this.updateComplete.then(() => this.dialog.showModal());
  }

  private async submitDialog(e: Event): Promise<void> {
    e.preventDefault();
    const name = this.dialogName.trim();
    if (!name) return;
    if (this.snap.profiles.includes(name) && !confirm(this.t("profiles.confirm_overwrite", { name }))) return;
    const store = this.ctx.store;
    const ok = await this.run(async () => {
      if (this.dialogMode === "rename") await store.callService("rename_profile", { name: this.dialogFor, new_name: name });
      else await store.callService("save_profile", { name });
    }, this.t("profiles.saved", { name }));
    if (ok) this.dialog.close();
  }

  private save(name: string): void {
    if (confirm(this.t("profiles.confirm_overwrite", { name }))) {
      this.run(() => this.ctx.store.callService("save_profile", { name }), this.t("profiles.saved", { name }));
    }
  }

  private removeProfile(name: string): void {
    const key = this.snap.system_profiles.includes(name) ? "profiles.confirm_delete_system" : "profiles.confirm_delete";
    if (confirm(this.t(key, { name }))) {
      this.run(() => this.ctx.store.callService("delete_profile", { name }), this.t("profiles.deleted", { name }));
    }
  }

  private toggleStar(name: string): void {
    const starred = this.snap.starred.includes(name)
      ? this.snap.starred.filter((n) => n !== name)
      : [...this.snap.starred, name];
    this.run(() => this.ctx.store.callService("set_starred", { starred }));
  }

  private async exportProfiles(): Promise<void> {
    await this.run(async () => {
      const data = await this.ctx.store.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bms-profily-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  private async importProfiles(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const result = await this.ctx.store.importData(data);
      notify(this, this.t("profiles.imported", { count: result.profiles.length }));
    } catch (err) {
      notify(this, this.t("error.action", { message: (err as Error)?.message ?? String(err) }));
    } finally {
      this.fileInput.value = "";
    }
  }

  private renderManage() {
    const { snap } = this.ctx;
    const t = this.t;
    const active = snap.active_profile;
    return html`
      ${snap.profile_modified ? html`<div class="modified" role="status">
        <ha-icon icon="mdi:pencil-circle-outline"></ha-icon>
        <span>${t("profiles.modified", { name: active })}</span>
        ${this.allowed("save") && !this.isDefault(active) ? html`<button class="btn primary" @click=${() =>
          this.run(() => this.ctx.store.callService("save_profile", { name: active }), t("profiles.saved", { name: active }))}>
          <ha-icon icon="mdi:content-save"></ha-icon>${t("profiles.save_to", { name: active })}</button>` : nothing}
        ${this.allowed("load") ? html`<button class="btn" @click=${() =>
          this.run(() => this.ctx.store.callService("load_profile", { name: active }))}>
          <ha-icon icon="mdi:restore"></ha-icon>${t("profiles.revert")}</button>` : nothing}
      </div>` : nothing}
      <ul aria-label=${t("section.profiles")}>
        ${snap.profiles.map((name) => {
          const isActive = name === active;
          const starred = snap.starred.includes(name);
          const locked = this.isDefault(name);
          return html`<li class=${isActive ? "active" : ""}>
            ${this.allowed("star") ? html`<button class="icon-btn star" aria-pressed=${starred}
              aria-label=${t("profiles.star")} title=${t("profiles.star_hint")} @click=${() => this.toggleStar(name)}>
              <ha-icon icon=${starred ? "mdi:star" : "mdi:star-outline"}></ha-icon></button>` : nothing}
            <span class="name">${name}</span>
            ${isActive ? html`<span class="chip ok">${t("profiles.active")}</span>` : nothing}
            ${!isActive && this.allowed("load") ? html`<button class="btn" @click=${() =>
              this.run(() => this.ctx.store.callService("load_profile", { name }), t("profiles.loaded", { name }))}>
              ${t("profiles.load")}</button>` : nothing}
            ${this.allowed("save") && !locked ? html`<button class="icon-btn" aria-label=${t("profiles.save")}
              title=${t("profiles.save_hint")} @click=${() => this.save(name)}><ha-icon icon="mdi:content-save-outline"></ha-icon></button>` : nothing}
            ${this.allowed("rename") && !locked ? html`<button class="icon-btn" aria-label=${t("profiles.rename")}
              title=${t("profiles.rename")} @click=${() => this.openDialog("rename", name)}><ha-icon icon="mdi:rename"></ha-icon></button>` : nothing}
            ${this.allowed("delete") && !locked ? html`<button class="icon-btn" aria-label=${t("profiles.delete")}
              title=${t("profiles.delete")} @click=${() => this.removeProfile(name)}><ha-icon icon="mdi:delete-outline"></ha-icon></button>` : nothing}
          </li>`;
        })}
      </ul>
      <div class="actions footer">
        ${this.allowed("save") ? html`<button class="btn" @click=${() => this.openDialog("save_as")}>
          <ha-icon icon="mdi:content-save-plus"></ha-icon>${t("profiles.save_as")}</button>` : nothing}
        <span class="spacer"></span>
        ${this.allowed("transfer") ? html`
          <button class="btn" @click=${() => this.exportProfiles()}><ha-icon icon="mdi:export"></ha-icon>${t("profiles.export")}</button>
          <button class="btn" @click=${() => this.fileInput.click()}><ha-icon icon="mdi:import"></ha-icon>${t("profiles.import")}</button>
          <input type="file" accept="application/json,.json" hidden
            @change=${(e: Event) => this.importProfiles((e.target as HTMLInputElement).files?.[0])} />` : nothing}
      </div>
      <dialog @close=${() => (this.dialogMode = undefined)}>
        <form @submit=${(e: Event) => this.submitDialog(e)}>
          <h3>${this.dialogMode ? t(`profiles.${this.dialogMode}`) : ""}</h3>
          <div class="field">
            <label for="pname">${t("profiles.name")}</label>
            <input id="pname" required maxlength="60" .value=${this.dialogName}
              @input=${(e: Event) => (this.dialogName = (e.target as HTMLInputElement).value)} />
          </div>
          <div class="actions">
            <button type="button" class="btn" @click=${() => this.dialog.close()}>${t("common.cancel")}</button>
            <button type="submit" class="btn primary">${t("common.save")}</button>
          </div>
        </form>
      </dialog>`;
  }

  protected render() {
    const tabs = this.options.tabs;
    if (!tabs.length) return nothing;
    const tab = this.tab && tabs.includes(this.tab) ? this.tab : tabs[0];
    return html`
      ${tabs.length > 1 ? html`<div class="seg tabs" role="tablist">
        ${tabs.map((id) => html`<button role="tab" aria-selected=${id === tab} @click=${() => (this.tab = id)}>
          <ha-icon icon=${id === "manage" ? "mdi:bookmark-multiple-outline" : "mdi:calendar-clock"}></ha-icon>
          ${this.t(`profiles.tab.${id}`)}</button>`)}
      </div>` : nothing}
      <div role=${tabs.length > 1 ? "tabpanel" : nothing}>
        ${tab === "manage" ? this.renderManage() : html`<bms-sec-schedules .ctx=${this.ctx}></bms-sec-schedules>`}
      </div>`;
  }
}
