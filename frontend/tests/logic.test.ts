import { describe, expect, it } from "vitest";

import cs from "../src/translations/cs.json";
import en from "../src/translations/en.json";
import { createTranslator, formatSigned, resolveLanguage } from "../src/i18n";
import {
  alerts, boostProgress, breakdown, corrections, curveSlope, daysInMonth, describeLogEntry, describeRule, extendBoost,
  formatDuration, groupLogByDay, interpolate, isWrite, parseMmdd, reasonSentence, regulationState, remainingMinutes,
  shiftCurve, slopeCurve, suggestPoint, sunCoverage, toMmdd, userEvents, validatePoints, validateRule, yearSegments,
} from "../src/logic";
import { sectionSummary } from "../src/summary";
import type { CalcResult, Snapshot } from "../src/types";

const t = createTranslator("cs");

declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query: string; import: string; eager: true }): Record<string, string>;
  }
}

const RESULT: CalcResult = {
  curve_temp: 45, corr_wind: 1.2, corr_rain: 0, corr_humidity: 0, corr_clouds: 0, corr_sun: -0.5,
  night_offset: 0, night_active: false, boost: 0, total_correction: 0.7, raw: 45.7, t_min: 25, t_max: 42,
  frost_active: false, bypass_active: false, safe_mode: false, result: 42, clamped: true,
};

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    entry_id: "e", inputs: {}, thermostat: null, profile_modified: false, active_rule: null, next_events: [],
    available: true, last_error: null, problems: {}, settings: { hlavni_vypinac: true, limit_min: 25, limit_max: 42, prepocet_interval: 15 },
    setting_meta: {}, entities: {}, curve: [{ x: -20, y: 70 }, { x: 20, y: 20 }], storage_ok: true,
    profiles: ["Výchozí"], system_profiles: [], active_profile: "Výchozí", starred: [], schedules: [],
    boost: { active: false, effective: 0 }, temp_source: "sensor", safe_since: null,
    result: RESULT,
    values: {}, last_write: {}, calc_log: [], clamp_log: [], history: [], forecast: [], forecast_ok: true,
    ...overrides,
  };
}

describe("překlady", () => {
  it("cs a en mají stejné klíče", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(cs).sort());
  });
  it("pevné klíče použité ve zdrojích existují", () => {
    const sources = import.meta.glob("../src/**/*.ts", { query: "?raw", import: "default", eager: true });
    const missing = new Set<string>();
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bt\("([a-z_]+\.[a-z0-9_.]+)"/g)) {
        if (!(match[1] in cs)) missing.add(`${file}: ${match[1]}`);
      }
    }
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect([...missing]).toEqual([]);
  });
  it("jazyk a parametry", () => {
    expect(resolveLanguage("cs-CZ")).toBe("cs");
    expect(resolveLanguage("de")).toBe("en");
    expect(t("status.boost_remaining", { minutes: 5 })).toBe("zbývá 5 min");
    expect(t("neexistuje")).toBe("neexistuje");
    expect(formatSigned(-1.25, "cs", 1)).toBe("−1,3");
    expect(formatSigned(0.01, "en", 1)).toBe("0.0");
  });
});

