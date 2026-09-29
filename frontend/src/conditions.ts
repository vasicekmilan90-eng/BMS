/** Podmínky viditelnosti sekcí ve stejném zápisu jako `visibility` v dashboardech HA. */

import type { Condition } from "./config.js";

export interface ConditionEnv {
  states: Record<string, { state: string }>;
  userId?: string;
  matches: (query: string) => boolean;
}

const asList = (v: string | string[] | undefined): string[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v.map(String) : [String(v)];

export function checkCondition(c: Condition, env: ConditionEnv): boolean {
  switch (c.condition) {
    case "state": {
      const state = c.entity ? env.states[c.entity]?.state : undefined;
      if (state === undefined) return false;
      const is = asList(c.state);
      const not = asList(c.state_not);
      return (!is || is.includes(state)) && (!not || !not.includes(state));
    }
    case "numeric_state": {
      const value = Number(c.entity ? env.states[c.entity]?.state : Number.NaN);
      if (!Number.isFinite(value)) return false;
      return (c.above === undefined || value > c.above) && (c.below === undefined || value < c.below);
    }
    case "screen":
      return c.media_query ? env.matches(c.media_query) : true;
    case "user":
      return Array.isArray(c.users) && env.userId !== undefined && c.users.includes(env.userId);
    case "and":
      return checkConditions(c.conditions ?? [], env);
    case "or":
      return (c.conditions ?? []).some((sub) => checkCondition(sub, env));
    default:
      return true;
  }
}

/** Všechny podmínky musí platit (prázdný seznam = vždy viditelné). */
export function checkConditions(conditions: Condition[], env: ConditionEnv): boolean {
  return conditions.every((c) => checkCondition(c, env));
}

/** Media query použité v podmínkách (karta na ně poslouchá a při změně se překreslí). */
export function mediaQueries(conditions: Condition[]): string[] {
  const out = new Set<string>();
  const walk = (list: Condition[]) => {
    for (const c of list) {
      if (c.condition === "screen" && c.media_query) out.add(c.media_query);
      if (c.conditions) walk(c.conditions);
    }
  };
  walk(conditions);
  return [...out];
}

/** Entity použité v podmínkách (překreslení jen při jejich změně). */
export function conditionEntities(conditions: Condition[]): string[] {
  const out = new Set<string>();
  const walk = (list: Condition[]) => {
    for (const c of list) {
      if (c.entity) out.add(c.entity);
      if (c.conditions) walk(c.conditions);
    }
  };
  walk(conditions);
  return [...out];
}

/** Zjednodušená volba v editoru → podmínka HA. */
export const SCREEN_QUERIES = {
  mobile: "(max-width: 767px)",
  desktop: "(min-width: 768px)",
} as const;
