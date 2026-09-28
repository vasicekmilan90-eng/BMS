import { describe, expect, it } from "vitest";

import cs from "../src/translations/cs.json";
import en from "../src/translations/en.json";
import { createTranslator, formatSigned, resolveLanguage } from "../src/i18n";
import {
  alerts, corrections, describeLogEntry, describeRule, interpolate, regulationState, remainingMinutes,
  suggestPoint, validatePoints, validateRule,
} from "../src/logic";
import type { Snapshot } from "../src/types";

const t = createTranslator("cs");

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    entry_id: "e", available: true, last_error: null, problems: {}, settings: { hlavni_vypinac: true },
    setting_meta: {}, entities: {}, curve: [{ x: -20, y: 70 }, { x: 20, y: 20 }], storage_ok: true,
    profiles: ["Výchozí"], system_profiles: [], active_profile: "Výchozí", starred: [], schedules: [],
    boost: { active: false, effective: 0 }, temp_source: "sensor", safe_since: null,
    result: {
      curve_temp: 45, corr_wind: 1.2, corr_rain: 0, corr_humidity: 0, corr_clouds: 0, corr_sun: -0.5,
      night_offset: 0, night_active: false, boost: 0, total_correction: 0.7, raw: 45.7, t_min: 25, t_max: 42,
      frost_active: false, bypass_active: false, safe_mode: false, result: 42, clamped: true,
    },
    values: {}, last_write: {}, calc_log: [], clamp_log: [], history: [], forecast: [], forecast_ok: true,
    ...overrides,
  };
}

describe("překlady", () => {
  it("cs a en mají stejné klíče", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(cs).sort());
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
  it("upozornění", () => {
    const now = 10_000;
    const list = alerts(snap({
      temp_source: "safe_fallback", safe_since: now - 1200, storage_ok: false,
      clamp_log: [{ ts: now - 10, raw: 50, clamped: 42 }, { ts: now - 20, raw: 50, clamped: 42 }, { ts: now - 30, raw: 50, clamped: 42 }],
    }), t, now);
    expect(list.map((a) => a.level)).toEqual(["warning", "error", "warning"]);
    expect(list[0].text).toContain("20 min");
  });
});

describe("texty", () => {
  it("popis pravidla", () => {
    expect(describeRule({ id: "1", enabled: true, type: "temp", profile: "Zima", date_from: "", date_to: "",
      temp_op: "<", temp_val: 5, temp_days: 3 }, t, "cs")).toBe("průměr pod 5,0 °C za 3 d → Zima");
  });
  it("záznam logu — událost i výpočet", () => {
    expect(describeLogEntry({ time: "1.1 10:00", event: "boost_start", amount: 3, hours: 2 }, t, "cs").title)
      .toBe("Boost +3,0 °C na 2,0 h");
    const line = describeLogEntry({ time: "x", out: 2, curve: 45, corr_wind: 1.2, raw: 46.2, result: 42,
      clamped: true, manual: true, thermostat: "ok" }, t, "cs");
    expect(line.tone).toBe("clamped");
    expect(line.tags).toEqual(["ručně", "oříznuto", "nastaveno"]);
    expect(line.detail).toBe("křivka 45,0 °C vítr +1,20 = 46,2 °C → 42,0 °C");
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
  it("validace pravidla", () => {
    const rule = { profile: "Zima", type: "date" as const, date_from: "11-01", date_to: "03-31" };
    expect(validateRule(rule)).toBeNull();
    expect(validateRule({ ...rule, date_to: "3-31" })).toBe("schedule.error.date");
    expect(validateRule({ profile: "Zima", type: "temp", temp_val: 5, temp_days: 0 })).toBe("schedule.error.temp");
  });
});
