import { html, nothing, css, svg, type PropertyValues } from "lit";
import { customElement, query } from "lit/decorators.js";

import { Chart, cssVar } from "../chart.js";
import { BmsSection } from "../components.js";
import { formatNumber, formatSigned, formatTime } from "../i18n.js";
import { baseStyles } from "../styles.js";
import type { ChartPoint } from "../types.js";

interface Influence {
  key: "vitr" | "srazky" | "vlhkost" | "oblacnost";
  value: "wind" | "rain" | "humidity" | "clouds";
  icon: string;
  unit: string;
  corr: "corr_wind" | "corr_rain" | "corr_humidity" | "corr_clouds";
}

const INFLUENCES: Influence[] = [
  { key: "vitr", value: "wind", icon: "mdi:weather-windy", unit: "km/h", corr: "corr_wind" },
  { key: "srazky", value: "rain", icon: "mdi:weather-pouring", unit: "mm/h", corr: "corr_rain" },
  { key: "vlhkost", value: "humidity", icon: "mdi:water-percent", unit: "%", corr: "corr_humidity" },
  { key: "oblacnost", value: "clouds", icon: "mdi:weather-cloudy", unit: "%", corr: "corr_clouds" },
];

const SERIES: { key: keyof ChartPoint; axis: string; color: string; fallback: string }[] = [
  { key: "out", axis: "yTemp", color: "--bms-err", fallback: "#db4437" },
  { key: "result", axis: "yTemp", color: "--bms-ok", fallback: "#43a047" },
  { key: "act_wind", axis: "yWind", color: "--bms-info", fallback: "#039be5" },
  { key: "act_rain", axis: "yRain", color: "--bms-frost", fallback: "#00bcd4" },
  { key: "act_hum", axis: "yPct", color: "--bms-night", fallback: "#7e57c2" },
  { key: "act_clouds", axis: "yPct", color: "--bms-muted", fallback: "#888" },
];

@customElement("bms-sec-influences")
export class BmsInfluencesSection extends BmsSection {
  static styles = [baseStyles, css`
    :host { --bms-col: 230px; }
    .chart { position: relative; height: 220px; margin-bottom: 12px; }
    .vals { display: flex; gap: 8px; margin: 4px 0; }
    .val { flex: 1; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--bms-border); font-size: var(--ha-font-size-s, 12px); }
    .val.used { border-color: var(--primary-color); }
    .val .n { font-weight: 500; font-size: var(--ha-font-size-m, 14px); }
    .effect { margin-left: auto; font-weight: 600; }
    .sun svg { width: 100%; max-height: 110px; }
  `];

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

