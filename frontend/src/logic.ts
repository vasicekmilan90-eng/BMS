/** Odvozené stavy a texty pro zobrazení (čisté funkce, testované). */

import { formatNumber, formatSigned, type Translator } from "./i18n.js";
import type { CalcLogEntry, CalcResult, CurvePoint, ScheduleRule, Snapshot } from "./types.js";

export type RegulationState = "inactive" | "boost" | "reduction" | "frost" | "night" | "bypass" | "safe" | "active";

export const SUN_MODES = ["okno", "fasada", "nad_obzorem"] as const;
export type SunMode = (typeof SUN_MODES)[number];

/** Jakou část doby nad obzorem (podle vzorků dráhy) pokrývá pevné okno azimutu. */
export function sunCoverage(path: [number, number][], start: number, end: number): number {
  const up = path.filter(([, el]) => el > 0);
  if (!up.length || end <= start) return 0;
  return up.filter(([az]) => az >= start && az <= end).length / up.length;
}

export function regulationState(snap: Snapshot): RegulationState {
  const r = snap.result;
  if (!snap.settings.hlavni_vypinac) return "inactive";
  if (snap.boost.effective > 0) return "boost";
  if (snap.boost.effective < 0) return "reduction";
  if (r?.safe_mode) return "safe";
  if (r?.bypass_active) return "bypass";
  if (r?.frost_active) return "frost";
  if (r?.night_active) return "night";
  return "active";
}

export interface Correction {
  key: "wind" | "rain" | "humidity" | "clouds" | "sun" | "night" | "boost";
  value: number;
}

export function corrections(snap: Snapshot): Correction[] {
  const r = snap.result;
  if (!r) return [];
  const all: Correction[] = [
    { key: "wind", value: r.corr_wind },
    { key: "rain", value: r.corr_rain },
    { key: "humidity", value: r.corr_humidity },
    { key: "clouds", value: r.corr_clouds },
    { key: "sun", value: r.corr_sun },
    { key: "night", value: r.night_offset },
    { key: "boost", value: r.boost },
  ];
  return all.filter((c) => Math.abs(c.value) >= 0.05);
}

export function remainingMinutes(snap: Snapshot, nowSec: number): number {
  if (!snap.boost.effective || !snap.boost.until) return 0;
  return Math.max(0, Math.round((snap.boost.until - nowSec) / 60));
}

export interface Alert {
  level: "info" | "warning" | "error";
  text: string;
  /** Sekce, kde se dá problém řešit. */
  target?: "curve" | "influences" | "settings";
}

export function alerts(snap: Snapshot, t: Translator, nowSec: number): Alert[] {
  const list: Alert[] = [];
  if (!snap.available) list.push({ level: "error", text: t("alert.calc_error", { error: snap.last_error ?? "" }) });
  if (snap.temp_source === "safe_fallback") {
    const minutes = snap.safe_since ? Math.round((nowSec - snap.safe_since) / 60) : 0;
    list.push({ level: "warning", text: t("alert.safe_mode", { minutes }) });
  } else if (snap.temp_source === "weather") {
    list.push({ level: "info", text: t("alert.weather_source") });
  }
  if (!snap.storage_ok) list.push({ level: "error", text: t("alert.storage") });
  const write = snap.last_write;
  if (write.status === "error") list.push({ level: "error", text: t("alert.thermostat_error", { message: write.message ?? "" }) });
  if (write.status === "unavailable") list.push({ level: "warning", text: t("alert.thermostat_unavailable") });
  const recentClamps = snap.clamp_log.filter((c) => c.ts > nowSec - 6 * 3600);
  if (recentClamps.length >= 3) {
    const over = recentClamps[0].raw > recentClamps[0].clamped;
    list.push({ level: "warning", text: t(over ? "alert.clamp_high" : "alert.clamp_low", { count: recentClamps.length }), target: "curve" });
  }
  if (snap.problems.forecast) list.push({ level: "info", text: t("alert.no_forecast"), target: "influences" });
  return list;
}

