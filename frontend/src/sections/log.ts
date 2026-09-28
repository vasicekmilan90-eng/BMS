import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { describeLogEntry, groupLogByDay, isWrite, relativeTime } from "../logic.js";
import { baseStyles } from "../styles.js";

const TONE: Record<string, string> = {
  boost: "var(--bms-heat)", reduction: "var(--bms-info)", warning: "var(--bms-warn)", frost: "var(--bms-frost)",
  night: "var(--bms-night)", clamped: "var(--bms-warn)", normal: "var(--bms-ok)",
};

@customElement("bms-sec-log")
export class BmsLogSection extends BmsSection<SectionOptions["log"]> {
  static styles = [baseStyles, css`
    .filters { display: flex; gap: 6px; margin-bottom: 8px; }
    .list { max-height: 340px; overflow-y: auto; }
    h4 { margin: 8px 0 4px; font-size: var(--ha-font-size-xs, 11px); font-weight: 500; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--bms-muted); position: sticky; top: 0; background: var(--card-background-color, #fff); }
    ol { list-style: none; margin: 0; padding: 0; }
    li { border-left: 3px solid; padding: 4px 8px; margin-bottom: 6px; }
    .head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .time { font-variant-numeric: tabular-nums; color: var(--bms-muted); font-size: var(--ha-font-size-xs, 11px); }
    .detail { font-size: var(--ha-font-size-xs, 11px); color: var(--bms-muted); margin-top: 2px; }
  `];

  @state() private filter?: "all" | "writes";

  protected render() {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const filter = this.filter ?? this.options.filter;
    const entries = snap.calc_log.filter((e) => filter === "all" || isWrite(e)).slice(0, this.options.limit);
    const now = Date.now() / 1000;
    return html`
      <div class="filters" role="group" aria-label=${t("log.filter")}>
        ${(["all", "writes"] as const).map((f) => html`<button class="chip" aria-pressed=${f === filter}
          @click=${() => (this.filter = f)}>${t(`log.filter_${f}`)}</button>`)}
      </div>
      ${entries.length ? html`<div class="list">
        ${groupLogByDay(entries, lang).map((group) => html`
          <h4>${group.day}</h4>
          <ol>${group.entries.map((entry) => {
            const line = describeLogEntry(entry, t, lang);
            const time = entry.time.split(" ").at(-1) ?? entry.time;
            return html`<li style="border-color:${TONE[line.tone]}">
              <div class="head">
                <span class="time" title=${entry.ts ? relativeTime(entry.ts, now, lang) : ""}>${time}</span>
                <span class="small" style="font-weight:500">${line.title}</span>
                ${line.tags.map((tag) => html`<span class="chip">${tag}</span>`)}
              </div>
              ${line.detail ? html`<div class="detail">${line.detail}</div>` : nothing}
            </li>`;
          })}</ol>`)}
      </div>` : html`<div class="empty">${t("log.empty")}</div>`}
    `;
  }
}