  private renderChart(): void {
    if (!this.canvas || this.ctx.config.compact) return;
    const { snap, lang, t } = this.ctx;
    const points = [...snap.history, ...snap.forecast.filter((f) => f.ts > (snap.history.at(-1)?.ts ?? 0))];
    const key = JSON.stringify([points.length, points[0]?.ts, points.at(-1)?.ts, snap.history.at(-1), lang,
      this.ctx.hass.themes?.darkMode]);
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
    const datasets = SERIES.map((s) => {
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
        hidden: s.axis === "yRain",
      };
    });
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
          yWind: { position: "right", ticks: { color: cText }, grid: { display: false }, title: { display: true, text: "km/h", color: cText } },
          yPct: { display: false, min: 0, max: 100 },
          yRain: { display: false, min: 0 },
        },
        plugins: {
          legend: { labels: { color: cText, boxWidth: 12 } },
          tooltip: { callbacks: { title: (items) => items.length ? formatTime(Number(items[0].parsed.x) / 1000, lang) : "" } },
        },
      },
    });
  }

  private influenceTile(inf: Influence) {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const useFc = this.on(`${inf.key}_predpoved`);
    const actual = snap.values[`actual_${inf.value}`];
    const forecast = snap.values[`forecast_${inf.value}`];
    const effect = snap.values[inf.corr];
    return html`<div class="tile">
      <div class="tile-title">
        <ha-icon icon=${inf.icon}></ha-icon>${t(`influences.${inf.key}`)}
        <span class="effect">${formatSigned(effect, lang)} °C</span>
      </div>
      <bms-toggle .ctx=${this.ctx} key="vliv_${inf.key}" label=${t("influences.enabled")}></bms-toggle>
      <div class="vals">
        <div class="val ${useFc ? "" : "used"}"><div class="muted">${t("influences.actual")}</div>
          <span class="n">${formatNumber(actual, lang)}</span> ${inf.unit}</div>
        <div class="val ${useFc ? "used" : ""}"><div class="muted">${t("influences.forecast_in", { hours: this.num(`${inf.key}_predpoved_hodin`) })}</div>
          <span class="n">${formatNumber(forecast, lang)}</span> ${inf.unit}</div>
      </div>
      <bms-toggle .ctx=${this.ctx} key="${inf.key}_predpoved" label=${t("influences.use_forecast")}></bms-toggle>
      <bms-number .ctx=${this.ctx} key="${inf.key}_predpoved_hodin" label=${t("influences.horizon")}></bms-number>
      <bms-number .ctx=${this.ctx} key="${inf.key}_od" label=${t("influences.from")}></bms-number>
      <bms-number .ctx=${this.ctx} key="${inf.key}_do" label=${t("influences.to")}></bms-number>
      <bms-number .ctx=${this.ctx} key="${inf.key}_max_eff" label=${t("influences.max")}></bms-number>
    </div>`;
  }

  /** Jednoduché znázornění solárního okna a polohy slunce (azimut 0–360°, elevace 0–90°). */
  private sunDiagram() {
    const { snap } = this.ctx;
    const x = (az: number) => (az / 360) * 360;
    const y = (el: number) => 90 - Math.max(0, Math.min(90, el));
    const start = this.num("solarni_start");
    const end = this.num("solarni_konec");
    const now = [snap.values.actual_sun_azimuth, snap.values.actual_sun_elevation];
    const fc = [snap.values.forecast_sun_azimuth, snap.values.forecast_sun_elevation];
    return svg`<svg viewBox="0 0 360 100" role="img" aria-label=${this.t("influences.sun_diagram")}>
      <rect x=${x(start)} y="0" width=${Math.max(0, x(end) - x(start))} height="90" fill="var(--bms-warn)" opacity="0.12"></rect>
      <line x1="0" y1="90" x2="360" y2="90" stroke="var(--bms-border)"></line>
      ${[90, 180, 270].map((a) => svg`<line x1=${x(a)} y1="86" x2=${x(a)} y2="94" stroke="var(--bms-border)"></line>`)}
      ${fc[0] !== null && fc[1] !== null
        ? svg`<circle cx=${x(Number(fc[0]))} cy=${y(Number(fc[1]))} r="5" fill="none" stroke="var(--bms-warn)" stroke-dasharray="2 2"></circle>`
        : nothing}
      ${now[0] !== null && now[1] !== null
        ? svg`<circle cx=${x(Number(now[0]))} cy=${y(Number(now[1]))} r="6" fill="var(--bms-warn)"></circle>`
        : nothing}
    </svg>`;
  }

  private sunTile() {
    const { snap, lang } = this.ctx;
    const t = this.t;
    const v = snap.values;
    return html`<div class="tile sun" style="grid-column:1/-1">
      <div class="tile-title"><ha-icon icon="mdi:weather-sunny"></ha-icon>${t("influences.sun")}
        <span class="effect">${formatSigned(v.corr_sun, lang)} °C</span></div>
      ${this.ctx.config.compact ? nothing : this.sunDiagram()}
      <div class="vals">
        <div class="val ${this.on("pouziti_predpovedi") ? "" : "used"}"><div class="muted">${t("influences.actual")}</div>
          <span class="n">${formatNumber(v.actual_sun_azimuth, lang, 0)}° / ${formatNumber(v.actual_sun_elevation, lang, 0)}°</span></div>
        <div class="val ${this.on("pouziti_predpovedi") ? "used" : ""}"><div class="muted">${t("influences.forecast_in", { hours: this.num("slunce_predpoved_hodin") })}</div>
          <span class="n">${formatNumber(v.forecast_sun_azimuth, lang, 0)}° / ${formatNumber(v.forecast_sun_elevation, lang, 0)}°</span></div>
      </div>
      <div class="grid" style="--bms-col:220px">
        <div>
          <bms-toggle .ctx=${this.ctx} key="vliv_slunce" label=${t("influences.enabled")}></bms-toggle>
          <bms-toggle .ctx=${this.ctx} key="pouziti_predpovedi" label=${t("influences.use_forecast_sun")}></bms-toggle>
          <bms-number .ctx=${this.ctx} key="slunce_predpoved_hodin" label=${t("influences.horizon")}></bms-number>
        </div>
        <div>
          <bms-number .ctx=${this.ctx} key="solarni_start" label=${t("setting.solarni_start")}></bms-number>
          <bms-number .ctx=${this.ctx} key="solarni_konec" label=${t("setting.solarni_konec")}></bms-number>
          <bms-number .ctx=${this.ctx} key="slunce_max_eff" label=${t("influences.max")}></bms-number>
        </div>
      </div>
    </div>`;
  }

  protected render() {
    const { config, snap } = this.ctx;
    return html`
      ${config.compact ? nothing : html`<div class="chart"><canvas role="img" aria-label=${this.t("influences.chart_label")}></canvas></div>`}
      ${!snap.forecast_ok ? html`<div class="alert info"><ha-icon icon="mdi:information-outline"></ha-icon>${this.t("alert.no_forecast")}</div>` : nothing}
      <div class="grid">
        ${INFLUENCES.map((inf) => this.influenceTile(inf))}
        ${this.sunTile()}
      </div>
    `;
  }
}
