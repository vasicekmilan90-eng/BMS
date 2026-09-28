/** Vizuální editor karty: předvolby, obecné volby a sekce s vlastním nastavením. */

import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { SCREEN_QUERIES } from "./conditions.js";
import {
  AUTOMATIONS, CURVE_EDITORS, CURVE_SERIES, DIRECTIONS, INFLUENCE_ITEMS, LAYOUTS, PRESET_CONFIGS, PRESETS,
  PROFILE_ACTIONS, PROFILE_TABS, SECTIONS, SETTINGS_GROUPS, STATUS_ITEMS, compactSection, makeSection, normalizeConfig,
  type BmsCardConfig, type Condition, type NormalizedSection, type Preset, type SectionId,
} from "./config.js";
import { createTranslator, type Translator } from "./i18n.js";
import { baseStyles } from "./styles.js";
import type { HomeAssistant } from "./types.js";

type Screen = "all" | "mobile" | "desktop";
type FormSchema = Record<string, unknown>;

function screenOf(visibility: Condition[]): Screen | "advanced" {
  if (!visibility.length) return "all";
  if (visibility.length === 1 && visibility[0].condition === "screen") {
    const q = visibility[0].media_query;
    if (q === SCREEN_QUERIES.mobile) return "mobile";
    if (q === SCREEN_QUERIES.desktop) return "desktop";
  }
  return "advanced";
}

@customElement("bms-card-editor")
export class BmsCardEditor extends LitElement {
  static styles = [baseStyles, css`
    .presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    h3 { font-size: var(--ha-font-size-m, 14px); font-weight: 500; margin: 20px 0 8px; }
    .sec { border: 1px solid var(--bms-border); border-radius: 8px; margin-bottom: 6px; }
    .sec-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; min-height: 40px; }
    .sec-head label { flex: 1; display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .sec-head input[type="checkbox"] { width: 18px; height: 18px; min-height: 0; }
    .sec.off .sec-head label span { color: var(--bms-muted); }
    .sec-body { padding: 4px 12px 12px; border-top: 1px solid var(--bms-border); }
  `];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: BmsCardConfig;
  @state() private expanded?: SectionId;

  setConfig(config: BmsCardConfig): void {
    this.config = config;
  }

  private get t(): Translator {
    return createTranslator(this.hass?.locale?.language ?? this.hass?.language);
  }

  private get defaults(): readonly string[] {
    const tag = String(this.config?.type ?? "").replace(/^custom:/, "");
    const ctor = customElements.get(tag) as unknown as { defaultSections?: readonly string[] } | undefined;
    return ctor?.defaultSections ?? SECTIONS;
  }

  private get normalized() {
    return normalizeConfig(this.config, this.defaults);
  }

