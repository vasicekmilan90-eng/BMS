/** Základ sekcí a sdílené ovládací prvky napojené na nastavení regulátoru. */

import { LitElement, html, nothing, type CSSResultGroup, type PropertyValues } from "lit";
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

export function notify(el: HTMLElement, message: string): void {
  el.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
}

export class BmsSection extends LitElement {
  static styles: CSSResultGroup = baseStyles;

  @property({ attribute: false }) ctx!: CardContext;

  protected get snap(): Snapshot {
    return this.ctx.snap;
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

  protected setSetting(key: string, value: SettingValue): Promise<boolean> {
    return this.run(() => this.ctx.store.setSetting(key, value));
  }

  protected moreInfo(name: string): void {
    const entityId = this.ctx.snap.entities[name];
    if (!entityId) return;
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
      await this.ctx.store.setSetting(this.key, value);
    } catch (err) {
      notify(this, this.ctx.t("error.action", { message: (err as Error)?.message ?? String(err) }));
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

  protected render() {
    const checked = Boolean(this.ctx.snap.settings[this.key]);
    return html`
      <div class="row">
        <span class="label">${this.label}</span>
        <ha-switch
          .checked=${checked}
          ?disabled=${!this.ctx.editable}
          aria-label=${this.label}
          @change=${async (e: Event) => {
            const target = e.target as HTMLInputElement;
            try {
              await this.ctx.store.setSetting(this.key, target.checked);
            } catch (err) {
              target.checked = checked;
              notify(this, this.ctx.t("error.action", { message: (err as Error)?.message ?? String(err) }));
            }
          }}
        ></ha-switch>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bms-number": BmsNumber;
    "bms-toggle": BmsToggle;
  }
}
