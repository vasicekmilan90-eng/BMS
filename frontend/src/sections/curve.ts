import { html, nothing, css, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { Chart, cssVar, withAlpha } from "../chart.js";
import { BmsSection } from "../components.js";
import { formatNumber } from "../i18n.js";
import { interpolate, pointsEqual, sortPoints, suggestPoint, validatePoints } from "../logic.js";
import { baseStyles } from "../styles.js";
import type { CurvePoint } from "../types.js";

@customElement("bms-sec-curve")
export class BmsCurveSection extends BmsSection {
  static styles = [baseStyles, css`
    .chart { position: relative; height: 240px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: var(--ha-font-size-s, 13px); }
    th, td { padding: 4px 6px; text-align: left; }
    th { color: var(--bms-muted); font-weight: 500; }
    td input { width: 80px; }
    .icon-btn { border: none; background: none; cursor: pointer; color: var(--bms-muted); padding: 2px; }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 18px; }
  `];

  @state() private draft?: CurvePoint[];
  @query("canvas") private canvas?: HTMLCanvasElement;
  private chart?: Chart;
  private chartKey = "";
  private optionsKey = "";

  private get points(): CurvePoint[] {
    return this.draft ?? sortPoints(this.snap.curve);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.chart?.destroy();
    this.chart = undefined;
    this.chartKey = "";
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.renderChart();
  }

  private renderChart(): void {
    if (!this.canvas) return;
    const { snap, lang, t } = this.ctx;
    const r = snap.result;
    const pts = this.points;
    if (pts.length < 2) return;
    const xMin = Math.min(Number(snap.settings.rozsah_venku_min), pts[0].x);
    const xMax = Math.max(Number(snap.settings.rozsah_venku_max), pts[pts.length - 1].x);
    const key = JSON.stringify([pts, xMin, xMax, r?.total_correction, r?.t_min, r?.t_max, r?.result,
      snap.values.applied_out_temp, snap.settings.safe_curve_outdoor, snap.settings.safe_curve_temp, lang,
      this.ctx.hass.themes?.darkMode]);
    if (key === this.chartKey && this.chart) return;
    this.chartKey = key;
    const optionsKey = `${lang}|${this.ctx.hass.themes?.darkMode}`;
    if (optionsKey !== this.optionsKey) {
      this.chart?.destroy();
      this.chart = undefined;
      this.optionsKey = optionsKey;
    }
    const corr = r?.total_correction ?? 0;
    const tMin = r?.t_min ?? Number(snap.settings.limit_min);
    const tMax = r?.t_max ?? Number(snap.settings.limit_max);
    const samples: number[] = [];
    for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x += 1) samples.push(x);
    const base = samples.map((x) => ({ x, y: interpolate(pts, x) }));
    const modified = base.map((p) => ({ x: p.x, y: p.y + corr }));
    const clamped = modified.map((p) => ({ x: p.x, y: Math.min(tMax, Math.max(tMin, p.y)) }));

    const el = this as unknown as Element;
    const cBase = cssVar(el, "--bms-info", "#039be5");
    const cMod = cssVar(el, "--bms-heat", "#ff8100");
    const cRes = cssVar(el, "--bms-ok", "#43a047");
    const cWarn = cssVar(el, "--bms-warn", "#ffa600");
    const cText = cssVar(el, "--secondary-text-color", "#888");
    const cGrid = cssVar(el, "--divider-color", "rgba(127,127,127,.2)");

    const datasets = [
      { label: t("curve.base"), data: base, borderColor: cBase, backgroundColor: withAlpha(cBase, 0.08), fill: true, pointRadius: 0, borderWidth: 2 },
      { label: t("curve.modified"), data: modified, borderColor: cMod, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 },
      { label: t("curve.result"), data: clamped, borderColor: cRes, pointRadius: 0, borderWidth: 2 },
      { label: t("curve.points"), data: pts, type: "scatter" as const, borderColor: cBase, backgroundColor: cBase, pointRadius: 4 },
      { label: t("curve.current"), type: "scatter" as const, pointRadius: 7, pointStyle: "rectRot" as const,
        data: r && snap.values.applied_out_temp !== null ? [{ x: Number(snap.values.applied_out_temp), y: r.result }] : [],
        borderColor: cRes, backgroundColor: cRes },
      { label: t("curve.safe_point"), type: "scatter" as const, pointRadius: 6, pointStyle: "triangle" as const,
        data: [{ x: Number(snap.settings.safe_curve_outdoor), y: Number(snap.settings.safe_curve_temp) }],
        borderColor: cWarn, backgroundColor: cWarn },
      { label: t("curve.limits"), data: [{ x: xMin, y: tMax }, { x: xMax, y: tMax }], borderColor: withAlpha(cWarn, 0.7),
        borderDash: [2, 3], pointRadius: 0, borderWidth: 1 },
      { label: "", data: [{ x: xMin, y: tMin }, { x: xMax, y: tMin }], borderColor: withAlpha(cWarn, 0.7),
        borderDash: [2, 3], pointRadius: 0, borderWidth: 1 },
    ];

    if (this.chart) {
      this.chart.data.datasets = datasets as never;
      this.chart.update("none");
      return;
    }
    this.chart = new Chart(this.canvas, {
      type: "line",
      data: { datasets: datasets as never },
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: { type: "linear", reverse: true, title: { display: true, text: t("curve.outdoor_axis"), color: cText },
               ticks: { color: cText }, grid: { color: cGrid } },
          y: { title: { display: true, text: t("curve.flow_axis"), color: cText }, ticks: { color: cText }, grid: { color: cGrid } },
        },
        plugins: {
          legend: { labels: { color: cText, boxWidth: 12, filter: (item) => Boolean(item.text) } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${formatNumber((item.raw as CurvePoint).y, lang)} °C`,
              title: (items) => items.length ? `${formatNumber((items[0].raw as CurvePoint).x, lang)} °C ${t("curve.outdoor_short")}` : "",
            },
          },
        },
      },
    });
  }

  private edit(index: number, field: "x" | "y", value: string): void {
    const pts = [...this.points];
    pts[index] = { ...pts[index], [field]: Number(value.replace(",", ".")) };
    this.draft = pts;
  }

  private async save(): Promise<void> {
    const pts = sortPoints(this.points);
    const ok = await this.run(() => this.ctx.store.callService("set_curve_points", { points: pts }), this.t("curve.saved"));
    if (ok) this.draft = undefined;
  }

  protected render() {
    const { editable, config } = this.ctx;
    const t = this.t;
    const pts = this.points;
    const validity = validatePoints(pts);
    const dirty = this.draft !== undefined && !pointsEqual(sortPoints(this.draft), sortPoints(this.snap.curve));
    return html`
      <div class="chart"><canvas role="img" aria-label=${t("curve.chart_label")}></canvas></div>
      ${editable && config.curve_editor && !config.compact ? html`
        <table>
          <thead><tr><th>${t("curve.outdoor_short")} (°C)</th><th>${t("curve.flow_short")} (°C)</th><th></th></tr></thead>
          <tbody>${pts.map((p, i) => html`<tr>
            <td><input type="number" step="1" aria-label=${t("curve.outdoor_short")} .value=${String(p.x)}
              @change=${(e: Event) => this.edit(i, "x", (e.target as HTMLInputElement).value)} /></td>
            <td><input type="number" step="0.5" aria-label=${t("curve.flow_short")} .value=${String(p.y)}
              @change=${(e: Event) => this.edit(i, "y", (e.target as HTMLInputElement).value)} /></td>
            <td><button class="icon-btn" ?disabled=${pts.length <= 2} aria-label=${t("curve.remove_point")}
              @click=${() => (this.draft = pts.filter((_, j) => j !== i))}><ha-icon icon="mdi:close"></ha-icon></button></td>
          </tr>`)}</tbody>
        </table>
        ${validity !== "ok" ? html`<div class="alert error" role="alert">${t(`curve.invalid.${validity}`)}</div>` : nothing}
        <div class="actions">
          <button class="btn" @click=${() => (this.draft = sortPoints([...pts, suggestPoint(pts)]))}>
            <ha-icon icon="mdi:plus"></ha-icon>${t("curve.add_point")}</button>
          <span style="flex:1"></span>
          <button class="btn" ?disabled=${!dirty} @click=${() => (this.draft = undefined)}>${t("common.discard")}</button>
          <button class="btn primary" ?disabled=${!dirty || validity !== "ok"} @click=${() => this.save()}>${t("common.save")}</button>
        </div>` : nothing}
    `;
  }
}