  private emit(config: BmsCardConfig): void {
    this.config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  /** Sestaví konfiguraci jen z nevýchozích hodnot. */
  private write(patch: { general?: Record<string, unknown>; sections?: NormalizedSection[] }): void {
    const n = this.normalized;
    const general = {
      title: n.title, entry_id: n.entry_id, layout: n.layout, compact: n.compact,
      read_only: n.read_only, admin_only_settings: n.admin_only_settings, ...patch.general,
    };
    const adminOnly = general.admin_only_settings !== false;
    const sections = (patch.sections ?? n.sections).map((s) => compactSection(s, adminOnly));
    const out: Record<string, unknown> = { type: this.config?.type ?? "custom:bms-master-card" };
    if (typeof general.title === "string" && general.title.trim()) out.title = general.title;
    if (typeof general.entry_id === "string" && general.entry_id) out.entry_id = general.entry_id;
    if (general.layout && general.layout !== "auto") out.layout = general.layout;
    if (general.compact) out.compact = true;
    if (general.read_only) out.read_only = true;
    if (!adminOnly) out.admin_only_settings = false;
    const isDefault = sections.length === this.defaults.length
      && sections.every((s, i) => s === this.defaults[i]);
    if (!isDefault) out.sections = sections;
    this.emit(out as unknown as BmsCardConfig);
  }

  private applyPreset(preset: Preset): void {
    const n = normalizeConfig({ ...PRESET_CONFIGS[preset], type: this.config?.type ?? "custom:bms-master-card" }, SECTIONS);
    this.write({
      general: { layout: n.layout, compact: n.compact, read_only: n.read_only },
      sections: n.sections,
    });
  }

  private setSections(list: NormalizedSection[]): void {
    this.write({ sections: list });
  }

  private toggleSection(id: SectionId, on: boolean): void {
    const list = this.normalized.sections;
    if (on) {
      const order = SECTIONS.indexOf(id);
      const index = list.findIndex((s) => SECTIONS.indexOf(s.type) > order);
      const next = [...list];
      next.splice(index < 0 ? next.length : index, 0, makeSection(id, {}, undefined, this.normalized.admin_only_settings));
      this.setSections(next);
    } else {
      this.setSections(list.filter((s) => s.type !== id));
    }
  }

  private move(index: number, dir: -1 | 1): void {
    const next = [...this.normalized.sections];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    this.setSections(next);
  }

  // ── Formuláře ──────────────────────────────────────────────────────────────
  private options(ids: readonly (string | number)[], prefix: string) {
    return ids.map((id) => ({ value: String(id), label: this.t(`${prefix}.${id}`) }));
  }

  private multi(name: string, ids: readonly string[], prefix: string): FormSchema {
    return { name, selector: { select: { multiple: true, mode: "list", options: this.options(ids, prefix) } } };
  }

  private single(name: string, ids: readonly string[], prefix: string): FormSchema {
    return { name, selector: { select: { mode: "dropdown", options: this.options(ids, prefix) } } };
  }

  private generalSchema(): FormSchema[] {
    return [
      { name: "title", selector: { text: {} } },
      this.single("layout", LAYOUTS, "editor.layout_opt"),
      {
        type: "grid", name: "", schema: [
          { name: "compact", selector: { boolean: {} } },
          { name: "read_only", selector: { boolean: {} } },
          { name: "admin_only_settings", selector: { boolean: {} } },
        ],
      },
    ];
  }

  private sectionSchema(s: NormalizedSection): FormSchema[] {
    const common: FormSchema[] = [
      ...(s.type === "status" ? [] : [{ name: "collapsed", selector: { boolean: {} } }]),
      { name: "admin_only", selector: { boolean: {} } },
      this.single("screen", ["all", "mobile", "desktop"], "editor.screen_opt"),
      this.single("span", ["1", "2"], "editor.span_opt"),
    ];
    const specific: FormSchema[] = (() => {
      switch (s.type) {
        case "status": return [this.multi("show", STATUS_ITEMS, "editor.status_opt")];
        case "actions": return [
          this.multi("show", ["temporary", "profiles"], "editor.actions_opt"),
          this.multi("directions", DIRECTIONS, "actions"),
          { name: "durations", selector: { text: {} } },
          { name: "profiles", selector: { text: {} } },
        ];
        case "profiles": return [this.multi("tabs", PROFILE_TABS, "profiles.tab"), this.multi("allow", PROFILE_ACTIONS, "editor.allow_opt")];
        case "automations": return [this.multi("items", AUTOMATIONS, "modes"), this.single("controls", ["status", "full"], "editor.controls_opt")];
        case "curve": return [
          this.multi("series", CURVE_SERIES, "curve"),
          this.single("editor", CURVE_EDITORS, "editor.curve_editor_opt"),
          { name: "simulate", selector: { boolean: {} } },
          { type: "grid", name: "", schema: [
            { name: "range_min", selector: { number: { min: -40, max: 30, step: 1, mode: "box" } } },
            { name: "range_max", selector: { number: { min: -30, max: 40, step: 1, mode: "box" } } },
          ] },
        ];
        case "influences": return [
          this.multi("items", INFLUENCE_ITEMS, "influences"),
          { name: "chart", selector: { boolean: {} } },
          this.single("controls", ["values", "full"], "editor.controls_opt"),
        ];
        case "log": return [
          { name: "limit", selector: { number: { min: 1, max: 50, step: 1, mode: "box" } } },
          this.single("filter", ["all", "writes"], "log"),
        ];
        case "settings": return [this.multi("groups", SETTINGS_GROUPS, "settings")];
      }
    })();
    return [...specific, ...common];
  }

  private sectionData(s: NormalizedSection): Record<string, unknown> {
    const screen = screenOf(s.visibility);
    const data: Record<string, unknown> = { ...s, screen: screen === "advanced" ? "all" : screen, span: String(s.span) };
    if (s.type === "actions") {
      data.durations = s.durations.join(", ");
      data.profiles = s.profiles.join(", ");
    }
    if (s.type === "curve") {
      data.range_min = s.range?.[0];
      data.range_max = s.range?.[1];
    }
    if (s.type === "log") data.filter = s.filter === "all" ? "filter_all" : "filter_writes";
    return data;
  }

  private sectionChanged(index: number, value: Record<string, unknown>): void {
    const list = [...this.normalized.sections];
    const current = list[index];
    const raw: Record<string, unknown> = { ...value, type: current.type, span: Number(value.span) || 1 };
    const screen = value.screen as Screen;
    raw.visibility = screenOf(current.visibility) === "advanced" && screen === "all"
      ? current.visibility
      : screen === "all" ? [] : [{ condition: "screen", media_query: SCREEN_QUERIES[screen] }];
    delete raw.screen;
    if (current.type === "actions") {
      raw.durations = String(value.durations ?? "").split(/[,;\s]+/).filter(Boolean).map((v) => Number(v.replace(",", ".")));
      raw.profiles = String(value.profiles ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    }
    if (current.type === "curve") {
      const a = Number(value.range_min);
      const b = Number(value.range_max);
      raw.range = value.range_min !== undefined && value.range_max !== undefined && a < b ? [a, b] : undefined;
      delete raw.range_min;
      delete raw.range_max;
    }
    if (current.type === "log") raw.filter = value.filter === "filter_writes" ? "writes" : "all";
    list[index] = makeSection(current.type, raw, undefined, this.normalized.admin_only_settings);
    this.setSections(list);
  }

  private computeLabel = (item: { name: string }) => {
    const text = this.t(`editor.${item.name}`);
    return text === `editor.${item.name}` ? item.name : text;
  };

  private computeHelper = (item: { name: string }) => {
    const key = `editor.${item.name}_help`;
    const text = this.t(key);
    return text === key ? undefined : text;
  };

  protected render() {
    if (!this.hass || !this.config) return nothing;
    const t = this.t;
    const n = this.normalized;
    const enabled = new Map(n.sections.map((s, i) => [s.type, i]));
    const order: SectionId[] = [...n.sections.map((s) => s.type), ...SECTIONS.filter((id) => !enabled.has(id))];
    return html`
      <div class="presets" role="group" aria-label=${t("editor.presets")}>
        ${PRESETS.map((p) => html`<button class="btn" title=${t(`editor.preset.${p}_help`)} @click=${() => this.applyPreset(p)}>
          ${t(`editor.preset.${p}`)}</button>`)}
      </div>
      <ha-form .hass=${this.hass} .schema=${this.generalSchema()} .computeLabel=${this.computeLabel} .computeHelper=${this.computeHelper}
        .data=${{ title: n.title ?? "", layout: n.layout, compact: n.compact, read_only: n.read_only, admin_only_settings: n.admin_only_settings }}
        @value-changed=${(e: CustomEvent<{ value: Record<string, unknown> }>) => this.write({ general: e.detail.value })}></ha-form>
      <h3>${t("editor.sections")}</h3>
      ${order.map((id) => {
        const index = enabled.get(id);
        const on = index !== undefined;
        const s = on ? n.sections[index] : undefined;
        const open = on && this.expanded === id;
        return html`<div class="sec ${on ? "" : "off"}">
          <div class="sec-head">
            <label><input type="checkbox" .checked=${on} @change=${(e: Event) => this.toggleSection(id, (e.target as HTMLInputElement).checked)} />
              <span>${t(`section.${id}`)}</span></label>
            ${on ? html`
              <button class="icon-btn" ?disabled=${index === 0} aria-label=${t("schedule.up")} @click=${() => this.move(index, -1)}>
                <ha-icon icon="mdi:arrow-up"></ha-icon></button>
              <button class="icon-btn" ?disabled=${index === n.sections.length - 1} aria-label=${t("schedule.down")}
                @click=${() => this.move(index, 1)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
              <button class="icon-btn" aria-expanded=${open} aria-label=${t("editor.section_options")}
                @click=${() => (this.expanded = open ? undefined : id)}>
                <ha-icon icon=${open ? "mdi:chevron-up" : "mdi:cog-outline"}></ha-icon></button>` : nothing}
          </div>
          ${open && s ? html`<div class="sec-body">
            ${screenOf(s.visibility) === "advanced" ? html`<div class="alert info">${t("editor.advanced_visibility")}</div>` : nothing}
            <ha-form .hass=${this.hass} .schema=${this.sectionSchema(s)} .data=${this.sectionData(s)}
              .computeLabel=${this.computeLabel} .computeHelper=${this.computeHelper}
              @value-changed=${(e: CustomEvent<{ value: Record<string, unknown> }>) => this.sectionChanged(index, e.detail.value)}></ha-form>
          </div>` : nothing}
        </div>`;
      })}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bms-card-editor": BmsCardEditor;
  }
}
