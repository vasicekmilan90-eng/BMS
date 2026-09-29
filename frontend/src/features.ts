/** Funkce dlaždic (tile card features) napojené na regulátor. */

import { LitElement, html, nothing, css, type PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";

import { createTranslator, formatSigned, type Translator } from "./i18n.js";
import { remainingMinutes } from "./logic.js";
import { BmsStore } from "./store.js";
import type { HomeAssistant, Snapshot } from "./types.js";

const DOMAIN = "heating_curve";

export interface LiveConfig {
  type: string;
  entry_id?: string;
}

/** Společný základ: sdílené předplatné snapshotu a překreslení jen při změně dat. */
export class BmsLiveElement<C extends LiveConfig = LiveConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config?: C;
  @state() protected snapshot?: Snapshot;
  private detach?: () => void;
  private attachedTo?: BmsStore;

  setConfig(config: C): void {
    if (!config || typeof config !== "object") throw new Error("Neplatná konfigurace");
    this.config = config;
    this.reattach();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.reattach();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detach?.();
    this.detach = undefined;
    this.attachedTo = undefined;
  }

  private reattach(): void {
    if (!this.hass || !this.isConnected) return;
    const store = BmsStore.get(this.config?.entry_id);
    if (store === this.attachedTo) return;
    this.detach?.();
    this.attachedTo = store;
    this.detach = store.attach(this.hass, (snapshot) => (this.snapshot = snapshot));
  }

  protected shouldUpdate(changed: PropertyValues<this>): boolean {
    if (changed.has("hass")) {
      const old = changed.get("hass") as HomeAssistant | undefined;
      if (!old) this.reattach();
      else if (this.attachedTo) this.attachedTo.hass = this.hass;
      if (old && changed.size === 1) return old.language !== this.hass?.language;
    }
    return true;
  }

  protected get t(): Translator {
    return createTranslator(this.hass?.locale?.language ?? this.hass?.language);
  }

  protected get language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  protected get store(): BmsStore {
    return BmsStore.get(this.config?.entry_id);
  }

  protected async call(service: string, data: Record<string, unknown> = {}): Promise<void> {
    try {
      await this.store.callService(service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: this.t("error.action", { message: (err as Error)?.message ?? String(err) }) },
        bubbles: true, composed: true,
      }));
    }
  }
}

/** Nabízí se jen u entit této integrace (nové API: hass + context, staré: stateObj). */
export function isBmsEntity(a: unknown, b?: unknown): boolean {
  const hass = (b ? a : undefined) as HomeAssistant | undefined;
  const entityId = (b as { entity_id?: string } | undefined)?.entity_id ?? (a as { entity_id?: string } | undefined)?.entity_id;
  if (!entityId) return false;
  const platform = hass?.entities?.[entityId]?.platform;
  return platform ? platform === DOMAIN : /\.bms_/.test(entityId);
}

const featureStyles = css`
  :host { display: block; }
  .row { display: flex; gap: 8px; height: var(--feature-height, 42px); align-items: stretch; }
  button {
    flex: 1; min-width: 0; border: none; cursor: pointer; font: inherit; font-size: var(--ha-font-size-s, 13px);
    font-weight: 500; border-radius: var(--feature-border-radius, 12px); color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 127, 127, 127), 0.06);
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  button:hover { background: rgba(var(--rgb-primary-text-color, 127, 127, 127), 0.12); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
  button.on { background: color-mix(in srgb, var(--tone, var(--primary-color)) 22%, transparent); color: var(--tone, var(--primary-color)); }
  button.stop { flex: 0 0 auto; width: 42px; padding: 0; }
  ha-icon { --mdc-icon-size: 18px; flex-shrink: 0; }
`;

export class BmsTemporaryFeature extends BmsLiveElement {
  static styles = featureStyles;

  static getStubConfig(): LiveConfig {
    return { type: "custom:bms-temporary-change" };
  }

  protected render() {
    const snap = this.snapshot;
    if (!snap) return nothing;
    const t = this.t;
    const e = snap.boost.effective;
    if (e) {
      const kind = e > 0 ? "boost" : "reduction";
      const tone = kind === "boost" ? "var(--state-climate-heat-color, #ff8100)" : "var(--info-color, #039be5)";
      return html`<div class="row" style="--tone:${tone}">
        <button class="on" @click=${() => this.call("cancel_boost")} aria-label=${t("actions.cancel")}>
          <ha-icon icon=${kind === "boost" ? "mdi:fire" : "mdi:snowflake-thermometer"}></ha-icon>
          ${formatSigned(e, this.language)} °C · ${t("status.boost_remaining", { minutes: remainingMinutes(snap, Date.now() / 1000) })}
        </button>
        <button class="stop" @click=${() => this.call("cancel_boost")} aria-label=${t("actions.cancel")}>
          <ha-icon icon="mdi:stop"></ha-icon></button>
      </div>`;
    }
    const amount = (key: string) => formatSigned(Number(snap.settings[key]) * (key.startsWith("reduction") ? -1 : 1), this.language);
    return html`<div class="row">
      <button style="--tone:var(--state-climate-heat-color, #ff8100)" @click=${() => this.call("activate_boost")}>
        <ha-icon icon="mdi:fire"></ha-icon>${t("actions.boost")} ${amount("boost_amount")} °C</button>
      <button style="--tone:var(--info-color, #039be5)" @click=${() => this.call("activate_reduction")}>
        <ha-icon icon="mdi:snowflake-thermometer"></ha-icon>${t("actions.reduction")} ${amount("reduction_amount")} °C</button>
    </div>`;
  }
}

export class BmsProfileFeature extends BmsLiveElement {
  static styles = featureStyles;

  static getStubConfig(): LiveConfig {
    return { type: "custom:bms-profile-select" };
  }

  protected render() {
    const snap = this.snapshot;
    if (!snap) return nothing;
    const source = snap.starred.length ? snap.starred : snap.system_profiles;
    const names = source.filter((n) => snap.profiles.includes(n)).slice(0, 4);
    if (!names.length) return nothing;
    return html`<div class="row" role="group" aria-label=${this.t("actions.profiles")}>
      ${names.map((name) => {
        const active = name === snap.active_profile;
        return html`<button class=${active ? "on" : ""} aria-pressed=${active} title=${name}
          @click=${() => !active && this.call("load_profile", { name })}>${name}</button>`;
      })}
    </div>`;
  }
}

interface CustomCardFeatureEntry {
  type: string;
  name: string;
  supported?: (a: unknown, b?: unknown) => boolean;
  configurable?: boolean;
}

declare global {
  interface Window {
    customCardFeatures?: CustomCardFeatureEntry[];
  }
}

export function registerFeatures(): void {
  const features: [string, CustomElementConstructor, string][] = [
    ["bms-temporary-change", BmsTemporaryFeature, "BMS – boost / útlum"],
    ["bms-profile-select", BmsProfileFeature, "BMS – rychlé profily"],
  ];
  window.customCardFeatures = window.customCardFeatures ?? [];
  for (const [type, ctor, name] of features) {
    if (!customElements.get(type)) customElements.define(type, ctor);
    if (!window.customCardFeatures.some((f) => f.type === type)) {
      window.customCardFeatures.push({ type, name, supported: isBmsEntity, configurable: false });
    }
  }
}
