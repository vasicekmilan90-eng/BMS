import { html, nothing, css, svg, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { Chart, cssVar } from "../chart.js";
import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTime } from "../i18n.js";
import { SUN_MODES, sunCoverage, type SunMode } from "../logic.js";
import { baseStyles } from "../styles.js";
import type { ChartPoint } from "../types.js";

type ItemId = SectionOptions["influences"]["items"][number];
type WeatherId = Exclude<ItemId, "slunce">;

const WEATHER: Record<WeatherId, { value: string; icon: string; unit: string; corr: string; series: keyof ChartPoint }> = {
  vitr: { value: "wind", icon: "mdi:weather-windy", unit: "km/h", corr: "corr_wind", series: "act_wind" },
  srazky: { value: "rain", icon: "mdi:weather-pouring", unit: "mm/h", corr: "corr_rain", series: "act_rain" },
  vlhkost: { value: "humidity", icon: "mdi:water-percent", unit: "%", corr: "corr_humidity", series: "act_hum" },
  oblacnost: { value: "clouds", icon: "mdi:weather-cloudy", unit: "%", corr: "corr_clouds", series: "act_clouds" },
};

const SERIES: { key: keyof ChartPoint; axis: string; color: string; fallback: string }[] = [
  { key: "out", axis: "yTemp", color: "--bms-err", fallback: "#d93025" },
  { key: "result", axis: "yTemp", color: "--bms-ok", fallback: "#2e9d4f" },
  { key: "act_wind", axis: "yWind", color: "--bms-cool", fallback: "#1e88e5" },
  { key: "act_rain", axis: "yRain", color: "--bms-frost", fallback: "#00bcd4" },
  { key: "act_hum", axis: "yPct", color: "--bms-night", fallback: "#7e57c2" },
  { key: "act_clouds", axis: "yPct", color: "--bms-muted", fallback: "#888" },
];

/** Diagram: azimut 45–315° (V–J–Z), elevace 0–70°. */
const AZ0 = 45;
const AZ1 = 315;
const EL_MAX = 70;
const W = 300;
const H = 110;
const ax = (az: number) => ((Math.min(AZ1, Math.max(AZ0, az)) - AZ0) / (AZ1 - AZ0)) * W;
const ay = (el: number) => H - (Math.max(0, Math.min(EL_MAX, el)) / EL_MAX) * (H - 6);

@customElement("bms-sec-influences")
export class BmsInfluencesSection extends BmsSection<SectionOptions["influences"]> {
  static styles = [baseStyles, css`
    .chart { position: relative; height: 190px; margin-bottom: 6px; }
    .series { margin-bottom: 8px; }
    .series i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
    .effect { font-variant-numeric: tabular-nums; font-weight: 500; min-width: 64px; text-align: right; }
    .effect.plus { color: var(--bms-heat); } .effect.minus { color: var(--bms-cool); } .effect.zero { color: var(--bms-muted); font-weight: 400; }
    .more { display: flex; gap: 8px; align-items: center; min-height: 44px; font-size: var(--ha-font-size-s, 13px); color: var(--bms-muted); }
    .more button.link { color: var(--bms-muted); font-weight: 400; }
    .ramp { width: 100%; max-width: 300px; height: 60px; display: block; margin: 4px 0; }
    .sun svg.diagram { width: 100%; max-width: 420px; display: block; margin: 6px 0 2px; }
    .axis { display: flex; justify-content: space-between; max-width: 420px; font-size: 10px; color: var(--bms-muted); }
    .hint { font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); margin: 6px 0; }
    .coverage { font-size: var(--ha-font-size-s, 12px); margin: 6px 0; }
    .coverage.warn { color: var(--bms-warn); }
    .dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0 16px; }
  `];

