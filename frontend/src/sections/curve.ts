import { html, nothing, css, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { Chart, cssVar, withAlpha } from "../chart.js";
import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTemp } from "../i18n.js";
import {
  curveInput, curveSlope, interpolate, pointsEqual, shiftCurve, slopeCurve, sortPoints, suggestPoint, validatePoints,
} from "../logic.js";
import { baseStyles } from "../styles.js";
import type { CalcResult, CurvePoint } from "../types.js";

const DRAG_RADIUS = 16;

@customElement("bms-sec-curve")
export class BmsCurveSection extends BmsSection<SectionOptions["curve"]> {
  static styles = [baseStyles, css`
    .chart { position: relative; height: 230px; }
    .chart.drag canvas { touch-action: none; cursor: grab; }
    .chart.dragging canvas { cursor: grabbing; }
    .legend { display: flex; gap: 6px 14px; font-size: var(--ha-font-size-xs, 12px); color: var(--bms-muted); margin: 4px 0 2px; flex-wrap: wrap; }
    .legend i { display: inline-block; width: 12px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 5px; }
    .legend i.band { height: 8px; opacity: 0.35; }
    .toolbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 6px 8px; border-radius: 12px; background: var(--bms-surface); margin-bottom: 8px; }
    .toolbar .lbl { font-size: var(--ha-font-size-xs, 12px); color: var(--bms-muted); margin: 0 2px 0 6px; }
    .toolbar button.btn { background: var(--card-background-color, #fff); min-height: 36px; padding: 0 12px; }
    .toolbar .icon-btn[aria-pressed="true"] { color: var(--primary-color); }
    .edit-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: var(--ha-font-size-s, 13px); }
    th, td { padding: 4px 6px; text-align: left; }
    th { color: var(--bms-muted); font-weight: 500; }
    td input { width: 88px; }
    .sim { display: flex; align-items: center; gap: 10px; font-size: var(--ha-font-size-s, 13px); padding: 8px 12px;
      border-radius: 12px; background: var(--bms-surface); margin-top: 10px; flex-wrap: wrap; }
    .sim input[type="range"] { flex: 1; min-width: 120px; accent-color: var(--primary-color); min-height: 0; padding: 0; border: none; background: none; }
    .sim .res { flex-basis: 100%; }
    .sim .res b { font-weight: 600; }
    .footer { margin-top: 10px; }
  `];

  @state() private draft?: CurvePoint[];
  @state() private editing = false;
  @state() private tableOpen = false;
  @state() private simOpen = false;
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
  private limits: [number, number] = [0, 100];

  private get points(): CurvePoint[] {
    return this.draft ?? sortPoints(this.snap.curve);
  }

  private get canEdit(): boolean {
    return this.ctx.editable && this.options.editor !== "none";
  }

  private get canDrag(): boolean {
    return this.editing && (this.options.editor === "points" || this.options.editor === "full");
  }