describe("stav regulace", () => {
  it("priority stavů", () => {
    expect(regulationState(snap({ settings: { hlavni_vypinac: false } }))).toBe("inactive");
    expect(regulationState(snap({ boost: { active: true, effective: 3 } }))).toBe("boost");
    expect(regulationState(snap())).toBe("active");
  });
  it("korekce bez nulových položek", () => {
    expect(corrections(snap()).map((c) => c.key)).toEqual(["wind", "sun"]);
  });
  it("zbývající minuty boostu", () => {
    expect(remainingMinutes(snap({ boost: { active: true, effective: 2, until: 1000 + 600 } }), 1000)).toBe(10);
    expect(remainingMinutes(snap(), 1000)).toBe(0);
  });
  it("průběh a prodloužení boostu", () => {
    const s = snap({ boost: { active: true, effective: -2, since: 1000, until: 8200, hours: 2 } });
    expect(boostProgress(s, 2800)).toBe(0.25);
    expect(extendBoost(s, 2800, 1)).toEqual({ amount: 2, hours: 2.5 });
    expect(extendBoost(snap(), 0, 1)).toBeNull();
  });
  it("upozornění", () => {
    const now = 10_000;
    const list = alerts(snap({
      temp_source: "safe_fallback", safe_since: now - 1200, storage_ok: false,
      clamp_log: [{ ts: now - 10, raw: 50, clamped: 42 }, { ts: now - 20, raw: 50, clamped: 42 }, { ts: now - 30, raw: 50, clamped: 42 }],
    }), t, now);
    expect(list.map((a) => a.level)).toEqual(["warning", "error", "warning"]);
    expect(list[0].text).toContain("20 min");
  });
  it("rozpad výpočtu", () => {
    expect(breakdown(RESULT).map((s) => [s.kind, s.value])).toEqual([
      ["curve", 45], ["correction", 0.7], ["raw", 45.7], ["limit_max", 42], ["result", 42],
    ]);
    expect(breakdown({ ...RESULT, safe_mode: true, raw: 40, clamped: false, result: 40 }).map((s) => s.kind))
      .toEqual(["safe", "result"]);
    expect(breakdown(null)).toEqual([]);
  });
  it("věta proč", () => {
    expect(reasonSentence(snap(), t, "cs")).toEqual({ text: "Křivka 45 °C, počasí +0,7 °C", limit: "omezeno na max. 42 °C" });
    const boosted = snap({ result: { ...RESULT, boost: 2, clamped: false, raw: 47.7, result: 47.7 } });
    expect(reasonSentence(boosted, t, "cs")).toEqual({ text: "Křivka 45 °C, počasí +0,7 °C, přitápění +2,0 °C", limit: undefined });
  });
  it("délka a události", () => {
    expect(formatDuration(85, t)).toBe("1 h 25 min");
    expect(formatDuration(25, t)).toBe("25 min");
    const s = snap({ next_events: [{ kind: "recalc", ts: 1 }, { kind: "night_start", ts: 2 }, { kind: "schedule", ts: 3, profile: "Zima" }] });
    expect(userEvents(s).map((e) => e.kind)).toEqual(["night_start", "schedule"]);
  });
  it("pokrytí slunečné doby oknem", () => {
    const path: [number, number][] = [[60, 1], [100, 20], [180, 60], [260, 20], [300, 1], [320, -2]];
    expect(sunCoverage(path, 140, 220)).toBeCloseTo(0.2);
    expect(sunCoverage(path, 0, 360)).toBe(1);
    expect(sunCoverage([], 0, 360)).toBe(0);
  });
  it("upozornění odkazují na sekci", () => {
    const now = 10_000;
    const list = alerts(snap({ clamp_log: [1, 2, 3].map((i) => ({ ts: now - i, raw: 50, clamped: 42 })) }), t, now);
    expect(list[0].target).toBe("curve");
  });
});

