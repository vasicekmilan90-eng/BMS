import { html, nothing, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { BmsSection, notify, type MenuItem } from "../components.js";
import type { SectionOptions } from "../config.js";
import { baseStyles } from "../styles.js";

import "./schedules.js";

type DialogMode = "save_as" | "rename";
type Tab = SectionOptions["profiles"]["tabs"][number];
type Action = SectionOptions["profiles"]["allow"][number];

@customElement("bms-sec-profiles")
export class BmsProfilesSection extends BmsSection<SectionOptions["profiles"]> {
  static styles = [baseStyles, css`
    .top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; min-height: 40px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: center; gap: 6px; min-height: 48px; }
    li + li { border-top: 1px solid var(--bms-border); }
    li .name { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    li .name .badge { margin-left: 6px; }
    .star { color: var(--bms-muted); }
    .star[aria-pressed="true"] { color: var(--bms-warn); }
    .placeholder { width: 40px; flex-shrink: 0; }
    .modified .links { display: flex; flex-wrap: wrap; gap: 0 12px; margin-top: 2px; }
  `];

  @state() private tab?: Tab;
  @state() private dialogMode?: DialogMode;
  @state() private dialogFor = "";
  @state() private dialogName = "";
  @query("dialog.name") private dialog!: HTMLDialogElement;
  @query("input[type=file]") private fileInput!: HTMLInputElement;

  private allowed(action: Action): boolean {
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
    const t = this.t;
    const name = this.dialogName.trim();
    if (!name) return;
    if (this.snap.profiles.includes(name) && name !== this.dialogFor
      && !(await this.confirm(t("profiles.confirm_overwrite", { name }), undefined, t("profiles.overwrite")))) return;
    const store = this.ctx.store;
    const ok = await this.run(async () => {
      if (this.dialogMode === "rename") await store.callService("rename_profile", { name: this.dialogFor, new_name: name });
      else await store.callService("save_profile", { name });
    }, t("profiles.saved", { name }));
    if (ok) this.dialog.close();
  }

  private load(name: string): void {
    this.run(() => this.ctx.store.callService("load_profile", { name }), this.t("profiles.loaded", { name }));
  }

  private save(name: string): void {
    this.run(() => this.ctx.store.callService("save_profile", { name }), this.t("profiles.saved", { name }));
  }

  private async overwrite(name: string): Promise<void> {
    const t = this.t;
    if (await this.confirm(t("profiles.confirm_overwrite", { name }), t("profiles.confirm_overwrite_text"), t("profiles.overwrite"))) {
      this.save(name);
    }
  }

  private async removeProfile(name: string): Promise<void> {
    const t = this.t;
    const text = this.snap.system_profiles.includes(name) ? t("profiles.confirm_delete_system") : undefined;
    if (await this.confirm(t("profiles.confirm_delete", { name }), text, t("profiles.delete"), true)) {
      this.run(() => this.ctx.store.callService("delete_profile", { name }), t("profiles.deleted", { name }));
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

  private rowMenu(name: string): MenuItem[] {
    const t = this.t;
    const locked = this.isDefault(name);
    const starred = this.snap.starred.includes(name);
    const items: MenuItem[] = [];
    if (this.allowed("save") && !locked) items.push({ icon: "mdi:content-save-outline", label: t("profiles.save"), action: () => this.overwrite(name) });
    if (this.allowed("rename") && !locked) items.push({ icon: "mdi:rename", label: t("profiles.rename"), action: () => this.openDialog("rename", name) });
    if (this.allowed("star")) {
      items.push({
        icon: starred ? "mdi:star-off-outline" : "mdi:star-outline", label: t(starred ? "profiles.unstar" : "profiles.star_add"),
        action: () => this.toggleStar(name),
      });
    }
    if (this.allowed("delete") && !locked) {
      items.push({ icon: "mdi:delete-outline", label: t("profiles.delete"), action: () => this.removeProfile(name), danger: true, divider: true });
    }
    return items;
  }

  private headMenu(): MenuItem[] {
    const t = this.t;
    const items: MenuItem[] = [];
    if (this.allowed("save")) items.push({ icon: "mdi:content-save-plus-outline", label: t("profiles.save_as"), action: () => this.openDialog("save_as") });
    if (this.allowed("transfer")) {
      items.push(
        { icon: "mdi:export", label: t("profiles.export"), action: () => this.exportProfiles(), divider: items.length > 0 },
        { icon: "mdi:import", label: t("profiles.import"), action: () => this.fileInput.click() },
      );
    }
    return items;
  }

  private renderManage() {
    const { snap } = this.ctx;
    const t = this.t;
    const active = snap.active_profile;
    return html`
      ${snap.profile_modified ? html`<div class="alert warning modified" role="status">
        <ha-icon icon="mdi:pencil-circle-outline"></ha-icon>
        <span>${t("profiles.modified", { name: active })}
          <span class="links">
            ${this.allowed("save") && !this.isDefault(active)
              ? html`<button class="link" @click=${() => this.save(active)}>${t("profiles.save_to", { name: active })}</button>` : nothing}
            ${this.allowed("save") ? html`<button class="link" @click=${() => this.openDialog("save_as")}>${t("profiles.save_as")}</button>` : nothing}
            ${this.allowed("load") ? html`<button class="link" @click=${() => this.load(active)}>${t("profiles.revert")}</button>` : nothing}
          </span></span>
      </div>` : nothing}
      <ul aria-label=${t("section.profiles")}>
        ${snap.profiles.map((name) => {
          const isActive = name === active;
          const starred = snap.starred.includes(name);
          const menu = this.rowMenu(name);
          return html`<li>
            ${this.allowed("star") ? html`<button class="icon-btn star" aria-pressed=${starred}
              aria-label=${t("profiles.star")} title=${t("profiles.star_hint")} @click=${() => this.toggleStar(name)}>
              <ha-icon icon=${starred ? "mdi:star" : "mdi:star-outline"}></ha-icon></button>` : nothing}
            <span class="name">${name}${isActive ? html`<span class="badge">${t("profiles.active")}</span>` : nothing}</span>
            ${!isActive && this.allowed("load") ? html`<button class="btn" @click=${() => this.load(name)}>${t("profiles.load")}</button>` : nothing}
            ${menu.length ? html`<bms-menu .items=${menu} label=${t("common.more")}></bms-menu>`
              : this.options.allow.length > 1 ? html`<span class="placeholder"></span>` : nothing}
          </li>`;
        })}
      </ul>
      <dialog class="name" @close=${() => (this.dialogMode = undefined)}>
        <form @submit=${(e: Event) => this.submitDialog(e)}>
          <h3>${this.dialogMode ? t(`profiles.${this.dialogMode}`) : ""}</h3>
          <div class="field">
            <label for="pname">${t("profiles.name")}</label>
            <input id="pname" required maxlength="60" .value=${this.dialogName}
              @input=${(e: Event) => (this.dialogName = (e.target as HTMLInputElement).value)} />
          </div>
          <div class="actions">
            <button type="button" class="btn text" @click=${() => this.dialog.close()}>${t("common.cancel")}</button>
            <button type="submit" class="btn text">${t("common.save")}</button>
          </div>
        </form>
      </dialog>`;
  }

  protected render() {
    const tabs = this.options.tabs;
    if (!tabs.length) return nothing;
    const tab = this.tab && tabs.includes(this.tab) ? this.tab : tabs[0];
    const headMenu = tab === "manage" ? this.headMenu() : [];
    return html`
      ${tabs.length > 1 || headMenu.length ? html`<div class="top">
        ${tabs.length > 1 ? html`<div class="seg" role="tablist">
          ${tabs.map((id) => html`<button role="tab" aria-selected=${id === tab} @click=${() => (this.tab = id)}>
            ${this.t(`profiles.tab.${id}`)}</button>`)}
        </div>` : nothing}
        <span class="spacer"></span>
        ${headMenu.length ? html`<bms-menu .items=${headMenu} label=${this.t("common.more")}></bms-menu>` : nothing}
      </div>` : nothing}
      <input type="file" accept="application/json,.json" hidden
        @change=${(e: Event) => this.importProfiles((e.target as HTMLInputElement).files?.[0])} />
      <div role=${tabs.length > 1 ? "tabpanel" : nothing}>
        ${tab === "manage" ? this.renderManage() : html`<bms-sec-schedules .ctx=${this.ctx}></bms-sec-schedules>`}
      </div>`;
  }
}
