import { html, nothing, css, svg, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import { Chart, cssVar } from "../chart.js";
import { BmsSection } from "../components.js";
import type { SectionOptions } from "../config.js";
import { formatNumber, formatSigned, formatTime } from "../i18n.js";
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
  { key: "out", axis: "yTemp", color: "--bms-err", fallback: "#db4437" },
  { key: "result", axis: "yTemp", color: "--bms-ok", fallback: "#43a047" },
  { key: "act_wind", axis: "yWind", color: "--bms-info", fallback: "#039be5" },
  { key: "act_rain", axis: "yRain", color: "--bms-frost", fallback: "#00bcd4" },
  { key: "act_hum", axis: "yPct", color: "--bms-night", fallback: "#7e57c2" },
  { key: "act_clouds", axis: "yPct", color: "--bms-muted", fallback: "#888" },
];

@customElement("bms-sec-influences")
export class BmsInfluencesSection extends BmsSection<SectionOptions["influences"]> {
  static styles = [baseStyles, css`
    .chart { position: relative; height: 200px; margin-bottom: 6px; }
    .series { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .series i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
    .item { padding: 6px 0; }
    .item + .item { border-top: 1px solid var(--bms-border); }
    .head { display: flex; align-items: center; gap: 10px; min-height: 40px; }
    .head > ha-icon { --mdc-icon-size: 22px; color: var(--bms-muted); }
    .head.on > ha-icon { color: var(--primary-color); }
    .text { flex: 1; min-width: 0; }
    .name { font-weight: 500; }
    .desc { font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); }
    .effect { font-weight: 600; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
    .effect.zero { color: var(--bms-muted); font-weight: 400; }
    .details { padding: 4px 0 8px 32px; }
    .details .grid { --bms-col: 200px; }
    .ramp { width: 100%; max-width: 280px; height: 60px; display: block; margin: 4px 0; }
    .sun svg { width: 100%; max-height: 110px; }
  `];

  @state() private open = new Set<ItemId>();
  @state() private shown = new Set<keyof ChartPoint>(["out", "result"]);
  @query("canvas") private canvas?: HTMLCanvasElement;
  private chart?: Chart;
  private chartKey = "";
  private optionsKey = "";

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
      this.chart?.destroy();
      this.chart = undefined;
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

  private toggleSeries(key: keyof ChartPoint): void {
    const next = new Set(this.shown);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.shown = next;
  }