describe("texty", () => {
  it("popis pravidla", () => {
    const base = { id: "1", enabled: true, profile: "Zima", date_from: "11-01", date_to: "03-31",
      temp_op: "<" as const, temp_val: 5, temp_days: 3 };
    expect(describeRule({ ...base, type: "temp" }, t, "cs")).toBe("Průměr pod 5,0 °C za 3 d → Zima");
    expect(describeRule({ ...base, type: "date" }, t, "cs")).toBe("1. 11. – 31. 3. → Zima");
  });
  it("záznam logu — událost i výpočet", () => {
    expect(describeLogEntry({ time: "1.1 10:00", event: "boost_start", amount: 3, hours: 2 }, t, "cs").title)
      .toBe("Přitápění +3,0 °C na 2,0 h");
    const line = describeLogEntry({ time: "x", out: 2, curve: 45, corr_wind: 1.2, raw: 46.2, result: 42,
      clamped: true, manual: true, thermostat: "ok" }, t, "cs");
    expect(line.tone).toBe("clamped");
    expect(line.tags).toEqual(["ručně", "oříznuto", "nastaveno"]);
    expect(line.detail).toBe("křivka 45,0 °C vítr +1,20 = 46,2 °C → 42,0 °C");
  });
  it("filtr a seskupení logu", () => {
    const day1 = Date.UTC(2026, 0, 5, 10) / 1000;
    const entries = [
      { time: "05.01 11:00", ts: day1 + 3600, thermostat: "unchanged" },
      { time: "05.01 10:00", ts: day1, event: "boost_start" },
      { time: "04.01 10:00", ts: day1 - 86_400, thermostat: "ok" },
    ];
    expect(entries.filter(isWrite).length).toBe(2);
    expect(groupLogByDay(entries, "cs").map((g) => g.entries.length)).toEqual([2, 1]);
  });
  it("souhrny sekcí", () => {
    expect(sectionSummary("profiles", snap({ profile_modified: true }), t, "cs", 0)).toBe("Výchozí (upraveno)");
    expect(sectionSummary("automations", snap(), t, "cs", 0)).toBe("nic neběží");
    expect(sectionSummary("actions", snap({ boost: { active: true, effective: 2, until: 600 } }), t, "cs", 0))
      .toBe("Přitápění +2,0 °C · 10 min");
    expect(sectionSummary("settings", snap(), t, "cs", 0)).toBe("limity 25–42 °C · přepočet 15 min");
    expect(sectionSummary("influences", snap(), t, "cs", 0)).toBe("celkem +0,7 °C");
  });
});

describe("křivka a pravidla", () => {
  const pts = [{ x: -20, y: 70 }, { x: 0, y: 45 }, { x: 20, y: 20 }];
  it("interpolace", () => {
    expect(interpolate(pts, -10)).toBe(57.5);
    expect(interpolate(pts, 30)).toBe(20);
  });
  it("validace bodů", () => {
    expect(validatePoints(pts)).toBe("ok");
    expect(validatePoints([pts[0]])).toBe("too_few");
    expect(validatePoints([pts[0], { x: -20, y: 1 }])).toBe("duplicate_x");
    expect(validatePoints([{ x: Number.NaN, y: 1 }, pts[1]])).toBe("invalid");
  });
  it("nový bod do největší mezery", () => {
    expect(suggestPoint([{ x: -20, y: 70 }, { x: 0, y: 45 }, { x: 40, y: 5 }])).toEqual({ x: 20, y: 25 });
  });
  it("posun a sklon", () => {
    expect(shiftCurve(pts, 0.5)).toEqual([{ x: -20, y: 70.5 }, { x: 0, y: 45.5 }, { x: 20, y: 20.5 }]);
    expect(slopeCurve(pts, 1.1)).toEqual([{ x: -20, y: 75 }, { x: 0, y: 47.5 }, { x: 20, y: 20 }]);
    expect(curveSlope(pts)).toBe(1.25);
  });
  it("validace pravidla", () => {
    const rule = { profile: "Zima", type: "date" as const, date_from: "11-01", date_to: "03-31" };
    expect(validateRule(rule)).toBeNull();
    expect(validateRule({ ...rule, date_to: "3-31" })).toBe("schedule.error.date");
    expect(validateRule({ profile: "Zima", type: "temp", temp_val: 5, temp_days: 0 })).toBe("schedule.error.temp");
  });
  it("data plánů", () => {
    expect(parseMmdd("02-29")).toEqual({ month: 2, day: 29 });
    expect(toMmdd(4, 31)).toBe("04-30");
    expect(daysInMonth(2)).toBe(29);
    expect(yearSegments("11-01", "03-31")).toHaveLength(2);
    const [[a, b]] = yearSegments("01-01", "12-31");
    expect(a).toBe(0);
    expect(b).toBeCloseTo(1);
  });
});
