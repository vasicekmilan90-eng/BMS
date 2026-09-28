import { html, nothing, css, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { Chart, cssVar, withAlpha } from "../chart.js";
import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTemp } from "../i18n.js";
import {
  curveSlope, interpolate, pointsEqual, shiftCurve, slopeCurve, sortPoints, suggestPoint, validatePoints,
} from "../logic.js";
import { baseStyles } from "../styles.js";
import type { CalcResult, CurvePoint } from "../types.js";

const DRAG_RADIUS = 14;

@customElement("bms-sec-curve")
export class BmsCurveSection extends BmsSection<SectionOptions["curve"]> {
  static styles = [baseStyles, css`
    .chart { position: relative; height: 240px; }
    .chart.drag canvas { touch-action: none; cursor: grab; }
    .chart.dragging canvas { cursor: grabbing; }
    .tools { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-top: 10px; }
    .tool { display: inline-flex; align-items: center; gap: 4px; font-size: var(--ha-font-size-s, 13px); }
    .tool .muted { margin-right: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: var(--ha-font-size-s, 13px); }
    th, td { padding: 4px 6px; text-align: left; }
    th { color: var(--bms-muted); font-weight: 500; }
    td input { width: 80px; }
    .sim { margin-top: 12px; padding: 8px 10px; border-radius: 8px; border: 1px dashed var(--bms-border); }
    .sim .row { min-height: 32px; }
    .sim input[type="range"] { flex: 1; min-width: 120px; accent-color: var(--primary-color); }
    .sim .res { font-size: var(--ha-font-size-s, 13px); }
    .sim .res b { font-weight: 600; }
  `];

  @state() private draft?: CurvePoint[];
  @state() private simOutdoor?: number;
  @state() private simResult?: CalcResult;
  @state() private dragging = false;
  @query("canvas") private canvas?: HTMLCanvasElement;
  private chart?: Chart;
  private chartKey = "";
  private optionsKey = "";
  private dragIndex = -1;
  private simTimer?: number;
  private simSeq = 0;

  private get points(): CurvePoint[] {
    return this.draft ?? sortPoints(this.snap.curve);
  }

  private get canEdit(): boolean {
    return this.ctx.editable && this.options.editor !== "none";
  }

  private get canDrag(): boolean {
    return this.canEdit && (this.options.editor === "points" || this.options.editor === "full");
  }

  private get range(): [number, number] {
    const pts = this.points;
    const [a, b] = this.options.range
      ?? [Number(this.snap.settings.rozsah_venku_min ?? -20), Number(this.snap.settings.rozsah_venku_max ?? 20)];
    return [Math.min(a, pts[0]?.x ?? a), Math.max(b, pts.at(-1)?.x ?? b)];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.chart?.destroy();
    this.chart = undefined;
    this.chartKey = "";
    window.clearTimeout(this.simTimer);
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.renderChart();
  }

  private has(series: SectionOptions["curve"]["series"][number]): boolean {
    return this.options.series.includes(series);
  }

