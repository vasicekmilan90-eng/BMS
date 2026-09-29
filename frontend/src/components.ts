/** Základ sekcí a sdílené ovládací prvky napojené na nastavení regulátoru. */

import { LitElement, html, nothing, css, type CSSResultGroup, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { NormalizedConfig } from "./config.js";
import type { Translator } from "./i18n.js";
import type { BmsStore } from "./store.js";
import { baseStyles } from "./styles.js";
import type { HomeAssistant, SettingValue, Snapshot } from "./types.js";

export interface CardContext {
  hass: HomeAssistant;
  snap: Snapshot;
  store: BmsStore;
  t: Translator;
  lang: string;
  config: NormalizedConfig;
  /** Smí měnit nastavení regulátoru. */
  editable: boolean;
  /** Smí spouštět akce (boost, profil, refresh). */
  canAct: boolean;
}

export function notify(el: HTMLElement, message: string, action?: { text: string; action: () => void }): void {
  el.dispatchEvent(new CustomEvent("hass-notification", {
    detail: action ? { message, action, duration: 6000 } : { message }, bubbles: true, composed: true,
  }));
}

/** Změny v rychlém sledu se slučují do jednoho oznámení „Vrátit“ (vrátí všechny najednou). */
const UNDO_WINDOW_MS = 6000;
let undoBatch: { previous: Map<string, SettingValue>; names: string[]; timer?: number } | undefined;

/** Změna nastavení s možností „Vrátit“ v oznámení. */
export async function setWithUndo(
  el: HTMLElement, ctx: CardContext, key: string, value: SettingValue, label?: string,
): Promise<boolean> {
  const previous = ctx.snap.settings[key];
  try {
    await ctx.store.setSetting(key, value);
  } catch (err) {
    notify(el, ctx.t("error.action", { message: (err as Error)?.message ?? String(err) }));
    return false;
  }
  if (previous === undefined || previous === value) return true;
  const batch = undoBatch ?? { previous: new Map<string, SettingValue>(), names: [] };
  undoBatch = batch;
  if (!batch.previous.has(key)) {
    batch.previous.set(key, previous);
    batch.names.push(label ?? ctx.t(`setting.${key}`));
  }
  window.clearTimeout(batch.timer);
  batch.timer = window.setTimeout(() => {
    if (undoBatch === batch) undoBatch = undefined;
  }, UNDO_WINDOW_MS);
  const message = batch.names.length === 1
    ? ctx.t("common.changed", { name: batch.names[0] })
    : ctx.t("common.changed_many", { count: batch.names.length });
  notify(el, message, {
    text: ctx.t("common.undo"),
    action: () => {
      if (undoBatch === batch) undoBatch = undefined;
      for (const [k, v] of batch.previous) void ctx.store.setSetting(k, v).catch(() => undefined);
    },
  });
  return true;
}

/** Potvrzovací dialog ve stylu HA (místo prohlížečového `confirm`). */
export function confirmDialog(
  host: HTMLElement,
  options: { title: string; text?: string; confirm: string; cancel: string; danger?: boolean },
): Promise<boolean> {
  const root = host.shadowRoot ?? host;
  const dialog = document.createElement("dialog");
  dialog.className = "confirm";
  const h = document.createElement("h3");
  h.textContent = options.title;
  dialog.append(h);
  if (options.text) {
    const p = document.createElement("p");
    p.textContent = options.text;
    dialog.append(p);
  }
  const actions = document.createElement("div");
  actions.className = "actions";
  const cancel = document.createElement("button");
  cancel.className = "btn text";
  cancel.textContent = options.cancel;
  const ok = document.createElement("button");
  ok.className = `btn text ${options.danger ? "danger" : ""}`;
  ok.textContent = options.confirm;
  actions.append(cancel, ok);
  dialog.append(actions);
  root.append(dialog);
  return new Promise((resolve) => {
    let result = false;
    cancel.onclick = () => dialog.close();
    ok.onclick = () => {
      result = true;
      dialog.close();
    };
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
    ok.focus();
  });
}

export class BmsSection<O = unknown> extends LitElement {
  static styles: CSSResultGroup = baseStyles;

  @property({ attribute: false }) ctx!: CardContext;
  @property({ attribute: false }) options!: O;

  protected get snap(): Snapshot {
    return this.ctx.snap;
  }

  protected confirm(title: string, text: string | undefined, confirm: string, danger = false): Promise<boolean> {
    return confirmDialog(this, { title, text, confirm, cancel: this.t("common.cancel"), danger });
  }

  /** Požádá kartu o otevření a zobrazení jiné sekce. */
  protected showSection(id: string): void {
    this.dispatchEvent(new CustomEvent("bms-show-section", { detail: { id }, bubbles: true, composed: true }));
  }

  protected get t(): Translator {
    return this.ctx.t;
  }

  protected num(key: string): number {
    return Number(this.ctx.snap.settings[key]);
  }

  protected on(key: string): boolean {
    return Boolean(this.ctx.snap.settings[key]);
  }

  protected async run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    try {
      await action();
      if (success) notify(this, success);
      return true;
    } catch (err) {
      const message = (err as { message?: string })?.message ?? String(err);
      notify(this, this.t("error.action", { message }));
      return false;
    }
  }

  protected setSetting(key: string, value: SettingValue, label?: string): Promise<boolean> {
    return setWithUndo(this, this.ctx, key, value, label);
  }

  protected moreInfo(name: string): void {
    const entityId = this.ctx.snap.entities[name];
    if (entityId) this.moreInfoEntity(entityId);
  }

  protected moreInfoEntity(entityId: string): void {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }
}