  private get dirty(): boolean {
    return this.draft !== undefined && !pointsEqual(sortPoints(this.draft), sortPoints(this.snap.curve));
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
    const sim = this.simOpen && this.simResult && this.simOutdoor !== undefined ? { x: this.simOutdoor, y: this.simResult.result } : null;
    const key = JSON.stringify([pts, this.editing, xMin, xMax, r?.total_correction, r?.t_min, r?.t_max, r?.result, sim,
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
    this.limits = [tMin, tMax];
    const samples: number[] = [];
    for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x += 1) samples.push(x);
    const base = samples.map((x) => ({ x, y: interpolate(pts, x) }));
    const modified = base.map((p) => ({ x: p.x, y: p.y + corr }));
    const clamped = modified.map((p) => ({ x: p.x, y: Math.min(tMax, Math.max(tMin, p.y)) }));

    const el = this as unknown as Element;
    const cBase = cssVar(el, "--bms-cool", "#1e88e5");
    const cMod = cssVar(el, "--bms-heat", "#ff7a00");
    const cRes = cssVar(el, "--bms-ok", "#2e9d4f");
    const cWarn = cssVar(el, "--bms-warn", "#f2a100");
    const cSim = cssVar(el, "--bms-night", "#7e57c2");
    const cText = cssVar(el, "--secondary-text-color", "#888");
    const cGrid = cssVar(el, "--divider-color", "rgba(127,127,127,.2)");

    const datasets: Record<string, unknown>[] = [
      { label: t("curve.base"), data: base, borderColor: cBase, pointRadius: 0, borderWidth: 2.5 },
    ];
    if (this.editing) {
      const saved = sortPoints(this.snap.curve);
      if (this.dirty) {
        datasets.push({ label: t("curve.saved_curve"), data: samples.map((x) => ({ x, y: interpolate(saved, x) })),
          borderColor: withAlpha(cText, 0.8), borderDash: [4, 3], pointRadius: 0, borderWidth: 1.5 });
      }
      datasets.push({ label: t("curve.points"), data: pts, type: "scatter", borderColor: cBase,
        backgroundColor: cssVar(el, "--card-background-color", "#fff"), borderWidth: 2.5,
        pointRadius: this.canDrag ? 7 : 5, pointHoverRadius: this.canDrag ? 9 : 6 });
    }
    if (this.has("modified")) {
      datasets.push({ label: t("curve.modified"), data: modified, borderColor: cMod, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 });
    }
    if (this.has("result") && !this.editing) {
      datasets.push({ label: t("curve.result"), data: clamped, borderColor: cRes, pointRadius: 0, borderWidth: 2.5 });
    }
    if (this.has("current") && r && snap.values.applied_out_temp !== null && snap.values.applied_out_temp !== undefined && !this.editing) {
      datasets.push({ label: t(curveInput(snap).forecast ? "curve.current_forecast" : "curve.current"), type: "scatter", pointRadius: 7, pointBorderWidth: 2,
        data: [{ x: Number(snap.values.applied_out_temp), y: r.result }], borderColor: cssVar(el, "--card-background-color", "#fff"),
        backgroundColor: cRes });
    }
    if (this.has("safe_point")) {
      datasets.push({ label: t("curve.safe_point"), type: "scatter", pointRadius: 6, pointStyle: "triangle",
        data: [{ x: Number(snap.settings.safe_temp), y: Number(snap.settings.safe_curve_temp) }], borderColor: cWarn, backgroundColor: cWarn });
    }
    if (sim) {
      datasets.push({ label: t("curve.simulated"), type: "scatter", pointRadius: 7, data: [sim], borderColor: cSim,
        backgroundColor: withAlpha(cSim, 0.4), borderWidth: 2 });
    }

    const showLimits = this.has("limits");
    const bands = {
      id: "limitBands",
      beforeDatasetsDraw: (chart: Chart) => {
        if (!showLimits) return;
        const { left, right, top, bottom } = chart.chartArea;
        const y = chart.scales.y;
        const c = chart.ctx;
        c.save();
        c.fillStyle = withAlpha(cWarn, 0.1);
        const yMax = Math.max(top, Math.min(bottom, y.getPixelForValue(this.limits[1])));
        const yMin = Math.max(top, Math.min(bottom, y.getPixelForValue(this.limits[0])));
        c.fillRect(left, top, right - left, yMax - top);
        c.fillRect(left, yMin, right - left, bottom - yMin);
        c.restore();
      },
    };

    if (this.chart) {
      this.chart.data.datasets = datasets as never;
      this.chart.update("none");
      return;
    }
    this.chart = new Chart(this.canvas, {
      type: "line",
      data: { datasets: datasets as never },
      plugins: [bands],
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: { type: "linear", reverse: true, ticks: { color: cText, callback: (v) => `${formatNumber(Number(v), lang, 0)}` },
               grid: { color: cGrid }, title: { display: true, text: t("curve.outdoor_axis"), color: cText } },
          y: { ticks: { color: cText }, grid: { color: cGrid } },
        },
        plugins: {
          legend: { display: false },
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

  // ── Tažení bodů (jen v režimu úprav, jinak se přes graf dá posouvat stránka) ──
  private hitPoint(e: PointerEvent): number {
    const chart = this.chart;
    if (!chart) return -1;
    let best = -1;
    let bestDist = DRAG_RADIUS;
    this.points.forEach((p, i) => {
      const dist = Math.hypot(chart.scales.x.getPixelForValue(p.x) - e.offsetX, chart.scales.y.getPixelForValue(p.y) - e.offsetY);
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
    if (this.dragIndex >= 0) this.scheduleSim();
    this.dragIndex = -1;
    this.dragging = false;
  }

  // ── Úpravy ─────────────────────────────────────────────────────────────────
  private edit(index: number, field: "x" | "y", value: string): void {
    const pts = [...this.points];
    pts[index] = { ...pts[index], [field]: Number(value.replace(",", ".")) };
    this.transform(pts);
  }

  private transform(pts: CurvePoint[]): void {
    this.draft = pts;
    this.scheduleSim();
  }

  private stopEditing(): void {
    this.editing = false;
    this.draft = undefined;
    this.tableOpen = false;
    this.scheduleSim();
  }

  private async save(): Promise<void> {
    const pts = sortPoints(this.points);
    const ok = await this.run(() => this.ctx.store.callService("set_curve_points", { points: pts }), this.t("curve.saved"));
    if (ok) this.stopEditing();
  }

  // ── Co kdyby ───────────────────────────────────────────────────────────────
  private scheduleSim(): void {
    if (!this.simOpen || this.simOutdoor === undefined) return;
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

  private toggleSim(): void {
    this.simOpen = !this.simOpen;
    if (this.simOpen) {
      const [xMin, xMax] = this.range;
      this.simOutdoor ??= Math.max(xMin, Math.min(xMax, Math.round(Number(this.snap.values.applied_out_temp ?? 0)) - 5));
      this.scheduleSim();
    }
  }

  private renderSim() {
    const { lang } = this.ctx;
    const t = this.t;
    const [xMin, xMax] = this.range;
    const value = this.simOutdoor ?? 0;
    const r = this.simResult;
    return html`<div class="sim">
      <ha-icon icon="mdi:flask-outline" class="muted"></ha-icon>
      <label for="sim">${t("curve.what_if")}</label>
      <input id="sim" type="range" min=${xMin} max=${xMax} step="1" .value=${String(value)}
        @input=${(e: Event) => { this.simOutdoor = Number((e.target as HTMLInputElement).value); this.scheduleSim(); }} />
      <b>${formatSigned(value, lang, 0).replace(/^\+/, "")} °C</b>
      <div class="res" role="status">${r ? html`${t("curve.what_if_result")} <b>${formatTemp(r.result, lang)}</b>
        ${r.clamped ? html` <span class="limit" style="color:var(--bms-warn)">(${t("curve.what_if_clamped")})</span>` : nothing}
        ${this.dirty ? html` <span class="muted">${t("curve.what_if_draft")}</span>` : nothing}` : html`<span class="muted">…</span>`}</div>
    </div>`;
  }

  private renderLegend() {
    const t = this.t;
    const items: [string, string, boolean][] = [[t("curve.base"), "var(--bms-cool)", false]];
    if (this.has("result")) items.push([t("curve.result"), "var(--bms-ok)", false]);
    if (this.has("modified")) items.push([t("curve.modified"), "var(--bms-heat)", false]);
    if (this.has("safe_point")) items.push([t("curve.safe_point"), "var(--bms-warn)", false]);
    if (this.has("limits")) items.push([t("curve.out_of_limits"), "var(--bms-warn)", true]);
    return html`<div class="legend">${items.map(([label, color, band]) =>
      html`<span><i class=${band ? "band" : ""} style="background:${color}"></i>${label}</span>`)}</div>`;
  }

  protected render() {
    const { config, lang } = this.ctx;
    const t = this.t;
    const pts = this.points;
    const validity = validatePoints(pts);
    const editor = this.options.editor;
    const tools = editor === "shift" || editor === "full";
    const table = (editor === "points" || editor === "full") && !config.compact;
    return html`
      ${this.editing ? html`<div class="edit-head">
        <span class="small muted">${this.canDrag ? t("curve.drag_hint") : t("curve.edit_hint")}</span>
        <span class="spacer"></span>
        ${this.dirty ? html`<span class="badge warn">${t("curve.unsaved")}</span>` : nothing}
      </div>
      ${tools || table ? html`<div class="toolbar">
        ${tools && validity === "ok" ? html`
          <span class="lbl">${t("curve.shift")}</span>
          <button class="btn" aria-label=${t("curve.shift_down")} @click=${() => this.transform(shiftCurve(pts, -0.5))}>${formatSigned(-0.5, lang)}</button>
          <button class="btn" aria-label=${t("curve.shift_up")} @click=${() => this.transform(shiftCurve(pts, 0.5))}>${formatSigned(0.5, lang)}</button>
          <span class="lbl" title=${t("curve.slope_hint")}>${t("curve.slope", { value: formatNumber(curveSlope(pts), lang, 2) })}</span>
          <button class="btn" aria-label=${t("curve.flatter")} @click=${() => this.transform(slopeCurve(pts, 0.95))}>
            <ha-icon icon="mdi:angle-acute"></ha-icon>${t("curve.flatter_short")}</button>
          <button class="btn" aria-label=${t("curve.steeper")} @click=${() => this.transform(slopeCurve(pts, 1.05))}>
            <ha-icon icon="mdi:angle-obtuse"></ha-icon>${t("curve.steeper_short")}</button>` : nothing}
        <span class="spacer"></span>
        ${table ? html`<button class="icon-btn" aria-pressed=${this.tableOpen} aria-label=${t("curve.table")} title=${t("curve.table")}
          @click=${() => (this.tableOpen = !this.tableOpen)}><ha-icon icon="mdi:table"></ha-icon></button>` : nothing}
      </div>` : nothing}` : nothing}
      <div class="chart ${this.canDrag ? "drag" : ""} ${this.dragging ? "dragging" : ""}"
        @pointerdown=${(e: PointerEvent) => this.onPointerDown(e)}
        @pointermove=${(e: PointerEvent) => this.onPointerMove(e)}
        @pointerup=${() => this.onPointerUp()}
        @pointercancel=${() => this.onPointerUp()}>
        <canvas role="img" aria-label=${t("curve.chart_label")}></canvas>
      </div>
      ${this.editing ? nothing : this.renderLegend()}
      ${this.editing && this.tableOpen ? html`
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
        </table>
        <button class="btn text" @click=${() => this.transform(sortPoints([...pts, suggestPoint(pts)]))}>
          <ha-icon icon="mdi:plus"></ha-icon>${t("curve.add_point")}</button>` : nothing}
      ${this.editing && validity !== "ok" ? html`<div class="alert error" role="alert"><span>${t(`curve.invalid.${validity}`)}</span></div>` : nothing}
      ${this.simOpen ? this.renderSim() : nothing}
      <div class="actions footer">
        ${this.options.simulate ? html`<button class="btn" aria-pressed=${this.simOpen} @click=${() => this.toggleSim()}>
          <ha-icon icon="mdi:flask-outline"></ha-icon>${t("curve.what_if_button")}</button>` : nothing}
        <span class="spacer"></span>
        ${this.editing ? html`
          <button class="btn text" @click=${() => this.stopEditing()}>${t(this.dirty ? "common.discard" : "common.close")}</button>
          <button class="btn primary" ?disabled=${!this.dirty || validity !== "ok"} @click=${() => this.save()}>
            <ha-icon icon="mdi:content-save"></ha-icon>${t("curve.save")}</button>`
          : this.canEdit ? html`<button class="btn" @click=${() => (this.editing = true)}>
            <ha-icon icon="mdi:pencil"></ha-icon>${t("curve.edit")}</button>` : nothing}
      </div>
    `;
  }
}