  private toggleOpen(id: ItemId): void {
    const next = new Set(this.open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.open = next;
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

  private weatherItem(id: WeatherId) {
    const { snap, lang, editable } = this.ctx;
    const t = this.t;
    const inf = WEATHER[id];
    const enabled = this.on(`vliv_${id}`);
    const useFc = this.on(`${id}_predpoved`);
    const used = snap.values[`${useFc ? "forecast" : "actual"}_${inf.value}`];
    const effect = Number(snap.values[inf.corr] ?? 0);
    const open = this.open.has(id);
    const full = this.options.controls === "full" && editable;
    return html`<div class="item">
      <div class="head ${enabled ? "on" : ""}">
        <ha-icon icon=${inf.icon}></ha-icon>
        <div class="text">
          <div class="name">${t(`influences.${id}`)}</div>
          <div class="desc">${formatNumber(used, lang)} ${inf.unit}
            ${useFc ? t("influences.in_hours", { hours: this.num(`${id}_predpoved_hodin`) }) : t("influences.now")}</div>
        </div>
        <span class="effect ${Math.abs(effect) < 0.05 ? "zero" : ""}">${formatSigned(effect, lang)} °C</span>
        ${full ? html`<button class="icon-btn" aria-expanded=${open} aria-label=${t("influences.edit")}
          @click=${() => this.toggleOpen(id)}><ha-icon icon=${open ? "mdi:chevron-up" : "mdi:tune-variant"}></ha-icon></button>` : nothing}
        <ha-switch .checked=${enabled} ?disabled=${!editable} aria-label=${t(`influences.${id}`)}
          @change=${(e: Event) => this.setSetting(`vliv_${id}`, (e.target as HTMLInputElement).checked, t(`influences.${id}`))}></ha-switch>
      </div>
      ${open && full ? html`<div class="details">
        ${this.ramp(id, inf.unit, used)}
        <div class="small muted">${t("influences.values", {
          now: formatNumber(snap.values[`actual_${inf.value}`], lang), fc: formatNumber(snap.values[`forecast_${inf.value}`], lang), unit: inf.unit,
        })}</div>
        <div class="grid">
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
      </div>` : nothing}
    </div>`;
  }

  /** Solární okno a poloha slunce (azimut 0–360°, elevace 0–90°). */
  private sunDiagram() {
    const { snap } = this.ctx;
    const y = (el: number) => 90 - Math.max(0, Math.min(90, el));
    const start = this.num("solarni_start");
    const end = this.num("solarni_konec");
    const now = [snap.values.actual_sun_azimuth, snap.values.actual_sun_elevation];
    const fc = [snap.values.forecast_sun_azimuth, snap.values.forecast_sun_elevation];
    return svg`<svg viewBox="0 0 360 100" role="img" aria-label=${this.t("influences.sun_diagram")}>
      <rect x=${start} y="0" width=${Math.max(0, end - start)} height="90" fill="var(--bms-warn)" opacity="0.12"></rect>
      <line x1="0" y1="90" x2="360" y2="90" stroke="var(--bms-border)"></line>
      ${[90, 180, 270].map((a) => svg`<line x1=${a} y1="86" x2=${a} y2="94" stroke="var(--bms-border)"></line>`)}
      ${fc[0] !== null && fc[0] !== undefined && fc[1] !== null && fc[1] !== undefined
        ? svg`<circle cx=${Number(fc[0])} cy=${y(Number(fc[1]))} r="5" fill="none" stroke="var(--bms-warn)" stroke-dasharray="2 2"></circle>`
        : nothing}
      ${now[0] !== null && now[0] !== undefined && now[1] !== null && now[1] !== undefined
        ? svg`<circle cx=${Number(now[0])} cy=${y(Number(now[1]))} r="6" fill="var(--bms-warn)"></circle>`
        : nothing}
    </svg>`;
  }

  private sunItem() {
    const { snap, lang, editable } = this.ctx;
    const t = this.t;
    const v = snap.values;
    const enabled = this.on("vliv_slunce");
    const useFc = this.on("pouziti_predpovedi");
    const effect = Number(v.corr_sun ?? 0);
    const open = this.open.has("slunce");
    const full = this.options.controls === "full" && editable;
    const az = useFc ? v.forecast_sun_azimuth : v.actual_sun_azimuth;
    const el = useFc ? v.forecast_sun_elevation : v.actual_sun_elevation;
    return html`<div class="item sun">
      <div class="head ${enabled ? "on" : ""}">
        <ha-icon icon="mdi:weather-sunny"></ha-icon>
        <div class="text">
          <div class="name">${t("influences.sun")}</div>
          <div class="desc">${t("influences.sun_position", { az: formatNumber(az, lang, 0), el: formatNumber(el, lang, 0) })}
            ${useFc ? t("influences.in_hours", { hours: this.num("slunce_predpoved_hodin") }) : t("influences.now")}</div>
        </div>
        <span class="effect ${Math.abs(effect) < 0.05 ? "zero" : ""}">${formatSigned(effect, lang)} °C</span>
        ${full ? html`<button class="icon-btn" aria-expanded=${open} aria-label=${t("influences.edit")}
          @click=${() => this.toggleOpen("slunce")}><ha-icon icon=${open ? "mdi:chevron-up" : "mdi:tune-variant"}></ha-icon></button>` : nothing}
        <ha-switch .checked=${enabled} ?disabled=${!editable} aria-label=${t("influences.sun")}
          @change=${(e: Event) => this.setSetting("vliv_slunce", (e.target as HTMLInputElement).checked, t("influences.sun"))}></ha-switch>
      </div>
      ${open && full ? html`<div class="details">
        ${this.sunDiagram()}
        <div class="grid">
          <div>
            <bms-toggle .ctx=${this.ctx} key="pouziti_predpovedi" label=${t("influences.use_forecast_sun")}></bms-toggle>
            <bms-number .ctx=${this.ctx} key="slunce_predpoved_hodin" label=${t("influences.horizon")}></bms-number>
          </div>
          <div>
            <bms-number .ctx=${this.ctx} key="solarni_start" label=${t("setting.solarni_start")}></bms-number>
            <bms-number .ctx=${this.ctx} key="solarni_konec" label=${t("setting.solarni_konec")}></bms-number>
            <bms-number .ctx=${this.ctx} key="slunce_max_eff" label=${t("influences.max")}></bms-number>
          </div>
        </div>
      </div>` : nothing}
    </div>`;
  }

  protected render() {
    const { config, snap } = this.ctx;
    const t = this.t;
    const el = this as unknown as Element;
    const chart = this.options.chart && !config.compact;
    return html`
      ${chart ? html`
        <div class="chart"><canvas role="img" aria-label=${t("influences.chart_label")}></canvas></div>
        <div class="series" role="group" aria-label=${t("influences.series_label")}>
          ${this.availableSeries.map((s) => html`<button class="chip" aria-pressed=${this.shown.has(s.key)}
            @click=${() => this.toggleSeries(s.key)}>
            <i style="background:${cssVar(el, s.color, s.fallback)}"></i>${t(`influences.series.${String(s.key)}`)}</button>`)}
        </div>` : nothing}
      ${!snap.forecast_ok ? html`<div class="alert info"><ha-icon icon="mdi:information-outline"></ha-icon>${t("alert.no_forecast")}</div>` : nothing}
      ${this.options.items.map((id) => (id === "slunce" ? this.sunItem() : this.weatherItem(id)))}
    `;
  }
}