/** Součet korekcí počasí (vítr, srážky, vlhkost, oblačnost, slunce). */
export function weatherCorrection(r: CalcResult | null): number {
  if (!r) return 0;
  return r.corr_wind + r.corr_rain + r.corr_humidity + r.corr_clouds + r.corr_sun;
}

/** Jedna věta „proč právě tahle teplota“ + případné omezení limitem zvlášť (jiná barva). */
export function reasonSentence(snap: Snapshot, t: Translator, language: string): { text: string; limit?: string } {
  const r = snap.result;
  if (!r) return { text: "" };
  const parts: string[] = [];
  if (r.safe_mode) {
    parts.push(t("reason.safe", { value: formatNumber(r.raw, language, 0) }));
  } else {
    parts.push(t("reason.curve", { value: formatNumber(r.curve_temp, language, 0) }));
    const weather = weatherCorrection(r);
    if (Math.abs(weather) >= 0.05) parts.push(t("reason.weather", { value: formatSigned(weather, language) }));
    if (Math.abs(r.night_offset) >= 0.05) parts.push(t("reason.night", { value: formatSigned(r.night_offset, language) }));
    if (Math.abs(r.boost) >= 0.05) {
      parts.push(t(r.boost > 0 ? "reason.boost" : "reason.reduction", { value: formatSigned(r.boost, language) }));
    }
  }
  let limit: string | undefined;
  if (r.clamped) {
    limit = r.raw > r.result
      ? t("reason.limit_max", { value: formatNumber(r.t_max, language, 0) })
      : t("reason.limit_min", { value: formatNumber(r.t_min, language, 0) });
  }
  if (r.frost_active && !r.clamped) parts.push(t("reason.frost"));
  return { text: parts.join(", "), limit };
}

/** „1 h 25 min“ / „25 min“. */
export function formatDuration(minutes: number, t: Translator): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? t("time.hours_minutes", { h, m: m % 60 }) : t("time.minutes", { m });
}

/** Události, které zajímají uživatele (bez pravidelného přepočtu). */
export function userEvents(snap: Snapshot, limit = 2): Snapshot["next_events"] {
  return snap.next_events.filter((e) => e.kind !== "recalc").slice(0, limit);
}

export function describeRule(rule: ScheduleRule, t: Translator, language: string): string {
  if (rule.type === "date") {
    const fmt = new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric", timeZone: "UTC" });
    const date = (v: string) => {
      if (!MMDD.test(v)) return v || "?";
      const { month, day } = parseMmdd(v);
      return fmt.format(new Date(Date.UTC(2024, month - 1, day)));
    };
    return t("schedule.desc_date", { from: date(rule.date_from), to: date(rule.date_to), profile: rule.profile });
  }
  return t(rule.temp_op === "<" ? "schedule.desc_temp_below" : "schedule.desc_temp_above", {
    value: formatNumber(rule.temp_val, language, 1),
    days: rule.temp_days,
    profile: rule.profile,
  });
}

export interface LogLine {
  kind: "event" | "calc";
  tone: "boost" | "reduction" | "warning" | "frost" | "night" | "clamped" | "normal";
  title: string;
  detail?: string;
  tags: string[];
}

