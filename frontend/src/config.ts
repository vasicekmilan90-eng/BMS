/** Konfigurace karty: sekce s vlastními volbami, převod starého zápisu a předvolby (čisté funkce). */

export const SECTIONS = ["status", "actions", "profiles", "automations", "curve", "influences", "log", "settings"] as const;
export type SectionId = (typeof SECTIONS)[number];

/** Zápis z verze 0.2 — převádí se na nové sekce. */
const LEGACY_SECTIONS = ["modes", "quick_profiles", "schedules"] as const;

export const STATUS_ITEMS = ["result", "thermostat", "breakdown", "facts", "trend", "next", "alerts", "main_switch", "refresh"] as const;
export const DIRECTIONS = ["boost", "reduction"] as const;
export const AUTOMATIONS = ["frost", "night", "bypass"] as const;
export const PROFILE_TABS = ["manage", "schedules"] as const;
export const PROFILE_ACTIONS = ["load", "save", "rename", "delete", "star", "transfer"] as const;
export const CURVE_SERIES = ["modified", "result", "limits", "safe_point", "current"] as const;
export const CURVE_EDITORS = ["none", "shift", "points", "full"] as const;
export const INFLUENCE_ITEMS = ["vitr", "srazky", "vlhkost", "oblacnost", "slunce"] as const;
export const SETTINGS_GROUPS = ["limits", "fallback", "temporary", "forecast", "recalc"] as const;
export const LAYOUTS = ["auto", "single", "columns"] as const;
export const PRESETS = ["family", "technician", "mobile", "overview"] as const;
/** Staré názvy režimů (0.2) → nové sekce. */
export const MODES = ["boost", "reduction", "frost", "night", "bypass"] as const;
export type ModeId = (typeof MODES)[number];

export type Layout = (typeof LAYOUTS)[number];
export type Preset = (typeof PRESETS)[number];

export interface Condition {
  condition: "state" | "numeric_state" | "screen" | "user" | "and" | "or";
  entity?: string;
  state?: string | string[];
  state_not?: string | string[];
  above?: number;
  below?: number;
  media_query?: string;
  users?: string[];
  conditions?: Condition[];
}

export interface SectionOptions {
  status: { show: (typeof STATUS_ITEMS)[number][] };
  actions: { show: ("temporary" | "profiles")[]; directions: (typeof DIRECTIONS)[number][]; durations: number[]; profiles: string[] };
  profiles: { tabs: (typeof PROFILE_TABS)[number][]; allow: (typeof PROFILE_ACTIONS)[number][] };
  automations: { items: (typeof AUTOMATIONS)[number][]; controls: "status" | "full" };
  curve: {
    series: (typeof CURVE_SERIES)[number][];
    editor: (typeof CURVE_EDITORS)[number];
    simulate: boolean;
    /** Rozsah osy venkovní teploty; bez něj podle nastavení regulátoru. */
    range?: [number, number];
  };
  influences: { items: (typeof INFLUENCE_ITEMS)[number][]; chart: boolean; controls: "values" | "full" };
  log: { limit: number; filter: "all" | "writes" };
  settings: { groups: (typeof SETTINGS_GROUPS)[number][] };
}

export interface SectionCommon {
  collapsed: boolean;
  admin_only: boolean;
  span: 1 | 2;
  visibility: Condition[];
}

export type SectionOf<K extends SectionId> = { type: K } & SectionCommon & SectionOptions[K];
export type NormalizedSection = { [K in SectionId]: SectionOf<K> }[SectionId];

export type SectionConfig = SectionId | ({ type: SectionId } & Partial<SectionCommon> & Record<string, unknown>);

export interface BmsCardConfig {
  type: string;
  title?: string;
  entry_id?: string;
  preset?: Preset;
  layout?: Layout;
  sections?: (SectionConfig | (typeof LEGACY_SECTIONS)[number])[];
  compact?: boolean;
  read_only?: boolean;
  admin_only_settings?: boolean;
  // zápis 0.2
  modes?: ModeId[];
  collapsed?: string[];
  curve_editor?: boolean;
}

export interface NormalizedConfig {
  type: string;
  title?: string;
  entry_id?: string;
  layout: Layout;
  sections: NormalizedSection[];
  compact: boolean;
  read_only: boolean;
  admin_only_settings: boolean;
  warnings: string[];
}

export const SECTION_DEFAULTS: { [K in SectionId]: SectionOptions[K] } = {
  status: { show: [...STATUS_ITEMS] },
  actions: { show: ["temporary", "profiles"], directions: [...DIRECTIONS], durations: [1, 2, 4], profiles: [] },
  profiles: { tabs: [...PROFILE_TABS], allow: [...PROFILE_ACTIONS] },
  automations: { items: [...AUTOMATIONS], controls: "full" },
  curve: { series: [...CURVE_SERIES], editor: "full", simulate: true },
  influences: { items: [...INFLUENCE_ITEMS], chart: true, controls: "full" },
  log: { limit: 20, filter: "all" },
  settings: { groups: [...SETTINGS_GROUPS] },
};