  @state() private open = new Set<ItemId>();
  @state() private moreOpen = false;
  @state() private chartOpen = false;
  @state() private shown = new Set<keyof ChartPoint>(["out", "result"]);
  @query("canvas") private canvas?: HTMLCanvasElement;
  private chart?: Chart;
  private chartKey = "";
  private optionsKey = "";

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.destroyChart();
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = undefined;
    this.chartKey = "";
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (!this.canvas && this.chart) this.destroyChart();
    this.renderChart();
  }

  private get availableSeries() {
    const items = this.options.items;
    return SERIES.filter((s) => s.key === "out" || s.key === "result"
      || (Object.keys(WEATHER) as WeatherId[]).some((id) => items.includes(id) && WEATHER[id].series === s.key));
  }

  private renderChart(): void {
    if (!this.canvas) return;
    const { snap, lang, t } = this.ctx;
    const points = [...snap.history, ...snap.forecast.filter((f) => f.ts > (snap.history.at(-1)?.ts ?? 0))];
    const series = this.availableSeries;
    const key = JSON.stringify([points.length, points[0]?.ts, points.at(-1)?.ts, snap.history.at(-1), lang,
      this.ctx.hass.themes?.darkMode, [...this.shown], series.map((s) => s.key)]);
    if (key === this.chartKey && this.chart) return;
    this.chartKey = key;
    const optionsKey = `${lang}|${this.ctx.hass.themes?.darkMode}`;
    if (optionsKey !== this.optionsKey) {
      this.destroyChart();
      this.optionsKey = optionsKey;
    }
    const now = Date.now();
    const el = this as unknown as Element;
    const cText = cssVar(el, "--secondary-text-color", "#888");
    const cGrid = cssVar(el, "--divider-color", "rgba(127,127,127,.2)");
    const datasets = series.map((s) => {
      const color = cssVar(el, s.color, s.fallback);
      return {
        label: t(`influences.series.${String(s.key)}`),
        yAxisID: s.axis,
        data: points.filter((p) => p[s.key] !== null && p[s.key] !== undefined)
          .map((p) => ({ x: p.ts * 1000, y: Number(p[s.key]), fc: Boolean(p._fc) })),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: s.key === "result" || s.key === "out" ? 2 : 1.5,
        segment: { borderDash: (ctx: { p1: { raw: { fc: boolean } } }) => (ctx.p1.raw.fc ? [4, 3] : undefined) },
        hidden: !this.shown.has(s.key),
      };
    });
    const showWind = this.shown.has("act_wind");
    const nowLine = {
      id: "nowLine",
      afterDraw: (chart: Chart) => {
        const x = chart.scales.x.getPixelForValue(now);
        const { top, bottom } = chart.chartArea;
        const c = chart.ctx;
        c.save();
        c.strokeStyle = cText;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.moveTo(x, top);
        c.lineTo(x, bottom);
        c.stroke();
        c.restore();
      },
    };
    if (this.chart) {
      this.chart.data.datasets = datasets as never;
      const yWind = this.chart.options.scales?.yWind;
      if (yWind) yWind.display = showWind;
      this.chart.update("none");
      return;
    }
    this.chart = new Chart(this.canvas, {
      type: "line",
      data: { datasets: datasets as never },
      plugins: [nowLine],
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "linear", ticks: { color: cText, callback: (v) => formatTime(Number(v) / 1000, lang), maxTicksLimit: 8 },
               grid: { color: cGrid } },
          yTemp: { position: "left", ticks: { color: cText }, grid: { color: cGrid }, title: { display: true, text: "°C", color: cText } },
          yWind: { display: showWind, position: "right", ticks: { color: cText }, grid: { display: false },
                   title: { display: true, text: "km/h", color: cText } },
          yPct: { display: false, min: 0, max: 100 },
          yRain: { display: false, min: 0 },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => items.length ? formatTime(Number(items[0].parsed.x) / 1000, lang) : "" } },
        },
      },
    });
  }

  private toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  private effectOf(id: ItemId): number {
    const v = this.snap.values;
    return Number((id === "slunce" ? v.corr_sun : v[WEATHER[id].corr]) ?? 0);
  }

  private isActive(id: ItemId): boolean {
    return this.on(`vliv_${id}`) && Math.abs(this.effectOf(id)) >= 0.05;
  }

  private effect(value: number) {
    const cls = Math.abs(value) < 0.05 ? "zero" : value > 0 ? "plus" : "minus";
    return html`<span class="effect ${cls}">${formatSigned(value, this.ctx.lang)} °C</span>`;
  }

  private row(id: ItemId, icon: string, name: string, desc: string) {
    const { editable } = this.ctx;
    const t = this.t;
    const enabled = this.on(`vliv_${id}`);
    const full = this.options.controls === "full" && editable;
    const open = this.open.has(id);
    return html`<div class="item">
      <span class="ico ${enabled ? "on" : ""}"><ha-icon icon=${icon}></ha-icon></span>
      <div class="txt"><div class="name">${name}</div><div class="desc">${desc}</div></div>
      ${this.effect(this.effectOf(id))}
      ${full ? html`<button class="icon-btn" aria-expanded=${open} aria-label=${t("influences.edit")} title=${t("influences.edit")}
        @click=${() => (this.open = this.toggle(this.open, id))}><ha-icon icon=${open ? "mdi:chevron-up" : "mdi:tune-variant"}></ha-icon></button>` : nothing}
      <ha-switch .checked=${enabled} ?disabled=${!editable} aria-label=${name}
        @change=${(e: Event) => this.setSetting(`vliv_${id}`, (e.target as HTMLInputElement).checked, name)}></ha-switch>
    </div>
    ${open && full ? (id === "slunce" ? this.sunDetails() : this.weatherDetails(id)) : nothing}`;
  }

  private weatherRow(id: WeatherId) {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const inf = WEATHER[id];
    const useFc = this.on(`${id}_predpoved`);
    const used = snap.values[`${useFc ? "forecast" : "actual"}_${inf.value}`];
    const when = useFc ? t("influences.in_hours", { hours: this.num(`${id}_predpoved_hodin`) }) : t("influences.now");
    return this.row(id, inf.icon, t(`influences.${id}`), `${formatNumber(used, lang)} ${inf.unit} · ${when}`);
  }

  private sunRow() {
    const { snap } = this.ctx;
    const t = this.t;
    const mode = this.sunMode;
    const factor = Number(snap.result?.sun_factor ?? snap.values.sun_factor ?? 0);
    const useFc = this.on("slunce_predpoved");
    const when = useFc ? t("influences.in_hours", { hours: this.num("slunce_predpoved_hodin") }) : t("influences.now");
    const where = factor > 0 ? t(`sun.in.${mode}`, { pct: Math.round(factor * 100) }) : t(`sun.out.${mode}`);
    return this.row("slunce", "mdi:weather-sunny", t("influences.sun"), `${t(`sun.mode.${mode}`)} · ${where} · ${when}`);
  }

  private get sunMode(): SunMode {
    const mode = String(this.snap.settings.slunce_rezim ?? "okno");
    return (SUN_MODES as readonly string[]).includes(mode) ? (mode as SunMode) : "okno";
  }

  /** Průběh korekce: 0 pod „od“, lineárně do „max“ na „do“. */
  private ramp(key: WeatherId, unit: string, current: number | null | undefined) {
    const { lang } = this.ctx;
    const from = this.num(`${key}_od`);
    const to = this.num(`${key}_do`);
    const max = this.num(`${key}_max_eff`);
    const span = Math.max(1, to - from);
    const x0 = Math.max(0, from - span * 0.3);
    const x1 = to + span * 0.3;
    const px = (v: number) => 10 + ((v - x0) / (x1 - x0)) * 260;
    const py = (e: number) => 50 - (Math.abs(e) / (Math.abs(max) || 1)) * 40;
    const effect = (v: number) => (v <= from ? 0 : v >= to ? max : max * ((v - from) / (to - from)));
    return svg`<svg class="ramp" viewBox="0 0 280 60" role="img"
      aria-label=${this.t("influences.ramp", { from: formatNumber(from, lang), to: formatNumber(to, lang), unit, max: formatSigned(max, lang) })}>
      <line x1="10" y1="50" x2="270" y2="50" stroke="var(--bms-border)"></line>
      <polyline points="${px(x0)},50 ${px(from)},50 ${px(to)},${py(max)} ${px(x1)},${py(max)}" fill="none"
        stroke="var(--primary-color)" stroke-width="2"></polyline>
      ${current !== null && current !== undefined && Number.isFinite(current)
        ? svg`<circle cx=${px(Math.min(x1, Math.max(x0, current)))} cy=${py(effect(current))} r="4" fill="var(--bms-heat)"></circle>`
        : nothing}
      <text x=${px(from)} y="59" font-size="9" fill="var(--bms-muted)" text-anchor="middle">${formatNumber(from, lang, 0)}</text>
      <text x=${px(to)} y="59" font-size="9" fill="var(--bms-muted)" text-anchor="middle">${formatNumber(to, lang, 0)} ${unit}</text>
      <text x=${px(to) + 4} y=${py(max) - 4} font-size="9" fill="var(--bms-muted)">${formatSigned(max, lang)} °C</text>
    </svg>`;
  }

  private weatherDetails(id: WeatherId) {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const inf = WEATHER[id];
    const useFc = this.on(`${id}_predpoved`);
    const used = snap.values[`${useFc ? "forecast" : "actual"}_${inf.value}`];
    return html`<div class="item-details">
      ${this.ramp(id, inf.unit, used)}
      <div class="small muted">${t("influences.values", {
        now: formatNumber(snap.values[`actual_${inf.value}`], lang), fc: formatNumber(snap.values[`forecast_${inf.value}`], lang), unit: inf.unit,
      })}</div>
      <div class="dgrid">
        <div>
          <bms-toggle .ctx=${this.ctx} key="${id}_predpoved" label=${t("influences.use_forecast")}></bms-toggle>
          <bms-number .ctx=${this.ctx} key="${id}_predpoved_hodin" label=${t("influences.horizon")}></bms-number>
        </div>
        <div>
          <bms-number .ctx=${this.ctx} key="${id}_od" label=${t("influences.from")}></bms-number>
          <bms-number .ctx=${this.ctx} key="${id}_do" label=${t("influences.to")}></bms-number>
          <bms-number .ctx=${this.ctx} key="${id}_max_eff" label=${t("influences.max")}></bms-number>
        </div>
      </div>
    </div>`;
  }

  /** Dráha slunce dnes a o slunovratech + oblast, kde slunce počítáme. */
  private sunDiagram(mode: SunMode) {
    const { snap } = this.ctx;
    const t = this.t;
    const paths = snap.sun_paths;
    const line = (pts: [number, number][] | undefined) => (pts ?? []).map(([az, el]) => `${ax(az).toFixed(1)},${ay(el).toFixed(1)}`).join(" ");
    const orient = this.num("slunce_orientace");
    const start = this.num("solarni_start");
    const end = this.num("solarni_konec");
    const v = snap.values;
    const sunAz = v.sun_azimuth;
    const sunEl = v.sun_elevation;
    return svg`<svg class="diagram" viewBox="0 0 ${W} ${H + 2}" role="img" aria-label=${t("sun.diagram")}>
      <defs>
        <linearGradient id="facade" x1="0" x2="1">
          <stop offset="0" stop-color="var(--bms-warn)" stop-opacity="0"></stop>
          <stop offset="0.5" stop-color="var(--bms-warn)" stop-opacity="0.3"></stop>
          <stop offset="1" stop-color="var(--bms-warn)" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${mode === "okno" ? svg`<rect x=${ax(start)} y="0" width=${Math.max(0, ax(end) - ax(start))} height=${H} fill="var(--bms-warn)" opacity="0.18"></rect>` : nothing}
      ${mode === "fasada" ? svg`
        <rect x=${ax(orient - 90)} y="0" width=${Math.max(0, ax(orient + 90) - ax(orient - 90))} height=${H} fill="url(#facade)"></rect>
        <line x1=${ax(orient)} x2=${ax(orient)} y1="0" y2=${H} stroke="var(--bms-warn)" stroke-width="1.5" stroke-dasharray="3 3"></line>` : nothing}
      ${mode === "nad_obzorem" && paths?.today.length ? svg`
        <polygon points="${ax(paths.today[0][0])},${H} ${line(paths.today)} ${ax(paths.today.at(-1)![0])},${H}" fill="var(--bms-warn)" opacity="0.18"></polygon>` : nothing}
      <line x1="0" x2=${W} y1=${H} y2=${H} stroke="var(--bms-border)"></line>
      ${[90, 180, 270].map((a) => svg`<line x1=${ax(a)} x2=${ax(a)} y1="0" y2=${H} stroke="var(--bms-border)" stroke-dasharray="2 4"></line>`)}
      <polyline points=${line(paths?.summer)} fill="none" stroke="var(--bms-muted)" stroke-width="1" stroke-dasharray="3 3"></polyline>
      <polyline points=${line(paths?.winter)} fill="none" stroke="var(--bms-muted)" stroke-width="1" stroke-dasharray="3 3"></polyline>
      <polyline points=${line(paths?.today)} fill="none" stroke="var(--bms-warn)" stroke-width="2"></polyline>
      ${sunAz !== null && sunAz !== undefined && sunEl !== null && sunEl !== undefined && sunEl > 0
        ? svg`<circle cx=${ax(sunAz)} cy=${ay(sunEl)} r="6" fill="var(--bms-warn)" stroke="var(--card-background-color, #fff)" stroke-width="2"></circle>` : nothing}
      ${paths?.summer.length ? svg`<text x=${ax(180) + 4} y=${ay(Math.max(...paths.summer.map((p) => p[1]))) - 3} font-size="9" fill="var(--bms-muted)">${t("sun.summer")}</text>` : nothing}
      ${paths?.winter.length ? svg`<text x=${ax(180) + 4} y=${ay(Math.max(...paths.winter.map((p) => p[1]))) - 3} font-size="9" fill="var(--bms-muted)">${t("sun.winter")}</text>` : nothing}
    </svg>
    <div class="axis"><span>${t("sun.east")}</span><span>${t("sun.south")}</span><span>${t("sun.west")}</span></div>`;
  }

  private sunDetails() {
    const t = this.t;
    const mode = this.sunMode;
    const paths = this.snap.sun_paths;
    const coverage = mode === "okno" && paths
      ? (["winter", "today", "summer"] as const).map((k) => sunCoverage(paths[k], this.num("solarni_start"), this.num("solarni_konec")))
      : null;
    const uneven = coverage ? Math.max(...coverage) - Math.min(...coverage) > 0.2 : false;
    return html`<div class="item-details sun">
      <div class="seg" role="group" aria-label=${t("sun.mode")}>
        ${SUN_MODES.map((m) => html`<button aria-pressed=${m === mode} ?disabled=${!this.ctx.editable}
          @click=${() => m !== mode && this.setSetting("slunce_rezim", m, t("sun.mode"))}>${t(`sun.mode.${m}`)}</button>`)}
      </div>
      <div class="hint">${t(`sun.hint.${mode}`)}</div>
      ${this.sunDiagram(mode)}
      ${coverage ? html`<div class="coverage ${uneven ? "warn" : ""}">${t("sun.coverage", {
        winter: Math.round(coverage[0] * 100), today: Math.round(coverage[1] * 100), summer: Math.round(coverage[2] * 100),
      })}${uneven ? html` ${t("sun.coverage_tip")}` : nothing}</div>` : nothing}
      <div class="dgrid">
        <div>
          ${mode === "okno" ? html`
            <bms-number .ctx=${this.ctx} key="solarni_start" label=${t("setting.solarni_start")}></bms-number>
            <bms-number .ctx=${this.ctx} key="solarni_konec" label=${t("setting.solarni_konec")}></bms-number>` : nothing}
          ${mode === "fasada" ? html`<bms-number .ctx=${this.ctx} key="slunce_orientace" label=${t("setting.slunce_orientace")}></bms-number>` : nothing}
          <bms-number .ctx=${this.ctx} key="slunce_max_eff" label=${t("influences.max")}></bms-number>
        </div>
        <div>
          <bms-toggle .ctx=${this.ctx} key="slunce_predpoved" label=${t("influences.use_forecast")} name=${t("influences.sun")}></bms-toggle>
          <bms-number .ctx=${this.ctx} key="slunce_predpoved_hodin" label=${t("influences.horizon")}></bms-number>
        </div>
      </div>
    </div>`;
  }

  private rowFor(id: ItemId) {
    return id === "slunce" ? this.sunRow() : this.weatherRow(id);
  }

  protected render() {
    const { config, snap } = this.ctx;
    const t = this.t;
    const el = this as unknown as Element;
    const items = this.options.items;
    // Slunce zůstává vidět i bez účinku (noc) — jinak by jeho nastavení nebylo k nalezení.
    const active = items.filter((id) => this.isActive(id) || this.open.has(id) || (id === "slunce" && this.on("vliv_slunce")));
    const rest = items.filter((id) => !active.includes(id));
    const chartAllowed = this.options.chart && !config.compact;
    return html`
      ${!snap.forecast_ok ? html`<div class="alert info"><ha-icon icon="mdi:information-outline"></ha-icon><span>${t("alert.no_forecast")}</span></div>` : nothing}
      ${active.map((id) => this.rowFor(id))}
      ${rest.length ? html`<div class="more">
        <button class="link" aria-expanded=${this.moreOpen} @click=${() => (this.moreOpen = !this.moreOpen)}>
          <ha-icon icon=${this.moreOpen ? "mdi:chevron-down" : "mdi:chevron-right"}></ha-icon>
          ${t("influences.no_effect", { count: rest.length, list: rest.map((id) => t(`influences.${id}`).toLowerCase()).join(", ") })}</button>
        <span class="spacer"></span>
        ${chartAllowed ? html`<button class="link" aria-expanded=${this.chartOpen} @click=${() => (this.chartOpen = !this.chartOpen)}>
          ${t("influences.chart_24h")}</button>` : nothing}
      </div>
      ${this.moreOpen ? rest.map((id) => this.rowFor(id)) : nothing}` : chartAllowed ? html`<div class="more"><span class="spacer"></span>
        <button class="link" aria-expanded=${this.chartOpen} @click=${() => (this.chartOpen = !this.chartOpen)}>${t("influences.chart_24h")}</button></div>` : nothing}
      ${chartAllowed && this.chartOpen ? html`
        <div class="chart"><canvas role="img" aria-label=${t("influences.chart_label")}></canvas></div>
        <div class="chips series" role="group" aria-label=${t("influences.series_label")}>
          ${this.availableSeries.map((s) => html`<button class="chip" aria-pressed=${this.shown.has(s.key)}
            @click=${() => (this.shown = this.toggle(this.shown, s.key))}>
            <i style="background:${cssVar(el, s.color, s.fallback)}"></i>${t(`influences.series.${String(s.key)}`)}</button>`)}
        </div>` : nothing}
    `;
  }
}