  private renderChart(): void {
    if (!this.canvas) return;
    const { snap, lang, t } = this.ctx;
    const r = snap.result;
    const pts = this.points;
    if (pts.length < 2) return;
    const [xMin, xMax] = this.range;
    const sim = this.simResult && this.simOutdoor !== undefined ? { x: this.simOutdoor, y: this.simResult.result } : null;
    const key = JSON.stringify([pts, xMin, xMax, r?.total_correction, r?.t_min, r?.t_max, r?.result, sim,
      snap.values.applied_out_temp, snap.settings.safe_temp, snap.settings.safe_curve_temp, this.options.series, lang,
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
    const cSim = cssVar(el, "--bms-night", "#7e57c2");
    const cText = cssVar(el, "--secondary-text-color", "#888");
    const cGrid = cssVar(el, "--divider-color", "rgba(127,127,127,.2)");

    const datasets: Record<string, unknown>[] = [
      { label: t("curve.base"), data: base, borderColor: cBase, backgroundColor: withAlpha(cBase, 0.08), fill: true, pointRadius: 0, borderWidth: 2 },
      { label: t("curve.points"), data: pts, type: "scatter", borderColor: cBase, backgroundColor: cBase,
        pointRadius: this.canDrag ? 6 : 4, pointHoverRadius: this.canDrag ? 8 : 5 },
    ];
    if (this.has("modified")) {
      datasets.push({ label: t("curve.modified"), data: modified, borderColor: cMod, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 });
    }
    if (this.has("result")) datasets.push({ label: t("curve.result"), data: clamped, borderColor: cRes, pointRadius: 0, borderWidth: 2 });
    if (this.has("current") && r && snap.values.applied_out_temp !== null && snap.values.applied_out_temp !== undefined) {
      datasets.push({ label: t("curve.current"), type: "scatter", pointRadius: 7, pointStyle: "rectRot",
        data: [{ x: Number(snap.values.applied_out_temp), y: r.result }], borderColor: cRes, backgroundColor: cRes });
    }
    if (this.has("safe_point")) {
      datasets.push({ label: t("curve.safe_point"), type: "scatter", pointRadius: 6, pointStyle: "triangle",
        data: [{ x: Number(snap.settings.safe_temp), y: Number(snap.settings.safe_curve_temp) }], borderColor: cWarn, backgroundColor: cWarn });
    }
    if (sim) {
      datasets.push({ label: t("curve.simulated"), type: "scatter", pointRadius: 7, pointStyle: "circle",
        data: [sim], borderColor: cSim, backgroundColor: withAlpha(cSim, 0.4), borderWidth: 2 });
    }
    if (this.has("limits")) {
      datasets.push(
        { label: t("curve.limits"), data: [{ x: xMin, y: tMax }, { x: xMax, y: tMax }], borderColor: withAlpha(cWarn, 0.7),
          borderDash: [2, 3], pointRadius: 0, borderWidth: 1 },
        { label: "", data: [{ x: xMin, y: tMin }, { x: xMax, y: tMin }], borderColor: withAlpha(cWarn, 0.7),
          borderDash: [2, 3], pointRadius: 0, borderWidth: 1 },
      );
    }

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

  // ── Tažení bodů ────────────────────────────────────────────────────────────
  private hitPoint(e: PointerEvent): number {
    const chart = this.chart;
    if (!chart) return -1;
    let best = -1;
    let bestDist = DRAG_RADIUS;
    this.points.forEach((p, i) => {
      const dx = chart.scales.x.getPixelForValue(p.x) - e.offsetX;
      const dy = chart.scales.y.getPixelForValue(p.y) - e.offsetY;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.canDrag) return;
    const index = this.hitPoint(e);
    if (index < 0) return;
    this.dragIndex = index;
    this.dragging = true;
    this.draft = [...this.points];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragIndex < 0 || !this.chart) return;
    const y = Math.round(this.chart.scales.y.getValueForPixel(e.offsetY)! * 2) / 2;
    const pts = [...this.points];
    if (!Number.isFinite(y) || pts[this.dragIndex].y === y) return;
    pts[this.dragIndex] = { ...pts[this.dragIndex], y: Math.min(95, Math.max(5, y)) };
    this.draft = pts;
  }

  private onPointerUp(): void {
    this.dragIndex = -1;
    this.dragging = false;
    if (this.simOutdoor !== undefined) this.scheduleSim();
  }

  // ── Úpravy ─────────────────────────────────────────────────────────────────
  private edit(index: number, field: "x" | "y", value: string): void {
    const pts = [...this.points];
    pts[index] = { ...pts[index], [field]: Number(value.replace(",", ".")) };
    this.draft = pts;
    this.scheduleSim();
  }

  private transform(pts: CurvePoint[]): void {
    this.draft = pts;
    this.scheduleSim();
  }

  private async save(): Promise<void> {
    const pts = sortPoints(this.points);
    const ok = await this.run(() => this.ctx.store.callService("set_curve_points", { points: pts }), this.t("curve.saved"));
    if (ok) this.draft = undefined;
  }

  // ── Co kdyby ───────────────────────────────────────────────────────────────
  private scheduleSim(): void {
    if (this.simOutdoor === undefined) return;
    window.clearTimeout(this.simTimer);
    this.simTimer = window.setTimeout(() => this.simulate(), 200);
  }

  private async simulate(): Promise<void> {
    const outdoor = this.simOutdoor;
    if (outdoor === undefined) return;
    const seq = ++this.simSeq;
    const curve = this.draft && validatePoints(this.draft) === "ok" ? sortPoints(this.draft) : undefined;
    try {
      const result = await this.ctx.store.simulate(outdoor, curve);
      if (seq === this.simSeq) this.simResult = result;
    } catch {
      if (seq === this.simSeq) this.simResult = undefined;
    }
  }

  private renderSim() {
    const { lang } = this.ctx;
    const t = this.t;
    const [xMin, xMax] = this.range;
    const current = Number(this.snap.values.applied_out_temp ?? 0);
    const value = this.simOutdoor ?? Math.round(current);
    const r = this.simResult;
    return html`<div class="sim">
      <div class="row">
        <label class="small" for="sim">${t("curve.what_if")}</label>
        <input id="sim" type="range" min=${xMin} max=${xMax} step="1" .value=${String(value)}
          @input=${(e: Event) => { this.simOutdoor = Number((e.target as HTMLInputElement).value); this.scheduleSim(); }} />
        <span class="small" style="min-width:56px;text-align:right">${formatTemp(value, lang, 0)}</span>
        ${this.simOutdoor !== undefined ? html`<button class="icon-btn" aria-label=${t("curve.what_if_reset")}
          @click=${() => { this.simOutdoor = undefined; this.simResult = undefined; }}><ha-icon icon="mdi:close"></ha-icon></button>` : nothing}
      </div>
      ${r && this.simOutdoor !== undefined ? html`<div class="res" role="status">${t("curve.what_if_result", {
        out: formatNumber(this.simOutdoor, lang, 0), curve: formatNumber(r.curve_temp, lang),
        corr: formatSigned(r.total_correction, lang),
      })} <b>${formatTemp(r.result, lang)}</b>${r.clamped ? html` <span class="chip warn">${t("status.clamped")}</span>` : nothing}
        ${this.draft ? html` <span class="muted">(${t("curve.what_if_draft")})</span>` : nothing}</div>`
        : html`<div class="small muted">${t("curve.what_if_hint")}</div>`}
    </div>`;
  }

  protected render() {
    const { config, lang } = this.ctx;
    const t = this.t;
    const pts = this.points;
    const validity = validatePoints(pts);
    const dirty = this.draft !== undefined && !pointsEqual(sortPoints(this.draft), sortPoints(this.snap.curve));
    const editor = this.options.editor;
    const tools = this.canEdit && (editor === "shift" || editor === "full");
    const table = this.canEdit && (editor === "points" || editor === "full") && !config.compact;
    return html`
      <div class="chart ${this.canDrag ? "drag" : ""} ${this.dragging ? "dragging" : ""}"
        @pointerdown=${(e: PointerEvent) => this.onPointerDown(e)}
        @pointermove=${(e: PointerEvent) => this.onPointerMove(e)}
        @pointerup=${() => this.onPointerUp()}
        @pointercancel=${() => this.onPointerUp()}>
        <canvas role="img" aria-label=${t("curve.chart_label")}></canvas>
      </div>
      ${this.canDrag ? html`<div class="small muted">${t("curve.drag_hint")}</div>` : nothing}
      ${tools && validity === "ok" ? html`<div class="tools">
        <span class="tool"><span class="muted">${t("curve.shift")}</span>
          <button class="btn" aria-label=${t("curve.shift_down")} @click=${() => this.transform(shiftCurve(pts, -0.5))}>${formatSigned(-0.5, lang)}</button>
          <button class="btn" aria-label=${t("curve.shift_up")} @click=${() => this.transform(shiftCurve(pts, 0.5))}>${formatSigned(0.5, lang)}</button>
        </span>
        <span class="tool"><span class="muted">${t("curve.slope", { value: formatNumber(curveSlope(pts), lang, 2) })}</span>
          <button class="btn" aria-label=${t("curve.flatter")} @click=${() => this.transform(slopeCurve(pts, 0.95))}>
            <ha-icon icon="mdi:angle-acute"></ha-icon>${t("curve.flatter_short")}</button>
          <button class="btn" aria-label=${t("curve.steeper")} @click=${() => this.transform(slopeCurve(pts, 1.05))}>
            <ha-icon icon="mdi:angle-obtuse"></ha-icon>${t("curve.steeper_short")}</button>
        </span>
      </div>` : nothing}
      ${table ? html`
        <table>
          <thead><tr><th>${t("curve.outdoor_short")} (°C)</th><th>${t("curve.flow_short")} (°C)</th><th></th></tr></thead>
          <tbody>${pts.map((p, i) => html`<tr>
            <td><input type="number" step="1" aria-label=${t("curve.outdoor_short")} .value=${String(p.x)}
              @change=${(e: Event) => this.edit(i, "x", (e.target as HTMLInputElement).value)} /></td>
            <td><input type="number" step="0.5" aria-label=${t("curve.flow_short")} .value=${String(p.y)}
              @change=${(e: Event) => this.edit(i, "y", (e.target as HTMLInputElement).value)} /></td>
            <td><button class="icon-btn" ?disabled=${pts.length <= 2} aria-label=${t("curve.remove_point")}
              @click=${() => this.transform(pts.filter((_, j) => j !== i))}><ha-icon icon="mdi:close"></ha-icon></button></td>
          </tr>`)}</tbody>
        </table>` : nothing}
      ${this.canEdit && validity !== "ok" ? html`<div class="alert error" role="alert">${t(`curve.invalid.${validity}`)}</div>` : nothing}
      ${this.canEdit && (table || dirty) ? html`<div class="actions" style="margin-top:8px">
        ${table ? html`<button class="btn" @click=${() => this.transform(sortPoints([...pts, suggestPoint(pts)]))}>
          <ha-icon icon="mdi:plus"></ha-icon>${t("curve.add_point")}</button>` : nothing}
        <span class="spacer"></span>
        <button class="btn" ?disabled=${!dirty} @click=${() => { this.draft = undefined; this.scheduleSim(); }}>${t("common.discard")}</button>
        <button class="btn primary" ?disabled=${!dirty || validity !== "ok"} @click=${() => this.save()}>${t("common.save")}</button>
      </div>` : nothing}
      ${this.options.simulate ? this.renderSim() : nothing}
    `;
  }
}