const DEFAULT_COLLAPSED: readonly SectionId[] = ["log", "settings"];
/** Sekce, které mění nastavení — ve výchozím stavu jen pro administrátory. */
export const ADMIN_SECTIONS: readonly SectionId[] = ["profiles", "settings"];

export const PRESET_CONFIGS: Record<Preset, Partial<BmsCardConfig>> = {
  family: {
    layout: "single",
    sections: [
      { type: "status", show: ["result", "thermostat", "breakdown", "alerts", "next"] },
      "actions",
      { type: "automations", controls: "status" },
    ],
  },
  technician: { layout: "auto", sections: [...SECTIONS] },
  mobile: {
    layout: "single",
    compact: true,
    sections: [
      { type: "status", show: ["result", "thermostat", "alerts", "main_switch"] },
      { type: "actions", durations: [1, 3] },
    ],
  },
  overview: {
    layout: "auto",
    read_only: true,
    sections: [
      { type: "status", show: ["result", "thermostat", "breakdown", "trend", "alerts", "next"] },
      { type: "curve", editor: "none", simulate: false },
      { type: "influences", controls: "values" },
    ],
  },
};

function pickList<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const out: T[] = [];
  for (const v of value) if (allowed.includes(v as T) && !out.includes(v as T)) out.push(v as T);
  return out;
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeOptions(type: SectionId, raw: Record<string, unknown>): SectionOptions[SectionId] {
  switch (type) {
    case "status":
      return { show: pickList(raw.show, STATUS_ITEMS, SECTION_DEFAULTS.status.show) };
    case "actions": {
      const d = SECTION_DEFAULTS.actions;
      const durations = Array.isArray(raw.durations)
        ? raw.durations.map(Number).filter((h) => Number.isFinite(h) && h > 0 && h <= 24).slice(0, 6)
        : d.durations;
      return {
        show: pickList(raw.show, ["temporary", "profiles"] as const, d.show),
        directions: pickList(raw.directions, DIRECTIONS, d.directions),
        durations: durations.length ? durations : d.durations,
        profiles: Array.isArray(raw.profiles) ? raw.profiles.filter((p): p is string => typeof p === "string") : [],
      };
    }
    case "profiles":
      return {
        tabs: pickList(raw.tabs, PROFILE_TABS, SECTION_DEFAULTS.profiles.tabs),
        allow: pickList(raw.allow, PROFILE_ACTIONS, SECTION_DEFAULTS.profiles.allow),
      };
    case "automations":
      return {
        items: pickList(raw.items, AUTOMATIONS, SECTION_DEFAULTS.automations.items),
        controls: pickOne(raw.controls, ["status", "full"] as const, "full"),
      };
    case "curve": {
      const range = Array.isArray(raw.range) ? raw.range.map(Number) : [];
      return {
        series: pickList(raw.series, CURVE_SERIES, SECTION_DEFAULTS.curve.series),
        editor: pickOne(raw.editor, CURVE_EDITORS, "full"),
        simulate: raw.simulate !== false,
        ...(range.length === 2 && range.every(Number.isFinite) && range[0] < range[1]
          ? { range: [range[0], range[1]] as [number, number] } : {}),
      };
    }
    case "influences":
      return {
        items: pickList(raw.items, INFLUENCE_ITEMS, SECTION_DEFAULTS.influences.items),
        chart: raw.chart !== false,
        controls: pickOne(raw.controls, ["values", "full"] as const, "full"),
      };
    case "log": {
      const limit = Number(raw.limit);
      return {
        limit: Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 20,
        filter: pickOne(raw.filter, ["all", "writes"] as const, "all"),
      };
    }
    case "settings":
      return { groups: pickList(raw.groups, SETTINGS_GROUPS, SECTION_DEFAULTS.settings.groups) };
  }
}

export function makeSection(
  type: SectionId, raw: Record<string, unknown> = {}, legacyCollapsed?: Set<string>, adminOnlySettings = true,
): NormalizedSection {
  const collapsed = typeof raw.collapsed === "boolean"
    ? raw.collapsed
    : legacyCollapsed ? legacyCollapsed.has(type) : DEFAULT_COLLAPSED.includes(type);
  const span = raw.span === 2 ? 2 : 1;
  return {
    type,
    collapsed: type === "status" ? false : collapsed,
    admin_only: typeof raw.admin_only === "boolean" ? raw.admin_only : adminOnlySettings && ADMIN_SECTIONS.includes(type),
    span,
    visibility: Array.isArray(raw.visibility) ? (raw.visibility as Condition[]) : [],
    ...normalizeOptions(type, raw),
  } as NormalizedSection;
}

const idOf = (s: unknown): string | undefined =>
  typeof s === "string" ? s : typeof s === "object" && s !== null ? String((s as { type?: unknown }).type) : undefined;

