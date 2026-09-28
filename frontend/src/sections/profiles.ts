import { html, nothing, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { BmsSection, notify } from "../components.js";
import { baseStyles } from "../styles.js";

@customElement("bms-sec-quick-profiles")
export class BmsQuickProfilesSection extends BmsSection {
  static styles = [baseStyles, css`
    .presets { display: flex; flex-wrap: wrap; gap: 8px; }
    .presets button.btn { min-width: 96px; justify-content: center; }
  `];

  protected render() {
    const { snap, canAct } = this.ctx;
    const starred = (snap.starred.length ? snap.starred : snap.system_profiles).filter((n) => snap.profiles.includes(n));
    if (!starred.length) return html`<div class="empty">${this.t("quick.empty")}</div>`;
    return html`<div class="presets" role="group" aria-label=${this.t("section.quick_profiles")}>
      ${starred.map((name) => {
        const active = snap.active_profile === name;
        return html`<button class="btn ${active ? "active" : ""}" aria-pressed=${active} ?disabled=${!canAct}
          @click=${() => this.run(() => this.ctx.store.callService("load_profile", { name }),
            this.t("profiles.loaded", { name }))}>
          <ha-icon icon=${active ? "mdi:check" : "mdi:bookmark-outline"}></ha-icon>${name}</button>`;
      })}
    </div>`;
  }
}

type DialogMode = "save_as" | "rename";

@customElement("bms-sec-profiles")
export class BmsProfilesSection extends BmsSection {
  static styles = [baseStyles, css`
    .picker { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
    .picker select { flex: 1; min-width: 160px; }
  `];

  @state() private selected?: string;
  @state() private dialogMode?: DialogMode;
  @state() private dialogName = "";
  @query("dialog") private dialog!: HTMLDialogElement;
  @query("input[type=file]") private fileInput!: HTMLInputElement;

  private get current(): string {
    const { profiles, active_profile } = this.snap;
    return this.selected && profiles.includes(this.selected) ? this.selected : active_profile;
  }

  private get isDefault(): boolean {
    return this.current === this.snap.profiles[0];
  }

  private openDialog(mode: DialogMode): void {
    this.dialogMode = mode;
    this.dialogName = mode === "rename" ? this.current : "";
    this.updateComplete.then(() => this.dialog.showModal());
  }

  private async submitDialog(e: Event): Promise<void> {
    e.preventDefault();
    const name = this.dialogName.trim();
    if (!name) return;
    if (this.snap.profiles.includes(name) && !confirm(this.t("profiles.confirm_overwrite", { name }))) return;
    const store = this.ctx.store;
    const ok = await this.run(async () => {
      if (this.dialogMode === "rename") {
        await store.callService("rename_profile", { name: this.current, new_name: name });
      } else {
        await store.callService("save_profile", { name });
      }
    }, this.t("profiles.saved", { name }));
    if (ok) {
      this.selected = name;
      this.dialog.close();
    }
  }

  private toggleStar(): void {
    const name = this.current;
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

  protected render() {
    const { snap, editable, canAct } = this.ctx;
    const t = this.t;
    const name = this.current;
    const starred = snap.starred.includes(name);
    return html`
      <div class="picker">
        <label class="visually-hidden" for="profile">${t("profiles.select")}</label>
        <select id="profile" .value=${name} @change=${(e: Event) => (this.selected = (e.target as HTMLSelectElement).value)}>
          ${snap.profiles.map((p) => html`<option value=${p} ?selected=${p === name}>
            ${p}${p === snap.active_profile ? ` (${t("profiles.active")})` : ""}</option>`)}
        </select>
        <button class="btn primary" ?disabled=${!canAct || name === snap.active_profile}
          @click=${() => this.run(() => this.ctx.store.callService("load_profile", { name }), t("profiles.loaded", { name }))}>
          ${t("profiles.load")}</button>
      </div>
      ${editable ? html`
        <div class="actions">
          <button class="btn" ?disabled=${this.isDefault}
            @click=${() => confirm(t("profiles.confirm_overwrite", { name })) &&
              this.run(() => this.ctx.store.callService("save_profile", { name }), t("profiles.saved", { name }))}>
            <ha-icon icon="mdi:content-save"></ha-icon>${t("profiles.save")}</button>
          <button class="btn" @click=${() => this.openDialog("save_as")}>
            <ha-icon icon="mdi:content-save-plus"></ha-icon>${t("profiles.save_as")}</button>
          <button class="btn" ?disabled=${this.isDefault} @click=${() => this.openDialog("rename")}>
            <ha-icon icon="mdi:rename"></ha-icon>${t("profiles.rename")}</button>
          <button class="btn" aria-pressed=${starred} @click=${() => this.toggleStar()}>
            <ha-icon icon=${starred ? "mdi:star" : "mdi:star-outline"}></ha-icon>${t("profiles.star")}</button>
          <button class="btn danger" ?disabled=${this.isDefault}
            @click=${() => confirm(t(snap.system_profiles.includes(name) ? "profiles.confirm_delete_system" : "profiles.confirm_delete", { name })) &&
              this.run(() => this.ctx.store.callService("delete_profile", { name }), t("profiles.deleted", { name }))}>
            <ha-icon icon="mdi:delete"></ha-icon>${t("profiles.delete")}</button>
          <span style="flex:1"></span>
          <button class="btn" @click=${() => this.exportProfiles()}><ha-icon icon="mdi:export"></ha-icon>${t("profiles.export")}</button>
          <button class="btn" @click=${() => this.fileInput.click()}><ha-icon icon="mdi:import"></ha-icon>${t("profiles.import")}</button>
          <input type="file" accept="application/json,.json" hidden
            @change=${(e: Event) => this.importProfiles((e.target as HTMLInputElement).files?.[0])} />
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
        </dialog>` : nothing}
    `;
  }
}
