/** Jednořádkové souhrny zobrazené v hlavičce sbalené sekce (bez opakování údajů ze Stavu). */

import type { SectionId } from "./config.js";
import { formatNumber, formatSigned, formatTemp, type Translator } from "./i18n.js";
import { curveInput, describeLogEntry, formatDuration, remainingMinutes, weatherCorrection } from "./logic.js";
import type { Snapshot } from "./types.js";

export function sectionSummary(id: SectionId, snap: Snapshot, t: Translator, lang: string, nowSec: number): string {
  const r = snap.result;
  switch (id) {
    case "status":
      return formatTemp(r?.result, lang);
    case "actions": {
      const e = snap.boost.effective;
      if (e) {
        return t(e > 0 ? "summary.boost" : "summary.reduction", {
          value: formatSigned(e, lang), duration: formatDuration(remainingMinutes(snap, nowSec), t),
        });
      }
      return t("summary.profile", { name: snap.active_profile });
    }
    case "profiles": {
      const rules = snap.schedules.filter((s) => s.enabled).length;
      const name = snap.profile_modified ? t("summary.modified", { name: snap.active_profile }) : snap.active_profile;
      return rules ? t("summary.profiles", { name, count: rules }) : name;
    }
    case "automations": {
      const active = [
        r?.frost_active && t("state.frost"),
        r?.night_active && t("state.night"),
        r?.bypass_active && t("state.bypass"),
      ].filter(Boolean);
      return active.length ? t("summary.active_now", { list: active.join(", ") }) : t("summary.none_active");
    }
    case "curve": {
      const input = curveInput(snap);
      return t(input.forecast ? "summary.curve_forecast" : "summary.curve", {
        out: formatNumber(input.value, lang), flow: formatNumber(r?.curve_temp, lang, 0), hours: input.hours,
      });
    }
    case "influences":
      return t("summary.influences", { value: formatSigned(weatherCorrection(r), lang) });
    case "log": {
      const last = snap.calc_log[0];
      if (!last) return t("log.empty_short");
      const time = last.time.split(" ").at(-1) ?? last.time;
      return `${time} · ${describeLogEntry(last, t, lang).title}`;
    }
    case "settings":
      return t("summary.settings", {
        min: formatNumber(Number(snap.settings.limit_min), lang, 0), max: formatNumber(Number(snap.settings.limit_max), lang, 0),
        interval: formatNumber(Number(snap.settings.prepocet_interval), lang, 0),
      });
  }
}