export function describeLogEntry(entry: CalcLogEntry, t: Translator, language: string): LogLine {
  if (entry.event) {
    const amount = formatNumber(Math.abs(entry.amount ?? 0), language, 1);
    const hours = formatNumber(entry.hours ?? 0, language, 1);
    const tone = entry.event.startsWith("boost_start") ? "boost"
      : entry.event.startsWith("reduction_start") ? "reduction" : "warning";
    return { kind: "event", tone, title: t(`log.event.${entry.event}`, { amount, hours }), tags: [] };
  }
  const tags: string[] = [];
  if (entry.manual) tags.push(t("log.tag.manual"));
  if (entry.frost) tags.push(t("log.tag.frost"));
  if (entry.night) tags.push(t("log.tag.night"));
  if ((entry.boost ?? 0) > 0) tags.push(t("log.tag.boost", { value: formatSigned(entry.boost, language) }));
  if ((entry.boost ?? 0) < 0) tags.push(t("log.tag.reduction", { value: formatSigned(entry.boost, language) }));
  if (entry.clamped) tags.push(t("log.tag.clamped"));
  if (entry.safe) tags.push(t("log.tag.safe"));
  if (entry.bypass) tags.push(t("log.tag.bypass"));
  if (entry.thermostat) tags.push(t(`log.thermostat.${entry.thermostat}`));

  const parts = [t("log.part.curve", { value: formatNumber(entry.curve, language) })];
  const add = (key: string, value: number | undefined) => {
    if (value) parts.push(t(`log.part.${key}`, { value: formatSigned(value, language, 2) }));
  };
  add("wind", entry.corr_wind);
  add("rain", entry.corr_rain);
  add("humidity", entry.corr_hum);
  add("clouds", entry.corr_clouds);
  add("sun", entry.corr_sun);
  add("night", entry.night_offset);
  add("boost", entry.boost);
  let detail = `${parts.join(" ")} = ${formatNumber(entry.raw, language)} °C`;
  if (entry.clamped) detail += ` → ${formatNumber(entry.result, language)} °C`;

  const tone = entry.frost ? "frost" : entry.night ? "night" : (entry.boost ?? 0) > 0 ? "boost"
    : (entry.boost ?? 0) < 0 ? "reduction" : entry.clamped ? "clamped" : "normal";
  return {
    kind: "calc",
    tone,
    title: t("log.calc_title", { out: formatNumber(entry.out, language), result: formatNumber(entry.result, language) }),
    detail,
    tags,
  };
}

// ── Křivka ──────────────────────────────────────────────────────────────────
export function sortPoints(points: CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a.x - b.x);
}

export function validatePoints(points: CurvePoint[]): "ok" | "too_few" | "duplicate_x" | "invalid" {
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "invalid";
  if (points.length < 2) return "too_few";
  const xs = new Set(points.map((p) => p.x));
  return xs.size === points.length ? "ok" : "duplicate_x";
}

export function interpolate(points: CurvePoint[], x: number): number {
  const pts = sortPoints(points);
  if (!pts.length) return Number.NaN;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (x >= a.x && x <= b.x) return b.x === a.x ? a.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return pts[pts.length - 1].y;
}

/** Nový bod doprostřed největší mezery na ose x. */
export function suggestPoint(points: CurvePoint[]): CurvePoint {
  const pts = sortPoints(points);
  if (pts.length < 2) return { x: 0, y: 40 };
  let best = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i + 1].x - pts[i].x > pts[best + 1].x - pts[best].x) best = i;
  }
  const x = Math.round((pts[best].x + pts[best + 1].x) / 2);
  return { x, y: Math.round(interpolate(pts, x) * 2) / 2 };
}

export function pointsEqual(a: CurvePoint[], b: CurvePoint[]): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

// ── Plány ───────────────────────────────────────────────────────────────────
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function validateRule(rule: Partial<ScheduleRule>): string | null {
  if (!rule.profile) return "schedule.error.profile";
  if (rule.type === "date") {
    if (!MMDD.test(rule.date_from ?? "") || !MMDD.test(rule.date_to ?? "")) return "schedule.error.date";
  } else if (!Number.isFinite(rule.temp_val) || !Number.isInteger(rule.temp_days) || (rule.temp_days ?? 0) < 1) {
    return "schedule.error.temp";
  }
  return null;
}

export function parseMmdd(value: string): { month: number; day: number } {
  const m = MMDD.exec(value);
  return m ? { month: Number(m[1]), day: Number(m[2]) } : { month: 1, day: 1 };
}

