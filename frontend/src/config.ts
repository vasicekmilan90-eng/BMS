/** Konfigurace karty a výběr sekcí (čisté funkce, testované). */

export const SECTIONS = [
  "status",
  "modes",
  "quick_profiles",
  "profiles",
  "schedules",
  "curve",
  "influences",
  "log",
  "settings",
] as const;

export type SectionId = (typeof SECTIONS)[number];

export const MODES = ["boost", "reduction", "frost", "night", "bypass"] as const;
export type ModeId = (typeof MODES)[number];

/** Sekce, které mění nastavení regulátoru — ne-administrátorům se skryjí. */
export const ADMIN_SECTIONS: readonly SectionId[] = ["profiles", "schedules", "settings"];

export interface BmsCardConfig {
  type: string;
  title?: string;
  entry_id?: string;
  sections?: SectionId[];
  modes?: ModeId[];
  compact?: boolean;
  read_only?: boolean;
  admin_only_settings?: boolean;
  curve_editor?: boolean;
  collapsed?: SectionId[];
}

export interface NormalizedConfig {
  type: string;
  title?: string;
  entry_id?: string;
  sections: SectionId[];
  modes: ModeId[];
  compact: boolean;
  read_only: boolean;
  admin_only_settings: boolean;
  curve_editor: boolean;
  collapsed: SectionId[];
}

function pick<T extends string>(values: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(values)) return [...fallback];
  const result: T[] = [];
  for (const v of values) {
    if (allowed.includes(v as T) && !result.includes(v as T)) result.push(v as T);
  }
  return result;
}

export function normalizeConfig(config: Partial<BmsCardConfig> | undefined, defaultSections: readonly SectionId[]): NormalizedConfig {
  if (config !== undefined && (typeof config !== "object" || config === null)) {
    throw new Error("Neplatná konfigurace karty");
  }
  const c = config ?? {};
  return {
    type: c.type ?? "custom:bms-master-card",
    title: typeof c.title === "string" && c.title.trim() ? c.title : undefined,
    entry_id: typeof c.entry_id === "string" ? c.entry_id : undefined,
    sections: pick(c.sections, SECTIONS, defaultSections),
    modes: pick(c.modes, MODES, MODES),
    compact: c.compact === true,
    read_only: c.read_only === true,
    admin_only_settings: c.admin_only_settings !== false,
    curve_editor: c.curve_editor !== false,
    collapsed: pick(c.collapsed, SECTIONS, ["log", "settings"]),
  };
}

/** Sekce skutečně zobrazené danému uživateli. */
export function visibleSections(config: NormalizedConfig, isAdmin: boolean): SectionId[] {
  if (isAdmin || !config.admin_only_settings) return config.sections;
  return config.sections.filter((s) => !ADMIN_SECTIONS.includes(s));
}

export function canEdit(config: NormalizedConfig, isAdmin: boolean): boolean {
  if (config.read_only) return false;
  return isAdmin || !config.admin_only_settings;
}

/** Přibližná výška v řádcích sections view (1 řádek = 56 px). */
export function estimateRows(sections: readonly SectionId[], compact: boolean): number {
  const size: Record<SectionId, number> = {
    status: 3, modes: 3, quick_profiles: 2, profiles: 3, schedules: 3,
    curve: 6, influences: 7, log: 4, settings: 6,
  };
  const rows = sections.reduce((sum, s) => sum + size[s], 0);
  return Math.max(2, compact ? Math.ceil(rows * 0.6) : rows);
}
