/** Vizuální editor karty (ha-form). */

import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { MODES, SECTIONS, type BmsCardConfig } from "./config.js";
import { createTranslator } from "./i18n.js";
import type { HomeAssistant } from "./types.js";

@customElement("bms-card-editor")
export class BmsCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: BmsCardConfig;

  setConfig(config: BmsCardConfig): void {
    this.config = config;
  }

  private get schema() {
    const t = createTranslator(this.hass?.locale?.language ?? this.hass?.language);
    const options = (ids: readonly string[], prefix: string) => ids.map((id) => ({ value: id, label: t(`${prefix}.${id}`) }));
    return [
      { name: "title", selector: { text: {} } },
      { name: "sections", selector: { select: { multiple: true, reorder: true, mode: "list", options: options(SECTIONS, "section") } } },
      { name: "modes", selector: { select: { multiple: true, reorder: true, mode: "list", options: options(MODES, "modes") } } },
      { name: "collapsed", selector: { select: { multiple: true, mode: "list", options: options(SECTIONS, "section") } } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "compact", selector: { boolean: {} } },
          { name: "curve_editor", selector: { boolean: {} } },
          { name: "read_only", selector: { boolean: {} } },
          { name: "admin_only_settings", selector: { boolean: {} } },
        ],
      },
    ];
  }

  private computeLabel = (item: { name: string }) =>
    createTranslator(this.hass?.locale?.language ?? this.hass?.language)(`editor.${item.name}`);

  private computeHelper = (item: { name: string }) => {
    const t = createTranslator(this.hass?.locale?.language ?? this.hass?.language);
    const key = `editor.${item.name}_help`;
    const text = t(key);
    return text === key ? undefined : text;
  };

  private valueChanged(e: CustomEvent<{ value: BmsCardConfig }>): void {
    const value: Record<string, unknown> = { ...e.detail.value };
    for (const [key, v] of Object.entries(value)) {
      if (v === "" || v === undefined || (Array.isArray(v) && v.length === 0 && key !== "sections")) delete value[key];
    }
    this.config = value as unknown as BmsCardConfig;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: value }, bubbles: true, composed: true }));
  }

  protected render() {
    if (!this.hass || !this.config) return nothing;
    const data = {
      sections: [...SECTIONS],
      modes: [...MODES],
      collapsed: ["log", "settings"],
      compact: false,
      curve_editor: true,
      read_only: false,
      admin_only_settings: true,
      ...this.config,
    };
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${this.schema}
      .computeLabel=${this.computeLabel}
      .computeHelper=${this.computeHelper}
      @value-changed=${this.valueChanged}
    ></ha-form>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bms-card-editor": BmsCardEditor;
  }
}
