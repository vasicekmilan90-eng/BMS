/** Hlavní karta a samostatné karty jednotlivých sekcí. */

import { LitElement, html, nothing, css, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";

import type { CardContext } from "./components.js";
import {
  canEdit, estimateRows, normalizeConfig, visibleSections,
  type BmsCardConfig, type NormalizedConfig, type SectionId,
} from "./config.js";
import { createTranslator } from "./i18n.js";
import { BmsStore } from "./store.js";
import { baseStyles } from "./styles.js";
import type { HomeAssistant, LovelaceGridOptions, Snapshot } from "./types.js";

import "./sections/curve.js";
import "./sections/influences.js";
import "./sections/log.js";
import "./sections/modes.js";
import "./sections/profiles.js";
import "./sections/schedules.js";
import "./sections/settings.js";
import "./sections/status.js";

const SECTION_ICONS: Record<SectionId, string> = {
  status: "mdi:thermostat-auto", modes: "mdi:tune-variant", quick_profiles: "mdi:star-outline",
  profiles: "mdi:bookmark-multiple-outline", schedules: "mdi:calendar-clock", curve: "mdi:chart-bell-curve-cumulative",
  influences: "mdi:weather-partly-snowy-rainy", log: "mdi:history", settings: "mdi:cog-outline",
};

function renderSection(id: SectionId, ctx: CardContext): TemplateResult {
  switch (id) {
    case "status": return html`<bms-sec-status .ctx=${ctx}></bms-sec-status>`;
    case "modes": return html`<bms-sec-modes .ctx=${ctx}></bms-sec-modes>`;
    case "quick_profiles": return html`<bms-sec-quick-profiles .ctx=${ctx}></bms-sec-quick-profiles>`;
    case "profiles": return html`<bms-sec-profiles .ctx=${ctx}></bms-sec-profiles>`;
    case "schedules": return html`<bms-sec-schedules .ctx=${ctx}></bms-sec-schedules>`;
    case "curve": return html`<bms-sec-curve .ctx=${ctx}></bms-sec-curve>`;
    case "influences": return html`<bms-sec-influences .ctx=${ctx}></bms-sec-influences>`;
    case "log": return html`<bms-sec-log .ctx=${ctx}></bms-sec-log>`;
    case "settings": return html`<bms-sec-settings .ctx=${ctx}></bms-sec-settings>`;
  }
}

export class BmsCard extends LitElement {
  static styles = [baseStyles, css`
    ha-card { overflow: hidden; }
    .loading { padding: 16px; }
    summary.section-header, .section-header { padding: 0; }
  `];

  /** Sekce zobrazené, když konfigurace žádné neurčí. */
  static defaultSections: readonly SectionId[] = [
    "status", "modes", "quick_profiles", "profiles", "schedules", "curve", "influences", "log", "settings",
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: NormalizedConfig;
  @state() private snapshot?: Snapshot;
  @state() private error?: string;
  @state() private open = new Set<SectionId>();
  private detach?: () => void;
  private attachedTo?: BmsStore;

  setConfig(config: BmsCardConfig): void {
    const ctor = this.constructor as typeof BmsCard;
    this.config = normalizeConfig(config, ctor.defaultSections);
    this.open = new Set(this.config.sections.filter((s) => !this.config!.collapsed.includes(s)));
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
    if (!this.hass || !this.config || !this.isConnected) return;
    const store = BmsStore.get(this.config.entry_id);
    if (store === this.attachedTo) return;
    this.detach?.();
    this.attachedTo = store;
    this.detach = store.attach(this.hass, (snapshot, error) => {
      this.snapshot = snapshot;
      this.error = error;
    });
  }

  /** HA nastavuje `hass` při každé změně v systému — překreslujeme jen při změně našich dat. */
  protected shouldUpdate(changed: PropertyValues<this>): boolean {
    if (changed.has("hass")) {
      const old = changed.get("hass") as HomeAssistant | undefined;
      if (!old) {
        this.reattach();
        return true;
      }
      if (this.attachedTo) this.attachedTo.hass = this.hass;
      const relevant = old.language !== this.hass?.language || old.themes?.darkMode !== this.hass?.themes?.darkMode
        || old.user?.is_admin !== this.hass?.user?.is_admin;
      if (changed.size === 1) return relevant;
    }
    return true;
  }

  private toggle(id: SectionId, isOpen: boolean): void {
    const next = new Set(this.open);
    if (isOpen) next.add(id);
    else next.delete(id);
    this.open = next;
  }

  protected render() {
    const config = this.config;
    if (!config || !this.hass) return nothing;
    const lang = this.hass.locale?.language ?? this.hass.language;
    const t = createTranslator(lang);
    if (!this.snapshot) {
      return html`<ha-card><div class="loading ${this.error ? "alert error" : "muted"}">
        ${this.error ? t("card.not_loaded", { error: this.error }) : t("card.loading")}</div></ha-card>`;
    }
    const isAdmin = this.hass.user?.is_admin ?? true;
    const ctx: CardContext = {
      hass: this.hass, snap: this.snapshot, store: BmsStore.get(config.entry_id), t, lang,
      config, editable: canEdit(config, isAdmin), canAct: !config.read_only,
    };
    const sections = visibleSections(config, isAdmin);
    return html`<ha-card>
      ${sections.map((id) => {
        if (id === "status") return html`<div class="section">${renderSection(id, ctx)}</div>`;
        const isOpen = this.open.has(id);
        const title = html`<ha-icon icon=${SECTION_ICONS[id]}></ha-icon><span>${t(`section.${id}`)}</span>`;
        if (sections.length === 1) {
          return html`<div class="section"><div class="section-header">${title}</div>${renderSection(id, ctx)}</div>`;
        }
        return html`<details class="section" ?open=${isOpen}
          @toggle=${(e: Event) => this.toggle(id, (e.target as HTMLDetailsElement).open)}>
          <summary class="section-header">${title}<span class="spacer"></span>
            <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon></summary>
          ${isOpen ? renderSection(id, ctx) : nothing}
        </details>`;
      })}
    </ha-card>`;
  }

  getCardSize(): number {
    return estimateRows(this.config?.sections ?? [], this.config?.compact ?? false);
  }

  getGridOptions(): LovelaceGridOptions {
    const sections = this.config?.sections ?? [];
    const wide = sections.some((s) => ["curve", "influences", "settings", "modes"].includes(s)) || sections.length > 2;
    return { columns: wide ? "full" : 6, rows: "auto", min_columns: wide ? 6 : 3 };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("bms-card-editor");
  }

  static getStubConfig(): Partial<BmsCardConfig> {
    return {};
  }
}

// ── Samostatné karty (stejná logika, jiná výchozí sada sekcí) ────────────────
export class BmsStatusCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["status"];
}
export class BmsModesCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["modes"];
}
export class BmsProfilesCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["quick_profiles", "profiles", "schedules"];
}
export class BmsCurveCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["curve"];
}
export class BmsInfluencesCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["influences"];
}
export class BmsLogCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["log"];
}
export class BmsSettingsCard extends BmsCard {
  static defaultSections: readonly SectionId[] = ["settings"];
}
