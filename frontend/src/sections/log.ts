import { html, css } from "lit";
import { customElement } from "lit/decorators.js";

import { BmsSection } from "../components.js";
import { describeLogEntry } from "../logic.js";
import { baseStyles } from "../styles.js";

const TONE: Record<string, string> = {
  boost: "var(--bms-heat)", reduction: "var(--bms-info)", warning: "var(--bms-warn)", frost: "var(--bms-frost)",
  night: "var(--bms-night)", clamped: "var(--bms-warn)", normal: "var(--bms-ok)",
};

@customElement("bms-sec-log")
export class BmsLogSection extends BmsSection {
  static styles = [baseStyles, css`
    ol { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
    li { border-left: 3px solid; padding: 4px 8px; margin-bottom: 6px; }
    .head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .time { font-variant-numeric: tabular-nums; color: var(--bms-muted); font-size: var(--ha-font-size-xs, 11px); }
    .detail { font-size: var(--ha-font-size-xs, 11px); color: var(--bms-muted); margin-top: 2px; }
  `];

  protected render() {
    const { snap, lang } = this.ctx;
    const log = snap.calc_log;
    if (!log.length) return html`<div class="empty">${this.t("log.empty")}</div>`;
    return html`<ol aria-label=${this.t("section.log")}>
      ${log.map((entry) => {
        const line = describeLogEntry(entry, this.t, lang);
        return html`<li style="border-color:${TONE[line.tone]}">
          <div class="head">
            <span class="time">${entry.time}</span>
            <span class="small" style="font-weight:500">${line.title}</span>
            ${line.tags.map((tag) => html`<span class="chip">${tag}</span>`)}
          </div>
          ${line.detail ? html`<div class="detail">${line.detail}</div>` : ""}
        </li>`;
      })}
    </ol>`;
  }
}