export function toMmdd(month: number, day: number): string {
  const d = Math.min(day, daysInMonth(month));
  return `${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Počet dní v měsíci (únor 29 — pravidla platí každý rok). */
export function daysInMonth(month: number): number {
  return new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

function yearFraction(mmdd: string): number {
  const { month, day } = parseMmdd(mmdd);
  return (Date.UTC(2024, month - 1, day) - Date.UTC(2024, 0, 1)) / (366 * 86_400_000);
}

/** Úseky roku (0–1) pokryté obdobím od–do včetně přelomu roku. */
export function yearSegments(from: string, to: string): [number, number][] {
  const a = yearFraction(from);
  const b = yearFraction(to) + 1 / 366;
  return a <= b ? [[a, Math.min(1, b)]] : [[a, 1], [0, b]];
}

// ── Rozpad výpočtu ────────────────────────────────────────────────────────────────────
export interface BreakdownStep {
  kind: "curve" | "safe" | "correction" | "raw" | "limit_max" | "limit_min" | "result";
  value: number;
}

/** Křivka → korekce → (surová → limit) → výsledek. */
export function breakdown(r: CalcResult | null): BreakdownStep[] {
  if (!r) return [];
  const steps: BreakdownStep[] = [];
  if (r.safe_mode) {
    steps.push({ kind: "safe", value: r.raw });
  } else {
    steps.push({ kind: "curve", value: r.curve_temp });
    if (Math.abs(r.total_correction) >= 0.05) steps.push({ kind: "correction", value: r.total_correction });
  }
  if (r.clamped) {
    steps.push({ kind: "raw", value: r.raw });
    steps.push(r.raw > r.result ? { kind: "limit_max", value: r.t_max } : { kind: "limit_min", value: r.t_min });
  }
  steps.push({ kind: "result", value: r.result });
  return steps;
}

// ── Úpravy křivky ────────────────────────────────────────────────────────────────────────────
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Posun celé křivky nahoru/dolů. */
export function shiftCurve(points: CurvePoint[], delta: number): CurvePoint[] {
  return points.map((p) => ({ x: p.x, y: round1(p.y + delta) }));
}

/** Změna sklonu — body se roztáhnou kolem bodu křivky na `pivot` °C venku. */
export function slopeCurve(points: CurvePoint[], factor: number, pivot = 20): CurvePoint[] {
  const base = interpolate(points, pivot);
  return points.map((p) => ({ x: p.x, y: round1(base + (p.y - base) * factor) }));
}

/** Sklon křivky ve °C topení na 1 °C venku (kladné číslo = té víc, čím je zima). */
export function curveSlope(points: CurvePoint[]): number {
  const pts = sortPoints(points);
  if (pts.length < 2) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return b.x === a.x ? 0 : (a.y - b.y) / (b.x - a.x);
}

// ── Čas ──────────────────────────────────────────────────────────────────────────────────────────
/** „před 5 min“ / „za 2 h“. */
export function relativeTime(ts: number, nowSec: number, language: string): string {
  const diff = ts - nowSec;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto", style: "short" });
  if (abs < 60) return rtf.format(0, "minute");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86_400), "day");
}

/** Podíl uplynulého času boostu/útlumu (0–1). */
export function boostProgress(snap: Snapshot, nowSec: number): number {
  const { since, until } = snap.boost;
  if (!snap.boost.effective || !since || !until || until <= since) return 0;
  return Math.min(1, Math.max(0, (nowSec - since) / (until - since)));
}

/** Parametry pro prodloužení běžícího boostu o `extra` hodin (max. 24 h od teď). */
export function extendBoost(snap: Snapshot, nowSec: number, extra: number): { amount: number; hours: number } | null {
  const { effective, until } = snap.boost;
  if (!effective || !until) return null;
  const remaining = Math.max(0, until - nowSec) / 3600;
  const hours = Math.min(24, Math.max(0.5, Math.round((remaining + extra) * 2) / 2));
  return { amount: Math.abs(effective), hours };
}

// ── Log ─────────────────────────────────────────────────────────────────────────────────────────────
/** Záznamy, které něco změnily: události a skutečné zápisy termostatu. */
export function isWrite(entry: CalcLogEntry): boolean {
  return Boolean(entry.event) || entry.thermostat === "ok" || entry.thermostat === "error";
}

export interface LogGroup {
  day: string;
  entries: CalcLogEntry[];
}

/** Seskupení podle dne (záznamy bez `ts` podle textu času „dd.mm HH:MM“). */
export function groupLogByDay(entries: CalcLogEntry[], language: string): LogGroup[] {
  const fmt = new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "numeric" });
  const groups: LogGroup[] = [];
  for (const entry of entries) {
    const day = entry.ts ? fmt.format(new Date(entry.ts * 1000)) : entry.time.split(" ")[0] ?? "";
    const last = groups.at(-1);
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}
