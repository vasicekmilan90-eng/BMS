/** Překlady karty (cs/en) s jednoduchým doplňováním {parametrů}. */

import cs from "./translations/cs.json";
import en from "./translations/en.json";

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { cs, en };

export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function resolveLanguage(language: string | undefined): "cs" | "en" {
  return language?.toLowerCase().startsWith("cs") ? "cs" : "en";
}

export function createTranslator(language: string | undefined): Translator {
  const lang = resolveLanguage(language);
  const dict = DICTS[lang];
  return (key, params) => {
    let text = dict[key] ?? DICTS.cs[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function formatNumber(value: number | null | undefined, language: string, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatSigned(value: number | null | undefined, language: string, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const text = formatNumber(Math.abs(value), language, digits);
  if (Math.abs(value) < 10 ** -digits / 2) return formatNumber(0, language, digits);
  return `${value > 0 ? "+" : "−"}${text}`;
}

export function formatTemp(value: number | null | undefined, language: string, digits = 1): string {
  return value === null || value === undefined ? "—" : `${formatNumber(value, language, digits)} °C`;
}

export function formatTime(ts: number, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(ts * 1000));
}