/** Číselné pole: během editace drží lokální hodnotu, uloží se při potvrzení (Enter / opuštění). */
@customElement("bms-number")
export class BmsNumber extends LitElement {
  static styles = baseStyles;

  @property({ attribute: false }) ctx!: CardContext;
  @property() key = "";
  @property() label = "";
  @state() private draft?: string;
  @state() private saving = false;

  private get meta() {
    return this.ctx.snap.setting_meta[this.key] ?? { min: -1000, max: 1000, step: 0.1, unit: null };
  }

  protected shouldUpdate(changed: PropertyValues<this>): boolean {
    if (changed.has("ctx") && changed.size === 1 && this.draft === undefined) {
      const old = changed.get("ctx") as CardContext | undefined;
      return !old || old.snap.settings[this.key] !== this.ctx.snap.settings[this.key] || old.editable !== this.ctx.editable
        || old.lang !== this.ctx.lang;
    }
    return true;
  }

  private get value(): number {
    return Number(this.ctx.snap.settings[this.key]);
  }

  private async commit(): Promise<void> {
    if (this.draft === undefined) return;
    const parsed = Number(this.draft.replace(",", "."));
    this.draft = undefined;
    if (!Number.isFinite(parsed) || parsed === this.value) return;
    const value = Math.min(this.meta.max, Math.max(this.meta.min, parsed));
    this.saving = true;
    try {
      await setWithUndo(this, this.ctx, this.key, value, this.label);
    } finally {
      this.saving = false;
    }
  }

  protected render() {
    const id = `n-${this.key}`;
    const meta = this.meta;
    return html`
      <div class="row">
        <label class="label small" for=${id}>${this.label}</label>
        <input
          id=${id}
          type="number"
          inputmode="decimal"
          .min=${String(meta.min)}
          .max=${String(meta.max)}
          .step=${String(meta.step)}
          .value=${this.draft ?? String(this.value)}
          ?disabled=${!this.ctx.editable || this.saving}
          @input=${(e: Event) => (this.draft = (e.target as HTMLInputElement).value)}
          @change=${() => this.commit()}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") this.draft = undefined;
          }}
        />
        ${meta.unit ? html`<span class="small muted" style="min-width:32px">${meta.unit}</span>` : nothing}
      </div>
    `;
  }
}

