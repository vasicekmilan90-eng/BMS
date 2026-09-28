import { describe, expect, it } from "vitest";

import { canEdit, estimateRows, normalizeConfig, visibleSections, SECTIONS } from "../src/config";

describe("normalizeConfig", () => {
  it("prázdná konfigurace = všechny sekce", () => {
    const c = normalizeConfig({ type: "custom:bms-master-card" }, SECTIONS);
    expect(c.sections).toEqual([...SECTIONS]);
    expect(c.collapsed).toEqual(["log", "settings"]);
    expect(c.admin_only_settings).toBe(true);
  });

  it("zachová pořadí, odstraní neznámé a duplicitní sekce", () => {
    const c = normalizeConfig({ type: "x", sections: ["curve", "nope", "status", "curve"] as never }, SECTIONS);
    expect(c.sections).toEqual(["curve", "status"]);
  });

  it("samostatná karta použije své výchozí sekce", () => {
    expect(normalizeConfig({ type: "x" }, ["modes"]).sections).toEqual(["modes"]);
  });

  it("odmítne nesmyslnou konfiguraci", () => {
    expect(() => normalizeConfig("x" as never, SECTIONS)).toThrow();
  });
});

describe("oprávnění", () => {
  const base = normalizeConfig({ type: "x" }, SECTIONS);
  it("ne-admin nevidí správu", () => {
    expect(visibleSections(base, false)).not.toContain("settings");
    expect(visibleSections(base, true)).toContain("settings");
    expect(canEdit(base, false)).toBe(false);
  });
  it("read_only vypne úpravy i adminovi", () => {
    expect(canEdit(normalizeConfig({ type: "x", read_only: true }, SECTIONS), true)).toBe(false);
  });
  it("admin_only_settings: false zpřístupní vše", () => {
    const c = normalizeConfig({ type: "x", admin_only_settings: false }, SECTIONS);
    expect(visibleSections(c, false)).toEqual([...SECTIONS]);
    expect(canEdit(c, false)).toBe(true);
  });
});

it("estimateRows", () => {
  expect(estimateRows(["status"], false)).toBe(3);
  expect(estimateRows(["curve", "influences"], true)).toBe(8);
});
