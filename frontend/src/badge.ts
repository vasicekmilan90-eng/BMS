/** Odznak (badge) do dashboardu: výsledná teplota a stav regulace. */

import { html, nothing, css } from "lit";

import { BmsLiveElement, type LiveConfig } from "./features.js";
import { formatTemp } from "./i18n.js";
import { regulationState } from "./logic.js";

const TONE: Record<string, string> = {
  inactive: "var(--secondary-text-color)", boost: "var(--state-climate-heat-color, #ff8100)",
  reduction: "var(--info-color, #039be5)", frost: "var(--cyan-color, #00bcd4)", night: "var(--purple-color, #7e57c2)",
  bypass: "var(--warning-color, #ffa600)", safe: "var(--warning-color, #ffa600)", active: "var(--success-color, #43a047)",
};

interface BadgeConfig extends LiveConfig {
  show_state?: boolean;
}

export class BmsBadge extends BmsLiveElement<BadgeConfig> {
  static styles = css`
    :host { display: inline-block; }
    button {
      display: inline-flex; align-items: center; gap: 8px; height: var(--ha-badge-size, 36px); padding: 0 12px 0 8px;
      border-radius: var(--ha-badge-border-radius, 18px); border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
      background: var(--ha-card-background, var(--card-background-color, #fff)); color: var(--primary-text-color);
      font: inherit; font-size: var(--ha-badge-font-size, 12px); cursor: pointer; box-sizing: border-box;
    }
    button:focus-visible { outline: 2px solid var(--primary-color); }
    ha-icon { --mdc-icon-size: 18px; }
    .text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; }
    .label { font-size: 10px; color: var(--secondary-text-color); }
    .value { font-weight: 500; }
  `;

  static getStubConfig(): BadgeConfig {
    return { type: "custom:bms-badge" };
  }

  protected render() {
    const snap = this.snapshot;
    if (!snap) return nothing;
    const state = regulationState(snap);
    const t = this.t;
    return html`<button @click=${() => {
        const entityId = snap.entities["sensor.calc_temp"];
        if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
      }} aria-label=${`${t("status.result")}: ${formatTemp(snap.result?.result, this.language)}, ${t(`state.${state}`)}`}>
      <ha-icon icon="mdi:thermostat-auto" style="color:${TONE[state]}"></ha-icon>
      <span class="text">
        ${this.config?.show_state === false ? nothing : html`<span class="label">${t(`state.${state}`)}</span>`}
        <span class="value">${formatTemp(snap.result?.result, this.language)}</span>
      </span>
    </button>`;
  }
}

interface CustomBadgeEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
}

declare global {
  interface Window {
    customBadges?: CustomBadgeEntry[];
  }
}

export function registerBadge(): void {
  if (!customElements.get("bms-badge")) customElements.define("bms-badge", BmsBadge);
  window.customBadges = window.customBadges ?? [];
  if (!window.customBadges.some((b) => b.type === "bms-badge")) {
    window.customBadges.push({ type: "bms-badge", name: "BMS – regulace", description: "Výsledná teplota a stav regulace.", preview: true });
  }
}