/** Přepínač napojený na logické nastavení. */
@customElement("bms-toggle")
export class BmsToggle extends LitElement {
  static styles = baseStyles;

  @property({ attribute: false }) ctx!: CardContext;
  @property() key = "";
  @property() label = "";
  /** Popis pro oznámení „Vrátit“, když je `label` obecný („Zapnuto“). */
  @property() name = "";

  protected render() {
    const checked = Boolean(this.ctx.snap.settings[this.key]);
    return html`
      <div class="row">
        <span class="label small">${this.label}</span>
        <ha-switch
          .checked=${checked}
          ?disabled=${!this.ctx.editable}
          aria-label=${this.label}
          @change=${async (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (!(await setWithUndo(this, this.ctx, this.key, target.checked, this.name || this.label))) target.checked = checked;
          }}
        ></ha-switch>
      </div>
    `;
  }
}

export interface MenuItem {
  icon: string;
  label: string;
  action: () => void;
  danger?: boolean;
  /** Oddělovač nad položkou. */
  divider?: boolean;
  disabled?: boolean;
}

/** Tlačítko ⋮ s nabídkou akcí. */
@customElement("bms-menu")
export class BmsMenu extends LitElement {
  static styles = [baseStyles, css`
    :host { position: relative; display: inline-flex; }
    .menu {
      position: absolute; right: 0; top: 100%; z-index: 10; min-width: 220px; padding: 6px 0; margin-top: 2px;
      background: var(--card-background-color, #fff); border-radius: 12px; border: 1px solid var(--bms-border);
      box-shadow: var(--ha-box-shadow-l, 0 6px 24px rgba(0, 0, 0, 0.18));
    }
    .menu button {
      display: flex; width: 100%; gap: 12px; align-items: center; padding: 10px 16px; border: none; background: none;
      font: inherit; font-size: var(--ha-font-size-s, 13px); color: var(--primary-text-color); cursor: pointer; text-align: left;
      min-height: 44px;
    }
    .menu button:hover:not(:disabled), .menu button:focus-visible { background: var(--bms-surface); outline: none; }
    .menu button:disabled { opacity: 0.45; cursor: default; }
    .menu button.danger { color: var(--bms-err); }
    .menu button ha-icon { --mdc-icon-size: 20px; color: var(--bms-muted); }
    .menu button.danger ha-icon { color: var(--bms-err); }
    .menu hr { border: none; border-top: 1px solid var(--bms-border); margin: 4px 0; }
  `];

  @property({ attribute: false }) items: MenuItem[] = [];
  @property() label = "";
  @state() open = false;
  private readonly onDocClick = (e: Event) => {
    if (!e.composedPath().includes(this)) this.open = false;
  };

  protected updated(changed: PropertyValues<this>): void {
    if (!changed.has("open")) return;
    if (this.open) {
      document.addEventListener("click", this.onDocClick, true);
      this.renderRoot.querySelector<HTMLButtonElement>(".menu button:not(:disabled)")?.focus();
    } else {
      document.removeEventListener("click", this.onDocClick, true);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this.onDocClick, true);
  }

  protected render() {
    return html`
      <button class="icon-btn" aria-haspopup="menu" aria-expanded=${this.open} aria-label=${this.label} title=${this.label}
        @click=${() => (this.open = !this.open)}><ha-icon icon="mdi:dots-vertical"></ha-icon></button>
      ${this.open ? html`<div class="menu" role="menu" @keydown=${(e: KeyboardEvent) => e.key === "Escape" && (this.open = false)}>
        ${this.items.map((item) => html`${item.divider ? html`<hr />` : nothing}
          <button role="menuitem" class=${item.danger ? "danger" : ""} ?disabled=${item.disabled}
            @click=${() => { this.open = false; item.action(); }}>
            <ha-icon icon=${item.icon}></ha-icon>${item.label}</button>`)}
      </div>` : nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bms-number": BmsNumber;
    "bms-toggle": BmsToggle;
    "bms-menu": BmsMenu;
  }
}
