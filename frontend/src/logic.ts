/** Odvozené stavy a texty pro zobrazení (čisté funkce, testované). */

import { formatNumber, formatSigned, type Translator } from "./i18n.js";
import type { CalcLogEntry, CurvePoint, ScheduleRule, Snapshot } from "./types.js";

export type RegulationState = "inactive" | "boost" | "reduction" | "frost" | "night" | "bypass" | "safe" | "active";

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
    list.push({ level: "warning", text: t(over ? "alert.clamp_high" : "alert.clamp_low", { count: recentClamps.length }) });
  }
  if (snap.problems.forecast) list.push({ level: "info", text: t("alert.no_forecast") });
  return list;
}

export function describeRule(rule: ScheduleRule, t: Translator, language: string): string {
  if (rule.type === "date") {
    return t("schedule.desc_date", { from: rule.date_from || "?", to: rule.date_to || "?", profile: rule.profile });
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