/** Převede zápis 0.2 (modes, quick_profiles, schedules, collapsed, curve_editor) na nové sekce. */
function expandLegacy(config: BmsCardConfig, warnings: string[]): SectionConfig[] {
  const raw = config.sections ?? [];
  const modes: readonly string[] = Array.isArray(config.modes) ? config.modes : MODES;
  const ids = raw.map(idOf);
  const legacy = ids.some((id) => (LEGACY_SECTIONS as readonly (string | undefined)[]).includes(id))
    || config.modes !== undefined || config.curve_editor !== undefined;
  const out: SectionConfig[] = [];
  const has = (id: string) => out.some((s) => idOf(s) === id);
  for (const item of raw) {
    const id = idOf(item);
    if (id === "modes" || id === "quick_profiles") {
      const directions = DIRECTIONS.filter((m) => modes.includes(m));
      const temporary = ids.includes("modes") && directions.length > 0;
      const profiles = ids.includes("quick_profiles");
      if (!has("actions") && (temporary || profiles)) {
        out.push({
          type: "actions",
          show: [...(temporary ? ["temporary"] : []), ...(profiles ? ["profiles"] : [])],
          directions: directions.length ? [...directions] : [...DIRECTIONS],
        });
      }
      const autos = AUTOMATIONS.filter((m) => modes.includes(m));
      if (id === "modes" && autos.length && !has("automations")) out.push({ type: "automations", items: [...autos] });
    } else if ((id === "schedules" || (id === "profiles" && typeof item === "string")) && ids.includes("schedules")) {
      if (!has("profiles")) out.push({ type: "profiles", tabs: ids.includes("profiles") ? [...PROFILE_TABS] : ["schedules"] });
    } else if (id === "profiles" && typeof item === "string" && legacy) {
      out.push({ type: "profiles", tabs: ["manage"] });
    } else if (id === "curve" && typeof item === "string" && config.curve_editor === false) {
      out.push({ type: "curve", editor: "none" });
    } else if (id !== undefined && (SECTIONS as readonly string[]).includes(id)) {
      if (!has(id)) out.push(item as SectionConfig);
      else warnings.push(`duplicate:${id}`);
    } else {
      warnings.push(`unknown:${String(id)}`);
    }
  }
  return out;
}

export function normalizeConfig(
  config: Partial<BmsCardConfig> | undefined, defaultSections: readonly string[] = SECTIONS,
): NormalizedConfig {
  if (config !== undefined && (typeof config !== "object" || config === null)) {
    throw new Error("Neplatná konfigurace karty");
  }
  const warnings: string[] = [];
  let c: BmsCardConfig = { type: "custom:bms-master-card", ...(config ?? {}) };
  if (c.preset && PRESETS.includes(c.preset)) {
    const preset = PRESET_CONFIGS[c.preset];
    c = { ...preset, ...c, sections: c.sections ?? preset.sections };
  } else if (c.preset) {
    warnings.push(`preset:${String(c.preset)}`);
  }
  const sectionList = Array.isArray(c.sections) ? c.sections : (defaultSections as BmsCardConfig["sections"]);
  const expanded = expandLegacy({ ...c, sections: sectionList }, warnings);
  const legacyCollapsed = Array.isArray(c.collapsed)
    ? new Set(c.collapsed.flatMap((id) => (id === "modes" || id === "quick_profiles" ? ["actions", "automations"]
      : id === "schedules" ? ["profiles"] : [id])))
    : undefined;
  const adminOnly = c.admin_only_settings !== false;
  const sections = expanded.map((s) => {
    const raw = typeof s === "string" ? { type: s } : (s as Record<string, unknown>);
    return makeSection(raw.type as SectionId, raw, legacyCollapsed, adminOnly);
  });
  return {
    type: c.type,
    title: typeof c.title === "string" && c.title.trim() ? c.title : undefined,
    entry_id: typeof c.entry_id === "string" ? c.entry_id : undefined,
    layout: pickOne(c.layout, LAYOUTS, "auto"),
    sections,
    compact: c.compact === true,
    read_only: c.read_only === true,
    admin_only_settings: adminOnly,
    warnings,
  };
}

/** Zapíše sekci jen s hodnotami odlišnými od výchozích (čistší YAML z editoru). */
export function compactSection(section: NormalizedSection, adminOnlySettings = true): SectionConfig {
  const defaults = makeSection(section.type, {}, undefined, adminOnlySettings) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { type: section.type };
  for (const [key, value] of Object.entries(section)) {
    if (key !== "type" && JSON.stringify(value) !== JSON.stringify(defaults[key])) out[key] = value;
  }
  return Object.keys(out).length === 1 ? section.type : (out as SectionConfig);
}

export function canEdit(config: NormalizedConfig, isAdmin: boolean): boolean {
  if (config.read_only) return false;
  return isAdmin || !config.admin_only_settings;
}

/** Přibližná výška v řádcích sections view (1 řádek = 56 px). */
export function estimateRows(sections: readonly { type: SectionId; collapsed: boolean }[], compact: boolean): number {
  const size: Record<SectionId, number> = {
    status: 4, actions: 2, profiles: 3, automations: 3, curve: 6, influences: 6, log: 4, settings: 5,
  };
  const rows = sections.reduce((sum, s) => sum + (s.collapsed ? 1 : size[s.type]), 0);
  return Math.max(2, compact ? Math.ceil(rows * 0.7) : rows);
}
