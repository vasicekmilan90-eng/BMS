/** Jednořádkové souhrny zobrazené v hlavičce sbalené sekce. */

import type { SectionId } from "./config.js";
import { formatNumber, formatSigned, formatTemp, type Translator } from "./i18n.js";
import { describeLogEntry, remainingMinutes } from "./logic.js";
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
          value: formatSigned(e, lang), minutes: remainingMinutes(snap, nowSec),
        });
      }
      return t("summary.profile", { name: snap.active_profile });
    }
    case "profiles":
      return snap.profile_modified
        ? t("summary.profile_modified", { name: snap.active_profile })
        : t("summary.profile", { name: snap.active_profile });
    case "automations": {
      const active = [
        r?.frost_active && t("state.frost"),
        r?.night_active && t("state.night"),
        r?.bypass_active && t("state.bypass"),
      ].filter(Boolean);
      return active.length ? active.join(" · ") : t("summary.none_active");
    }
    case "curve":
      return t("summary.curve", {
        out: formatNumber(snap.values.applied_out_temp, lang), flow: formatNumber(r?.curve_temp, lang),
      });
    case "influences": {
      const sum = (r?.corr_wind ?? 0) + (r?.corr_rain ?? 0) + (r?.corr_humidity ?? 0) + (r?.corr_clouds ?? 0) + (r?.corr_sun ?? 0);
      return t("summary.influences", { value: formatSigned(sum, lang) });
    }
    case "log": {
      const last = snap.calc_log[0];
      return last ? `${last.time} · ${describeLogEntry(last, t, lang).title}` : t("log.empty_short");
    }
    case "settings":
      return t("summary.settings", {
        min: formatNumber(Number(snap.settings.limit_min), lang, 0), max: formatNumber(Number(snap.settings.limit_max), lang, 0),
      });
  }
}
