/** Hlavní karta a samostatné karty jednotlivých sekcí. */

import { LitElement, html, nothing, css, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";

import type { CardContext } from "./components.js";
import { checkConditions, conditionEntities, mediaQueries } from "./conditions.js";
import {
  canEdit, estimateRows, normalizeConfig,
  type BmsCardConfig, type NormalizedConfig, type NormalizedSection, type SectionId,
} from "./config.js";
import { createTranslator } from "./i18n.js";
import { BmsStore } from "./store.js";
import { baseStyles } from "./styles.js";
import { sectionSummary } from "./summary.js";
import type { HomeAssistant, LovelaceGridOptions, Snapshot } from "./types.js";

import "./sections/actions.js";
import "./sections/automations.js";
import "./sections/curve.js";
import "./sections/influences.js";
import "./sections/log.js";
import "./sections/profiles.js";
import "./sections/settings.js";
import "./sections/status.js";

const SECTION_ICONS: Record<SectionId, string> = {
  status: "mdi:thermostat-auto", actions: "mdi:gesture-tap-button", profiles: "mdi:bookmark-multiple-outline",
  automations: "mdi:robot-outline", curve: "mdi:chart-bell-curve-cumulative", influences: "mdi:weather-partly-snowy-rainy",
  log: "mdi:history", settings: "mdi:cog-outline",
};
/** Šířka karty, od které se v rozložení `auto` použijí dva sloupce. */
const COLUMNS_MIN_WIDTH = 900;

function renderSection(s: NormalizedSection, ctx: CardContext): TemplateResult {
  switch (s.type) {
    case "status": return html`<bms-sec-status .ctx=${ctx} .options=${s}></bms-sec-status>`;
    case "actions": return html`<bms-sec-actions .ctx=${ctx} .options=${s}></bms-sec-actions>`;
    case "profiles": return html`<bms-sec-profiles .ctx=${ctx} .options=${s}></bms-sec-profiles>`;
    case "automations": return html`<bms-sec-automations .ctx=${ctx} .options=${s}></bms-sec-automations>`;
    case "curve": return html`<bms-sec-curve .ctx=${ctx} .options=${s}></bms-sec-curve>`;
    case "influences": return html`<bms-sec-influences .ctx=${ctx} .options=${s}></bms-sec-influences>`;
    case "log": return html`<bms-sec-log .ctx=${ctx} .options=${s}></bms-sec-log>`;
    case "settings": return html`<bms-sec-settings .ctx=${ctx} .options=${s}></bms-sec-settings>`;
  }
}

export class BmsCard extends LitElement {
  static styles = [baseStyles, css`
    ha-card { overflow: hidden; }
    .loading { padding: 16px; }
    .body.cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); margin-top: -1px; }
    .body.cols .section { border-top: 1px solid var(--bms-border); }
    .body.cols .wide { grid-column: 1 / -1; }
    .body.cols .section:not(.wide) { box-shadow: inset -1px 0 0 var(--bms-border); }
    summary.section-header { margin: 0; min-height: 28px; }
    details[open] > summary.section-header { margin-bottom: 10px; }
    .summary { font-weight: 400; font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; text-align: right; }
    details[open] .summary { display: none; }
    .warnings { padding: 8px 16px; }
  `];

  /** Sekce zobrazené, když konfigurace žádné neurčí (mohou být i ve starém zápisu). */
  static defaultSections: readonly string[] = [
    "status", "actions", "profiles", "automations", "curve", "influences", "log", "settings",
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: NormalizedConfig;
  @state() private snapshot?: Snapshot;
  @state() private error?: string;
  @state() private open = new Map<number, boolean>();
  @state() private wide = false;
  private detach?: () => void;
  private attachedTo?: BmsStore;
  private resizeObserver?: ResizeObserver;
  private mediaLists: MediaQueryList[] = [];
  private readonly onMediaChange = () => this.requestUpdate();

  setConfig(config: BmsCardConfig): void {
    const ctor = this.constructor as typeof BmsCard;
    this.config = normalizeConfig(config, ctor.defaultSections);
    this.open = new Map();
    this.watchMedia();
    this.reattach();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.reattach();
    this.watchMedia();
    this.resizeObserver ??= new ResizeObserver((entries) => {
      const wide = (entries[0]?.contentRect.width ?? 0) >= COLUMNS_MIN_WIDTH;
      if (wide !== this.wide) this.wide = wide;
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detach?.();
    this.detach = undefined;
    this.attachedTo = undefined;
    this.resizeObserver?.disconnect();
    this.unwatchMedia();
  }

  private watchMedia(): void {
    this.unwatchMedia();
    if (!this.config || !this.isConnected || typeof window.matchMedia !== "function") return;
    const queries = mediaQueries(this.config.sections.flatMap((s) => s.visibility));
    this.mediaLists = queries.map((q) => window.matchMedia(q));
    for (const mql of this.mediaLists) mql.addEventListener("change", this.onMediaChange);
  }

  private unwatchMedia(): void {
    for (const mql of this.mediaLists) mql.removeEventListener("change", this.onMediaChange);
    this.mediaLists = [];
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
      const entities = conditionEntities(this.config?.sections.flatMap((s) => s.visibility) ?? []);
      const relevant = old.language !== this.hass?.language || old.themes?.darkMode !== this.hass?.themes?.darkMode
        || old.user?.is_admin !== this.hass?.user?.is_admin
        || entities.some((id) => old.states[id] !== this.hass?.states[id]);
      if (changed.size === 1) return relevant;
    }
    return true;
  }

  private visible(config: NormalizedConfig, isAdmin: boolean): NormalizedSection[] {
    const hass = this.hass!;
    const env = {
      states: hass.states,
      userId: hass.user?.id,
      matches: (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches,
    };
    return config.sections.filter((s) => (isAdmin || !s.admin_only) && checkConditions(s.visibility, env));
  }

  private columns(config: NormalizedConfig, count: number): boolean {
    if (count < 2) return false;
    return config.layout === "columns" || (config.layout === "auto" && this.wide);
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
    const snap = this.snapshot;
    const ctx: CardContext = {
      hass: this.hass, snap, store: BmsStore.get(config.entry_id), t, lang,
      config, editable: canEdit(config, isAdmin), canAct: !config.read_only,
    };
    const sections = this.visible(config, isAdmin);
    const cols = this.columns(config, sections.length);
    const now = Date.now() / 1000;
    return html`<ha-card>
      <div class="body ${cols ? "cols" : ""}">
        ${sections.map((s) => {
          const cls = `section ${s.span === 2 ? "wide" : ""}`;
          if (s.type === "status") return html`<div class=${cls}>${renderSection(s, ctx)}</div>`;
          const title = html`<ha-icon icon=${SECTION_ICONS[s.type]}></ha-icon><span>${t(`section.${s.type}`)}</span>`;
          if (sections.length === 1) {
            return html`<div class=${cls}><div class="section-header">${title}</div>${renderSection(s, ctx)}</div>`;
          }
          const index = config.sections.indexOf(s);
          const isOpen = this.open.get(index) ?? !s.collapsed;
          return html`<details class=${cls} ?open=${isOpen}
            @toggle=${(e: Event) => {
              const next = (e.target as HTMLDetailsElement).open;
              if (next !== isOpen) this.open = new Map(this.open).set(index, next);
            }}>
            <summary class="section-header">${title}
              ${isOpen ? html`<span class="spacer"></span>` : html`<span class="summary">${sectionSummary(s.type, snap, t, lang, now)}</span>`}
              <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon></summary>
            ${isOpen ? renderSection(s, ctx) : nothing}
          </details>`;
        })}
      </div>
      ${config.warnings.length && isAdmin ? html`<div class="warnings small muted">
        ${t("card.config_warnings", { list: config.warnings.join(", ") })}</div>` : nothing}
    </ha-card>`;
  }

  getCardSize(): number {
    return estimateRows(this.config?.sections ?? [], this.config?.compact ?? false);
  }

  getGridOptions(): LovelaceGridOptions {
    const sections = this.config?.sections ?? [];
    const wide = this.config?.layout === "columns"
      || sections.some((s) => ["curve", "influences", "settings"].includes(s.type)) || sections.length > 2;
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
  static defaultSections: readonly string[] = ["status"];
}
export class BmsActionsCard extends BmsCard {
  static defaultSections: readonly string[] = ["actions"];
}
export class BmsAutomationsCard extends BmsCard {
  static defaultSections: readonly string[] = ["automations"];
}
/** Karta z 0.2 — převádí se na akce a automatiky. */
export class BmsModesCard extends BmsCard {
  static defaultSections: readonly string[] = ["modes"];
}
export class BmsProfilesCard extends BmsCard {
  static defaultSections: readonly string[] = ["quick_profiles", "profiles", "schedules"];
}
export class BmsCurveCard extends BmsCard {
  static defaultSections: readonly string[] = ["curve"];
}
export class BmsInfluencesCard extends BmsCard {
  static defaultSections: readonly string[] = ["influences"];
}
export class BmsLogCard extends BmsCard {
  static defaultSections: readonly string[] = ["log"];
}
export class BmsSettingsCard extends BmsCard {
  static defaultSections: readonly string[] = ["settings"];
}
