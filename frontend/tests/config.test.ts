import { describe, expect, it } from "vitest";

import { checkConditions, conditionEntities, mediaQueries } from "../src/conditions";
import { SECTIONS, canEdit, compactSection, estimateRows, makeSection, normalizeConfig, sectionColumn } from "../src/config";

const types = (config: Parameters<typeof normalizeConfig>[0], defaults?: readonly string[]) =>
  normalizeConfig(config, defaults).sections.map((s) => s.type);

describe("konfigurace", () => {
  it("výchozí sekce a volby", () => {
    const c = normalizeConfig({ type: "x" });
    expect(c.sections.map((s) => s.type)).toEqual([...SECTIONS]);
    expect(c.layout).toBe("auto");
    const log = c.sections.find((s) => s.type === "log")!;
    expect(log.collapsed).toBe(true);
    expect(c.sections.find((s) => s.type === "profiles")!.admin_only).toBe(true);
    expect(c.sections.find((s) => s.type === "influences")!.column).toBe(0);
    expect(sectionColumn(c.sections.find((s) => s.type === "influences")!)).toBe(2);
    expect(sectionColumn(c.sections.find((s) => s.type === "automations")!)).toBe(1);
    expect(normalizeConfig({ type: "x", sections: [{ type: "curve", column: 1 }] }).sections[0].column).toBe(1);
  });

  it("volby sekcí se ověří", () => {
    const c = normalizeConfig({ type: "x", sections: [
      { type: "actions", durations: [1, "3", -1, 99], directions: ["boost", "nesmysl"] },
      { type: "curve", editor: "shift", range: [10, -10] },
      { type: "log", limit: 500, filter: "writes" },
    ] });
    const [actions, curve, log] = c.sections;
    expect(actions.type === "actions" && actions.durations).toEqual([1, 3]);
    expect(actions.type === "actions" && actions.directions).toEqual(["boost"]);
    expect(curve.type === "curve" && curve.editor).toBe("shift");
    expect(curve.type === "curve" && curve.range).toBeUndefined();
    expect(log.type === "log" && [log.limit, log.filter]).toEqual([20, "writes"]);
  });

  it("převod zápisu z 0.2", () => {
    const c = normalizeConfig({
      type: "x",
      sections: ["status", "modes", "quick_profiles", "profiles", "schedules", "curve"],
      modes: ["boost", "night"],
      collapsed: ["modes", "schedules"],
      curve_editor: false,
    } as never);
    expect(c.sections.map((s) => s.type)).toEqual(["status", "actions", "automations", "profiles", "curve"]);
    const [, actions, autos, profiles, curve] = c.sections;
    expect(actions.type === "actions" && [actions.show, actions.directions]).toEqual([["temporary", "profiles"], ["boost"]]);
    expect(autos.type === "automations" && autos.items).toEqual(["night"]);
    expect(profiles.type === "profiles" && profiles.tabs).toEqual(["manage", "schedules"]);
    expect(curve.type === "curve" && curve.editor).toBe("none");
    expect([actions.collapsed, profiles.collapsed, curve.collapsed]).toEqual([true, true, false]);
    expect(c.warnings).toEqual([]);
  });

  it("staré samostatné karty", () => {
    expect(types({ type: "x" }, ["modes"])).toEqual(["actions", "automations"]);
    expect(types({ type: "x" }, ["quick_profiles", "profiles", "schedules"])).toEqual(["actions", "profiles"]);
    expect(types({ type: "x", sections: ["profiles"], modes: ["boost"] } as never)).toEqual(["profiles"]);
  });

  it("předvolby a neznámé položky", () => {
    expect(types({ type: "x", preset: "family" })).toEqual(["status", "actions", "automations"]);
    const overview = normalizeConfig({ type: "x", preset: "overview" });
    expect(overview.read_only).toBe(true);
    expect(canEdit(overview, true)).toBe(false);
    const c = normalizeConfig({ type: "x", sections: ["status", "nesmysl", "status"] as never });
    expect(c.warnings).toEqual(["unknown:nesmysl", "duplicate:status"]);
  });

  it("práva a admin_only_settings", () => {
    const c = normalizeConfig({ type: "x", admin_only_settings: false });
    expect(c.sections.every((s) => !s.admin_only)).toBe(true);
    expect(canEdit(c, false)).toBe(true);
    expect(canEdit(normalizeConfig({ type: "x" }), false)).toBe(false);
  });

  it("kompaktní zápis pro editor", () => {
    expect(compactSection(makeSection("log"))).toBe("log");
    expect(compactSection(makeSection("log", { limit: 5 }))).toEqual({ type: "log", limit: 5 });
    expect(compactSection(makeSection("settings", {}, undefined, false), false)).toBe("settings");
  });

  it("odhad výšky", () => {
    expect(estimateRows([{ type: "status", collapsed: false }], false)).toBe(4);
    expect(estimateRows([{ type: "log", collapsed: true }], true)).toBe(2);
  });
});

describe("podmínky viditelnosti", () => {
  const env = {
    states: { "input_boolean.host": { state: "on" }, "sensor.t": { state: "12.5" } },
    userId: "u1",
    matches: (q: string) => q === "(max-width: 767px)",
  };
  it("jednotlivé typy", () => {
    expect(checkConditions([], env)).toBe(true);
    expect(checkConditions([{ condition: "state", entity: "input_boolean.host", state: "on" }], env)).toBe(true);
    expect(checkConditions([{ condition: "state", entity: "input_boolean.host", state_not: ["on"] }], env)).toBe(false);
    expect(checkConditions([{ condition: "numeric_state", entity: "sensor.t", above: 10, below: 20 }], env)).toBe(true);
    expect(checkConditions([{ condition: "screen", media_query: "(max-width: 767px)" }], env)).toBe(true);
    expect(checkConditions([{ condition: "user", users: ["u2"] }], env)).toBe(false);
    expect(checkConditions([{ condition: "state", entity: "sensor.neni", state: "on" }], env)).toBe(false);
  });
  it("and / or a sběr závislostí", () => {
    const conds = [{ condition: "or" as const, conditions: [
      { condition: "user" as const, users: ["u2"] },
      { condition: "and" as const, conditions: [
        { condition: "screen" as const, media_query: "(min-width: 768px)" },
        { condition: "state" as const, entity: "input_boolean.host", state: "on" },
      ] },
    ] }];
    expect(checkConditions(conds, env)).toBe(false);
    expect(mediaQueries(conds)).toEqual(["(min-width: 768px)"]);
    expect(conditionEntities(conds)).toEqual(["input_boolean.host"]);
  });
});
