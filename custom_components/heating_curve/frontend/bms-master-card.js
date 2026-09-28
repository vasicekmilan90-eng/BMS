// BMS Master Card v5.2 — kompaktní layout: teploty → boost/útlum → rychlé profily → správa profilů → graf
// Kartu i Chart.js servíruje integrace heating_curve na /heating_curve/ — ruční registrace resource není potřeba.
const BMS_CARD_VERSION = "5.2.0";
const BMS_STATIC_BASE = "/heating_curve";

console.info(`%c BMS-MASTER-CARD %c v${BMS_CARD_VERSION} `,
  "color:#fff;background:#1D9E75;font-weight:600", "color:#1D9E75;background:transparent");

// Escapování textu vkládaného do innerHTML (názvy profilů apod. zadává uživatel)
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// Načtení Chart.js — lokální soubor z integrace primárně, CDN jako záloha
(function () {
  if (window.Chart) return;
  const LOCAL_PATH = `${BMS_STATIC_BASE}/chart.umd.min.js`;
  const CDN_PRIMARY = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";

  const onLoad = () => {
    const tryUpdate = () => {
      let found = 0;
      document.querySelectorAll("bms-master-card").forEach(el => {
        if (typeof el._updateChart === "function") { el._updateChart(); found++; }
      });
      if (!found) setTimeout(tryUpdate, 200);
    };
    tryUpdate();
  };

  const loadScript = (src, fallback) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = onLoad;
    s.onerror = () => {
      if (fallback) loadScript(fallback, null);
      else console.warn(`BMS: Nepodařilo se načíst Chart.js (${LOCAL_PATH} ani CDN).`);
    };
    document.head.appendChild(s);
  };

  // Zkus lokální soubor → CDN
  loadScript(LOCAL_PATH, CDN_PRIMARY);
})();

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "bms-master-card")) {
  window.customCards.push({
    type: "bms-master-card",
    name: "BMS Regulátor vytápění",
    description: "Ekvitermní regulace s topnou křivkou a vlivy počasí",
    preview: true,
    documentationURL: "https://github.com/vasicekmilan90-eng/BMS",
  });
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CARD_STYLE = `
:host { display: block; }
ha-card { overflow: hidden; }
.bms { overflow-x: hidden; max-width: 100%; box-sizing: border-box; }
* { box-sizing: border-box; margin: 0; padding: 0; }
/* ── Sémantická barevná paleta ── */
:host {
  --c-ok:       #1D9E75;  /* zelená — topení běží normálně */
  --c-ok-bg:    rgba(29,158,117,.15);
  --c-ok-dim:   rgba(29,158,117,.7);
  --c-info:     #378ADD;  /* modrá — data, info, předpověď */
  --c-info-bg:  rgba(55,138,221,.12);
  --c-warn:     #EF9F27;  /* oranžová — upozornění, limit */
  --c-warn-bg:  rgba(239,159,39,.12);
  --c-err:      #E24B4A;  /* červená — chyba, nebezpečí */
  --c-err-bg:   rgba(226,75,74,.15);
  --c-night:    #7986CB;  /* fialová — noční mód */
  --c-night-bg: rgba(121,134,203,.12);
  --c-frost:    #26A6BF;  /* tyrkysová — protimraz */
  --c-frost-bg: rgba(38,166,191,.12);
  --c-boost:    #E24B4A;  /* červená — boost (topí víc) */
  --c-reduce:   #378ADD;  /* modrá — útlum (topí míň) */
}
ha-card { padding: 0 !important; overflow: hidden; border-radius: 12px !important; }
.bms { padding: 16px; font-family: var(--ha-font-family-body, Roboto, sans-serif); color: var(--primary-text-color); }

/* ── Hlavička s vypínačem + stavová lišta ── */
.bms-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0; }
/* Stavová lišta pod headerem */
.state-bar { height: 3px; border-radius: 0 0 2px 2px; margin: 6px -16px 12px; transition: background .4s; background: transparent; }
.state-bar.active   { background: var(--c-ok); }
.state-bar.boost    { background: var(--c-boost); }
.state-bar.reduction{ background: var(--c-reduce); }
.state-bar.frost    { background: var(--c-frost); }
.state-bar.night    { background: var(--c-night); }
.state-bar.inactive { background: rgba(128,128,128,.2); }
/* Kompaktní / plný režim */
.bms-compact-btn { background: transparent; border: 1px solid var(--divider-color); border-radius: 5px; padding: 2px 6px; font-size: 10px; color: var(--secondary-text-color); cursor: pointer; }
.bms-compact-btn:hover { background: rgba(var(--rgb-primary-text-color,255,255,255),.06); }
/* Přirozený jazykový souhrn */
.summary-row { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 12px; padding: 7px 10px; background: rgba(var(--rgb-primary-text-color,255,255,255),.04); border-radius: 7px; line-height: 1.5; }
.summary-row strong { color: var(--primary-text-color); font-weight: 500; }
.summary-row .sum-tag { display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px; margin: 0 2px; font-weight: 500; }
/* Timestamp */
.calc-timestamp { font-size: 10px; color: var(--secondary-text-color); text-align: right; margin-top: -8px; margin-bottom: 6px; }
/* Sparkline v metrice */
.metric-spark { display: block; margin-top: 4px; opacity: .7; }
/* Alert pruh */
.alert-bar { display: none; margin-bottom: 10px; padding: 7px 12px; border-radius: 7px; font-size: 12px; font-weight: 500; align-items: center; gap: 8px; }
.alert-bar.show { display: flex; }
.alert-bar.boost    { background: var(--c-err-bg);   color: var(--c-err);   border: 1px solid rgba(226,75,74,.3); }
.alert-bar.reduction{ background: var(--c-info-bg); color: var(--c-info); border: 1px solid rgba(55,138,221,.3); }
.alert-bar.frost    { background: var(--c-frost-bg);color: var(--c-frost);border: 1px solid rgba(38,166,191,.3); }
.alert-bar.night    { background: var(--c-night-bg);color: var(--c-night);border: 1px solid rgba(121,134,203,.3); }
.alert-bar.sensor   { background: var(--c-warn-bg); color: var(--c-warn); border: 1px solid rgba(239,159,39,.3); }
/* Sekce skrytá v kompakt módu */
.compact-hidden { transition: opacity .2s; }
.bms.compact .compact-hidden { display: none; }
/* Sezónní presety */
.season-presets { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.season-btn { flex: 1; min-width: 80px; padding: 8px 6px; border-radius: 8px; border: 1px solid var(--divider-color); background: transparent; cursor: pointer; font-size: 12px; text-align: center; transition: all .15s; display: flex; flex-direction: column; align-items: center; }
.season-btn:hover { border-color: #378ADD; background: rgba(55,138,221,.06); }
.season-btn.active { border-color: #1D9E75; background: rgba(29,158,117,.12); }
.season-btn.active .season-lbl { color: #0F6E56; font-weight: 600; }
.season-btn ha-icon { display: block; margin-bottom: 3px; }
.season-btn .season-lbl { font-size: 11px; color: var(--secondary-text-color); margin-top: 3px; }
.season-btn ha-icon { --mdc-icon-size: 22px; }
/* Touch targets — zvětšit interaktivní prvky */
.inf-max-inp { min-height: 36px; }
.num-inp { min-height: 36px; }
.sens-inp { min-height: 34px; }
/* Undo notifikace */
.undo-bar { display: none; position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--primary-text-color); color: var(--card-background-color); padding: 8px 16px; border-radius: 20px; font-size: 12px; z-index: 9999; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
.undo-bar.show { display: flex; }
.undo-btn { background: transparent; border: 1px solid rgba(var(--rgb-card-background-color,255,255,255),.4); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: inherit; }
.bms-title { font-size: 15px; font-weight: 500; color: var(--primary-text-color); }
.bms-subtitle { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }
.bms-tog-wrap { display: flex; align-items: center; gap: 8px; }
.status-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
.status-on  { background: rgba(29,158,117,.18); color: #1D9E75; }
.status-off { background: rgba(180,178,169,.15); color: #888780; }
.main-tog { width: 40px; height: 22px; border-radius: 11px; border: none; cursor: pointer; position: relative; transition: background .2s; flex-shrink: 0; outline: none; }
.main-tog.on  { background: #1D9E75; }
.main-tog.off { background: #B4B2A9; }
.main-tog::after { content: ''; position: absolute; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .2s; }
.main-tog.on::after  { left: 21px; }
.main-tog.off::after { left: 3px; }

/* ── Hero + Metriky ── */
/* Hero — dominantní výsledná teplota */
.hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; align-items: stretch; min-height: 160px; }
.hero-temps { display: flex; flex-direction: column; gap: 6px; }
.hero-temps .hero-result { flex: 1; min-height: 0; }
.hero-temps .metrics { flex: 0 0 auto; }
.hero-log { background: rgba(var(--rgb-primary-text-color,128,128,128),.03); border: 1px solid var(--divider-color); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; overflow: hidden; min-height: 160px; max-height: 300px; }
.hero-log-entries { flex: 1; overflow-y: auto; min-height: 0; }
/* Modes grid — 5 karet v řadě, responsivní */
.modes-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; align-items: stretch; }
.mode-card { background: rgba(var(--rgb-primary-text-color,128,128,128),.04); border: 1px solid rgba(var(--rgb-primary-text-color,128,128,128),.1); border-radius: 10px; padding: 10px 10px 8px; display: flex; flex-direction: column; gap: 5px; height: 100%; box-sizing: border-box; }
.mode-card-title { font-size: 12px; font-weight: 600; color: var(--primary-text-color); margin-bottom: 2px; }
.mode-card-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.mode-card-btns { display: flex; gap: 5px; margin-top: 4px; }
.mode-card-sub { font-size: 10px; color: var(--secondary-text-color); }
/* Profiles grid — 2 sloupce stejné výšky */
.profiles-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; align-items: start; }
.schedules-panel { background: rgba(var(--rgb-primary-text-color,128,128,128),.03); border: 1px solid var(--divider-color); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
/* Settings group label */
.full-only { transition: opacity .2s; }
.bms.compact .full-only { display: none; }
.schedules-panel { background: rgba(var(--rgb-primary-text-color,128,128,128),.03); border: 1px solid var(--divider-color); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; max-height: 420px; }
.schedules-panel > #schedules-list { flex: 1; overflow-y: auto; max-height: 320px; }
.settings-group-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--secondary-text-color); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--divider-color); }
/* Responsive breakpoints */
@media (max-width: 650px) {
  .hero-grid { grid-template-columns: 1fr; min-height: unset; margin-bottom: 14px; }
  .hero-temps { height: auto; }
  .hero-log { min-height: 140px; max-height: 220px; }
  .modes-grid { grid-template-columns: repeat(2, 1fr); }
  .profiles-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .modes-grid { grid-template-columns: repeat(2, 1fr); }
  #inf-chart-wrap > div { height: 200px !important; }
}
@media (max-width: 380px) {
  .modes-grid { grid-template-columns: 1fr; }
}
/* Nastavení gridy — zalomit na jednom sloupci na úzkých displejích */
@media (max-width: 520px) {
  .bms [style*="grid-template-columns:1fr 1fr"] { grid-template-columns: 1fr !important; }
  .bms [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
  .bms [style*="grid-template-columns:1fr 1fr 1fr"] { grid-template-columns: 1fr !important; }
}
/* inf-grid breakpoints handled above */
.hero-result { flex: 0 0 auto; min-width: 100px; background: var(--c-ok-bg); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; justify-content: center; border: 1px solid rgba(29,158,117,.2); transition: background .3s, border-color .3s; }
.hero-result.boost-up { background: var(--c-err-bg);  border-color: rgba(226,75,74,.3); }
.hero-result.boost-dn { background: var(--c-info-bg); border-color: rgba(55,138,221,.3); }
.hero-result.clamped  { background: var(--c-warn-bg); border-color: rgba(239,159,39,.3); }
.hero-result.night    { background: var(--c-night-bg);border-color: rgba(121,134,203,.3); }
.hero-result.frost    { background: var(--c-frost-bg);border-color: rgba(38,166,191,.3); }
.hero-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--c-ok); margin-bottom: 2px; }
.hero-val { font-size: 28px; font-weight: 300; line-height: 1; color: var(--c-ok); letter-spacing: -1px; }
.hero-sub { font-size: 9px; color: var(--c-ok-dim); margin-top: 3px; }
.hero-result.boost-up .hero-lbl,
.hero-result.boost-up .hero-val,
.hero-result.boost-up .hero-sub { color: var(--c-err); }
.hero-result.boost-dn .hero-lbl,
.hero-result.boost-dn .hero-val,
.hero-result.boost-dn .hero-sub { color: var(--c-info); }
.hero-result.clamped .hero-lbl,
.hero-result.clamped .hero-val,
.hero-result.clamped .hero-sub  { color: var(--c-warn); }
.hero-result.night .hero-lbl,
.hero-result.night .hero-val,
.hero-result.night .hero-sub    { color: var(--c-night); }
.hero-result.frost .hero-lbl,
.hero-result.frost .hero-val,
.hero-result.frost .hero-sub    { color: var(--c-frost); }
/* Sekundární metriky vpravo od hero */
.metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; flex: 1; margin-bottom: 0; }
@media (max-width: 380px) { .hero-wrap { flex-direction: column; } .metrics { grid-template-columns: repeat(2, 1fr); } }
.metric { background: rgba(var(--rgb-primary-text-color, 255,255,255), .05); border-radius: 7px; padding: 6px 8px; transition: opacity .2s, background .2s; }
.metric.dim { opacity: 0.45; }
.metric .ml { font-size: 8px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1px; }
.metric .mv { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
.metric .ms { font-size: 8px; color: var(--secondary-text-color); margin-top: 0; }
.metric.accent { background: var(--c-ok-bg); }
.metric.accent .mv { color: var(--c-ok); }
.metric.accent .ms { color: var(--c-ok-dim); }
.metric.mod-pos { background: var(--c-warn-bg); }
.metric.mod-pos .mv { color: var(--c-warn); }
.metric.mod-pos .ms { color: rgba(239,159,39,.7); }
.metric.mod-neg { background: var(--c-info-bg); }
.metric.mod-neg .mv { color: var(--c-info); }
.metric.mod-neg .ms { color: rgba(55,138,221,.7); }
.metric.clamped { background: var(--c-warn-bg); }
.metric.clamped .mv { color: var(--c-warn); }
.metric.clamped .ms { color: rgba(239,159,39,.7); }
.metric.boost-up { background: var(--c-err-bg); }
.metric.boost-up .mv { color: var(--c-err); }
.metric.boost-dn { background: var(--c-info-bg); }
.metric.boost-dn .mv { color: var(--c-info); }

/* ── Sekce ── */
.sec-title { font-size: 11px; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .07em; margin: 14px 0 8px; border-bottom: 1px solid var(--divider-color); padding-bottom: 4px; }
.sec-title-row { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 8px; border-bottom: 1px solid var(--divider-color); padding-bottom: 4px; }
.fc-inline-row { display: flex; align-items: center; gap: 6px; }
.fc-badge { font-size: 10px; padding: 2px 7px; border-radius: 10px; background: var(--c-info-bg); color: var(--c-info); font-weight: 500; border: 1px solid rgba(55,138,221,.25); }
details.bms-details { margin: 10px 0; }
details.bms-details summary { font-size: 11px; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .07em; padding: 6px 10px; border-radius: 6px; cursor: pointer; background: rgba(var(--rgb-primary-text-color,255,255,255),.05); list-style: none; display: flex; align-items: center; justify-content: space-between; user-select: none; }
details.bms-details summary::-webkit-details-marker { display: none; }
details.bms-details summary::after { content: "▼"; font-size: 9px; transition: transform .2s; }
details.bms-details[open] summary::after { transform: rotate(180deg); }
details.bms-details .details-body { padding: 10px 2px 4px; }

/* ── Profily ── */
/* ── Profily ── */
.prof-manager { background: rgba(var(--rgb-primary-text-color,255,255,255),.04); border-radius: 10px; padding: 10px 12px; }
.prof-select-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.prof-select { flex: 1; font-size: 13px; padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 8px; background: var(--card-background-color); color: var(--primary-text-color); cursor: pointer; }
.prof-select:focus { outline: none; border-color: #378ADD; }
.prof-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: var(--c-ok-bg); color: var(--c-ok); font-weight: 500; white-space: nowrap; border: 1px solid rgba(29,158,117,.2); }
.prof-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.prof-btn { font-size: 12px; padding: 5px 12px; border-radius: 7px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background .15s; white-space: nowrap; }
.prof-btn:hover { background: rgba(var(--rgb-primary-text-color,255,255,255),.06); }
.prof-btn.load  { border-color: #378ADD; color: #185FA5; }
.prof-btn.save  { border-color: #1D9E75; color: #0F6E56; }
.prof-btn.del   { border-color: #E24B4A; color: #A32D2D; }
.prof-btn.ren   { border-color: #EF9F27; color: #9A6200; }
.prof-btn:disabled { opacity: 0.4; cursor: default; }
.prof-new-row { display: flex; gap: 6px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--divider-color); }
.prof-new-inp { flex: 1; font-size: 12px; padding: 5px 9px; border: 1px solid var(--divider-color); border-radius: 7px; background: transparent; color: var(--primary-text-color); }
.prof-new-inp:focus { outline: none; border-color: #1D9E75; }
.prof-toast { font-size: 11px; color: #0F6E56; margin-top: 6px; min-height: 16px; transition: opacity .3s; }
.btn { font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); cursor: pointer; transition: background .15s; }
.btn:hover { background: rgba(var(--rgb-primary-text-color,255,255,255),.06); }
.btn-save { border-color: #378ADD; color: #185FA5; }
.btn-del  { border-color: #E24B4A; color: #A32D2D; }

/* ── Graf ── */
.chart-wrap { position: relative; width: 100%; max-width: 100%; overflow: hidden; margin-bottom: 6px; }
.chart-legend { display: flex; gap: 14px; font-size: 11px; color: var(--secondary-text-color); flex-wrap: wrap; margin-bottom: 10px; }
.legend-item { display: flex; align-items: center; gap: 5px; }
.legend-line { width: 18px; height: 2px; display: inline-block; border-radius: 1px; }
.legend-dash { width: 18px; height: 0; display: inline-block; }
.legend-vert { width: 2px; height: 12px; display: inline-block; border-radius: 1px; }

/* ── Akordeon ── */
.accordion-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; background: rgba(var(--rgb-primary-text-color,255,255,255),.05); border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--secondary-text-color); margin-top: 8px; }
.accordion-btn:hover { background: rgba(var(--rgb-primary-text-color,255,255,255),.08); }
.accordion-body { overflow: hidden; max-height: 0; transition: max-height .25s ease; }
.accordion-body.open { max-height: 2000px; }
.accordion-arrow { font-size: 10px; transition: transform .2s; display: inline-block; }
.accordion-arrow.open { transform: rotate(180deg); }

/* ── Tabulka bodů ── */
.curve-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
.curve-table th { font-size: 11px; font-weight: 500; color: var(--secondary-text-color); padding: 4px 6px; text-align: center; border-bottom: 1px solid var(--divider-color); }
.curve-table td { padding: 4px 6px; text-align: center; color: var(--primary-text-color); }
.curve-table tr:nth-child(even) td { background: rgba(var(--rgb-primary-text-color,255,255,255),.03); }
.curve-table td.mod         { color: var(--c-info);  font-weight: 500; }
.curve-table td.clamped-ok  { color: var(--c-ok);   font-weight: 500; }
.curve-table td.clamped-bad { color: var(--c-warn);  font-weight: 500; }

/* ── Řádky (předpověď, slunce) ── */
.row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--divider-color); }
.row:last-child { border-bottom: none; }
.row-label { font-size: 13px; color: var(--primary-text-color); }
.row-val { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
.num-inp { font-size: 13px; padding: 3px 6px; border: 1px solid var(--divider-color); border-radius: 6px; background: transparent; color: var(--primary-text-color); text-align: center; width: 58px; }
.num-inp:focus { outline: none; border-color: #378ADD; }
.num-inp.warn { border-color: #EF9F27; background: rgba(239,159,39,.08); }

/* ── Limity ── */
.limits-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.limit-box { background: rgba(var(--rgb-primary-text-color,255,255,255),.05); border-radius: 8px; padding: 10px 12px; }
.limit-lbl { font-size: 10px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
.limit-sub { font-size: 10px; color: var(--secondary-text-color); margin-top: 5px; }
.limit-warn { margin-top: 8px; padding: 8px 12px; background: var(--c-warn-bg); border-radius: 6px; font-size: 12px; color: var(--c-warn); border: 1px solid rgba(239,159,39,.25); display: none; }

/* ── Vnější vlivy ── */
.inf-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: 100%; max-width: 100%; overflow: hidden; }
@media (min-width: 700px) { .inf-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 480px) { .inf-grid { grid-template-columns: 1fr !important; } }
/* Při aktivní předpovědi — vizuální propojení dat s předpovědí */
.inf-grid.forecast-active .inf-card { border-color: rgba(55,138,221,0.35) !important; }
.inf-grid.forecast-active .inf-card::before { content: ""; display: block; height: 2px; background: linear-gradient(90deg, var(--c-info) 0%, transparent 100%); border-radius: 2px 2px 0 0; margin: -10px -12px 8px; opacity: .5; }
/* Předpověď badge v hlavičce vlivů */
.fc-badge { font-size: 10px; padding: 2px 7px; border-radius: 10px; background: var(--c-info-bg); color: var(--c-info); font-weight: 500; border: 1px solid rgba(55,138,221,.25); }
.inf-card { border-radius: 10px; padding: 10px 12px; border: 1px solid transparent; }
.inf-card.disabled { opacity: 0.55; }
/* Karta nastavení — stejný vizuální styl jako inf-card */
.set-card { border-radius: 10px; padding: 10px 12px; border: 1px solid rgba(var(--rgb-primary-text-color,128,128,128),.1); background: rgba(var(--rgb-primary-text-color,128,128,128),.03); margin-bottom: 8px; display: flex; flex-direction: column; }
.set-card > .set-save-row { margin-top: auto; }
.set-card-title { font-size: 12px; font-weight: 600; color: var(--primary-text-color); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.set-card.dirty { border-color: rgba(55,138,221,.3); background: rgba(55,138,221,.04); }
.set-save-row { display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(var(--rgb-primary-text-color,128,128,128),.08); }
.set-btn-save { flex: 1; font-size: 12px; padding: 5px 0; border-radius: 7px; border: 1px solid #1D9E75; background: rgba(29,158,117,.1); color: #0F6E56; cursor: pointer; font-weight: 500; }
.set-btn-discard { font-size: 12px; padding: 5px 12px; border-radius: 7px; border: 1px solid var(--divider-color); background: transparent; color: var(--secondary-text-color); cursor: pointer; }
.set-btn-save:hover { background: rgba(29,158,117,.18); }
.set-btn-discard:hover { background: rgba(var(--rgb-primary-text-color,128,128,128),.06); }
.set-btn-discard:disabled { opacity: 0.3; cursor: default; pointer-events: none; }
.inf-header { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.inf-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; } /* legacy, ha-icon preferred */
.inf-title { font-size: 13px; font-weight: 500; flex: 1; color: var(--primary-text-color); }
.inf-cur { font-size: 11px; color: var(--secondary-text-color); }
.inf-eff { font-size: 13px; font-weight: 600; min-width: 48px; text-align: right; }
.inf-range-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.inf-range-lbl { font-size: 10px; color: var(--secondary-text-color); white-space: nowrap; }
.inf-range-val { font-size: 10px; font-weight: 500; color: var(--primary-text-color); margin-left: auto; }
.inf-max-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(128,128,128,0.15); }
.inf-max-lbl { font-size: 11px; color: var(--secondary-text-color); flex: 1; }
.inf-max-inp { width: 52px; font-size: 12px; padding: 2px 5px; border: 1px solid var(--divider-color); border-radius: 4px; background: transparent; color: var(--primary-text-color); text-align: center; }
.inf-max-inp:focus { outline: none; border-color: #378ADD; }
.inf-sun-row { display: block; grid-column: 1 / -1; margin-top: 4px; }

/* ── Rozsahový slider (custom, bez input[type=range]) ── */
.range-block { background: rgba(var(--rgb-primary-text-color,255,255,255),.05); border-radius: 8px; padding: 10px 12px; }
/* ── Dual hodnoty v inf-card (aktuální vs předpověď) ── */
.inf-vals { display: flex; gap: 6px; margin-top: 6px; margin-bottom: 2px; }
.inf-val-box { flex: 1; border-radius: 6px; padding: 4px 7px; border: 1px solid transparent; transition: all .2s; }
.inf-val-box.active  { border-color: rgba(55,138,221,.3); background: rgba(55,138,221,.10); }
.inf-val-box.inactive{ background: rgba(128,128,128,.05); opacity: .55; }
.inf-val-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--secondary-text-color); margin-bottom: 1px; }
.inf-val-num { font-size: 13px; font-weight: 600; color: var(--primary-text-color); }
.inf-val-unit{ font-size: 10px; color: var(--secondary-text-color); margin-left: 1px; }
.inf-val-box.active .inf-val-lbl { color: var(--c-info); }
.inf-val-box.active .inf-val-num { color: var(--c-info); }

.range-track-wrap { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.range-lbl-side { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; min-width: 28px; }
.dual-slider { position: relative; height: 28px; flex: 1; cursor: pointer; user-select: none; }
.dual-slider .ds-track { position: absolute; top: 50%; left: 0; right: 0; height: 4px; transform: translateY(-50%); background: rgba(var(--rgb-primary-text-color,255,255,255),.1); border-radius: 2px; }
.dual-slider .ds-fill { position: absolute; top: 0; height: 100%; background: #378ADD; border-radius: 2px; }
.dual-slider .ds-fill-warn { background: #EF9F27; }
.dual-slider .ds-thumb { position: absolute; top: 50%; width: 18px; height: 18px; border-radius: 50%; background: var(--card-background-color, #1c1e26); border: 2px solid #378ADD; transform: translate(-50%, -50%); cursor: grab; touch-action: none; box-sizing: border-box; z-index: 2; }
.dual-slider .ds-thumb:active { cursor: grabbing; border-color: #185FA5; }
.dual-slider .ds-thumb.ds-thumb-lo { z-index: 3; }
.range-fill-warn { background: #EF9F27!important; }
.range-hint { font-size: 11px; color: var(--secondary-text-color); margin-top: 5px; }

/* ── Výsledek ── */
.result-bar { background: rgba(29,158,117,.14); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; margin-top: 14px; border: 1px solid rgba(29,158,117,.2); }

/* ── Noční / protimraz indikátor ── */
.metric.night { background: var(--c-night-bg); }
.metric.night .mv { color: var(--c-night); }
.metric.night .ms { color: rgba(121,134,203,.6); }
.metric.frost { background: var(--c-frost-bg); }
.metric.frost .mv { color: var(--c-frost); }
.metric.frost .ms { color: rgba(38,166,191,.6); }

/* ── Boost panel ── */
.boost-panel { background: rgba(var(--rgb-primary-text-color,255,255,255),.04); border-radius: 10px; padding: 12px; margin-bottom: 4px; }
.boost-status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 7px 10px; border-radius: 7px; background: rgba(55,138,221,0.1); border: 1px solid rgba(55,138,221,0.2); }
.boost-status-lbl { font-size: 12px; font-weight: 500; flex: 1; }
.boost-status-time { font-size: 11px; color: var(--secondary-text-color); }
.boost-cancel-btn { font-size: 11px; padding: 2px 8px; border-radius: 5px; border: 1px solid var(--c-err); background: transparent; color: var(--c-err); cursor: pointer; }
.boost-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 480px) { .boost-btns { grid-template-columns: 1fr; } }
.boost-col { background: rgba(var(--rgb-primary-text-color,255,255,255),.04); border-radius: 8px; padding: 8px 10px; }
.boost-col-lbl { font-size: 11px; font-weight: 500; color: var(--secondary-text-color); margin-bottom: 7px; }
.boost-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.boost-unit { font-size: 11px; color: var(--secondary-text-color); }
.boost-btn { font-size: 12px; padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; margin-left: auto; }
.boost-btn-up { background: rgba(226,75,74,.15); color: #A32D2D; border: 1px solid rgba(226,75,74,.3); }
.boost-btn-up:hover { background: rgba(226,75,74,.25); }
.boost-btn-dn { background: rgba(55,138,221,.15); color: #185FA5; border: 1px solid rgba(55,138,221,.3); }
.boost-btn-dn:hover { background: rgba(55,138,221,.25); }
.boost-btn.active { opacity: 0.6; cursor: default; }

/* ── Výpočetní log ── */
.calc-log-entry { padding: 7px 8px; border-radius: 6px; margin-bottom: 5px; background: rgba(var(--rgb-primary-text-color,255,255,255),.04); border-left: 3px solid var(--divider-color); }
.calc-log-entry.clamped { border-left-color: #EF9F27; }
.calc-log-entry.frost { border-left-color: #26A6BF; }
.calc-log-entry.night { border-left-color: #7986CB; }
.calc-log-entry.boost { border-left-color: #E24B4A; }
.calc-log-entry.reduction { border-left-color: #378ADD; }
.calc-log-time { font-size: 10px; color: var(--secondary-text-color); font-weight: 500; }
.calc-log-result { font-size: 13px; font-weight: 600; margin: 2px 0; }
.calc-log-breakdown { font-size: 10px; color: var(--secondary-text-color); line-height: 1.6; }
.calc-log-tag { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px; margin-left: 4px; font-weight: 500; }
.tag-frost { background: rgba(38,166,191,.15); color: #26A6BF; }
.tag-night { background: rgba(121,134,203,.15); color: #5C6BC0; }
.tag-boost { background: rgba(226,75,74,.15); color: #A32D2D; }
.tag-reduction { background: rgba(55,138,221,.15); color: #185FA5; }
.tag-clamped { background: rgba(239,159,39,.15); color: #9A6200; }
.result-lbl { font-size: 12px; color: #1D9E75; font-weight: 500; }
.result-sub { font-size: 10px; color: rgba(29,158,117,.65); margin-top: 2px; }
.result-val { font-size: 28px; font-weight: 500; color: #1D9E75; letter-spacing: -.5px; }

/* ── Solární blok ── */
.sun-block { background: rgba(var(--rgb-primary-text-color,255,255,255),.05); border-radius: 8px; padding: 10px 12px; margin-top: 8px; }
`;

// ─── HELPER ──────────────────────────────────────────────────────────────────
function num(hass, eid, fallback = 0) {
  const s = hass.states[eid];
  if (!s) return fallback;
  const v = parseFloat(s.state);
  return isNaN(v) ? fallback : v;
}
function sw(hass, eid) {
  const s = hass.states[eid];
  return s && s.state === "on";
}
function fmtEff(v) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} °C`;
}
function effColor(v) {
  return v > 0 ? "#EF9F27" : v < 0 ? "#1D9E75" : "var(--secondary-text-color)";
}
function linEffect(val, from, to, maxEff) {
  if (to <= from || val <= from) return 0;
  if (val >= to) return maxEff;
  return maxEff * (val - from) / (to - from);
}
function interpHeat(nodes, t) {
  if (!nodes.length) return 20;
  if (t <= nodes[0][0]) return nodes[0][1];
  if (t >= nodes[nodes.length - 1][0]) return nodes[nodes.length - 1][1];
  for (let i = 0; i < nodes.length - 1; i++) {
    const [x1, y1] = nodes[i], [x2, y2] = nodes[i + 1];
    if (t >= x1 && t <= x2) return y1 + (t - x1) / (x2 - x1) * (y2 - y1);
  }
  return 20;
}

// ─── DUAL SLIDER — vlastní implementace bez input[type=range] ────────────────
// Robustní v shadow DOM, nerozbije ho HA globální CSS na range inputy.
class DualSlider {
  /**
   * @param {HTMLElement} trackEl  — wrapper .dual-slider
   * @param {HTMLElement} thumbLo  — levý/dolní thumb
   * @param {HTMLElement} thumbHi  — pravý/horní thumb
   * @param {number} min, max, step
   * @param {Function} onChange    — callback(lo, hi) volaný při každé změně
   */
  constructor(trackEl, thumbLo, thumbHi, min, max, step, onChange) {
    this._el   = trackEl;
    this._lo   = thumbLo;
    this._hi   = thumbHi;
    this._min  = min;
    this._max  = max;
    this._step = step || 1;
    this._onChange = onChange;
    this._valLo = min;
    this._valHi = max;
    this._dragging = null; // "lo" | "hi" | null

    const onDown = (thumb, e) => {
      e.preventDefault();
      this._dragging = thumb;
      const move = ev => this._onMove(ev);
      const up   = ()  => { this._dragging = null; window.removeEventListener("mousemove", move); window.removeEventListener("touchmove", move); window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
      window.addEventListener("mousemove", move);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("mouseup",   up);
      window.addEventListener("touchend",  up);
    };

    thumbLo.addEventListener("mousedown",  e => onDown("lo", e));
    thumbLo.addEventListener("touchstart", e => onDown("lo", e), { passive: false });
    thumbHi.addEventListener("mousedown",  e => onDown("hi", e));
    thumbHi.addEventListener("touchstart", e => onDown("hi", e), { passive: false });

    // Klik na track — přesune bližší thumb
    trackEl.addEventListener("click", e => {
      if (e.target === thumbLo || e.target === thumbHi) return;
      const val = this._eventToVal(e);
      const distLo = Math.abs(val - this._valLo);
      const distHi = Math.abs(val - this._valHi);
      if (distLo <= distHi) this._setLo(val);
      else                   this._setHi(val);
      this._emit();
    });
  }

  _eventToVal(e) {
    const rect = this._el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = this._min + pct * (this._max - this._min);
    return Math.round(raw / this._step) * this._step;
  }

  _onMove(e) {
    if (!this._dragging) return;
    e.preventDefault();
    const val = this._eventToVal(e);
    if (this._dragging === "lo") this._setLo(val);
    else                          this._setHi(val);
    this._emit();
  }

  _setLo(v) {
    this._valLo = Math.max(this._min, Math.min(v, this._valHi - this._step));
    this._render();
  }
  _setHi(v) {
    this._valHi = Math.min(this._max, Math.max(v, this._valLo + this._step));
    this._render();
  }

  setValues(lo, hi) {
    this._valLo = Math.max(this._min, Math.min(lo, hi - this._step));
    this._valHi = Math.min(this._max, Math.max(hi, lo + this._step));
    this._render();
  }

  _render() {
    const range = this._max - this._min;
    const pctLo = (this._valLo - this._min) / range * 100;
    const pctHi = (this._valHi - this._min) / range * 100;
    this._lo.style.left = pctLo.toFixed(2) + "%";
    this._hi.style.left = pctHi.toFixed(2) + "%";
    const fill = this._el.querySelector(".ds-fill");
    if (fill) {
      fill.style.left  = pctLo.toFixed(2) + "%";
      fill.style.width = (pctHi - pctLo).toFixed(2) + "%";
    }
  }

  _emit() {
    if (this._onChange) this._onChange(this._valLo, this._valHi);
  }

  get lo() { return this._valLo; }
  get hi() { return this._valHi; }
}

// ─── KARTA ───────────────────────────────────────────────────────────────────
class BMSMasterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._needsBuild = true;
    this._chartInstance = null;
    this._chartRetryTimer = null;
    this._chartInitDone = false;
    this._chartResizeObserver = null;
    this._accOpen = false;
    this._config = {};
    // Lokální cache bodů křivky — drží se dokud uživatel neklikne Uložit
    this._localNodes = null;    // null = čti z HA; array = neuložená lokální kopie
    this._editingCurve = false; // true = blokuj přepis z HA
    this._pendingPointCount = null; // očekávaný počet bodů po uložení
    this._curveEditorFocused = false; // true = uživatel má fokus v editoru bodů
    // Mapa inputů čekajících na potvrzení z HA — klíč = entity_id, hodnota = timestamp
    this._pendingInputs = new Map();
    this._PENDING_TTL = 8000;          // prodloužit TTL na 8s
    this._focusedInputs = new Set();   // množina eid právě focusovaných inputů
    this._debounceTimers = new Map();  // debounce timery pro save
    // Lokální stav nastavení — null = čti z HA, Map = neuložené změny
    this._localSettings = new Map();   // eid → local value (čeká na uložení)
    this._optimisticStarred = null;    // optimistický seznam hvězdiček před HA potvrzením
    this._optimisticSchedulePending = false;
    this._autoRefreshTimer = null;     // debounce timer pro auto-refresh po změnách
    this._boostCountdownTimer = null;
    this._boostExpiredSub = null;
    this._starredPage = 0;  // aktuální stránka rychlých profilů
  }

  setConfig(config) {
    this._config = config;
    // _build() voláme až při connectedCallback nebo set hass — shadowRoot musí být připojen
    this._needsBuild = true;
  }

  connectedCallback() {
    if (this._needsBuild || !this.shadowRoot.querySelector("ha-card")) {
      this._build();
      this._needsBuild = false;
    }
    // Globální focus ochrana — zachytí VŠECHNY inputy v shadow DOM
    // Zabraňuje přepisování hodnot při editaci
    this._onShadowFocusIn = (e) => {
      const el = e.target;
      if (!el) return;
      const eid = el.dataset?.bmsEid || el.id;
      if (eid) this._focusedInputs.add(eid);
      // Uložit aktuální hodnotu jako "editovanou"
      if (el.tagName === "INPUT" && el.type === "number" && eid) {
        this._editingValues = this._editingValues || new Map();
        this._editingValues.set(eid, el.value);
      }
    };
    this._onShadowFocusOut = (e) => {
      const el = e.target;
      if (!el) return;
      const eid = el.dataset?.bmsEid || el.id;
      if (eid) {
        // Zpoždění 200ms — dost na to aby HA state update neodepsal změnu
        setTimeout(() => {
          this._focusedInputs.delete(eid);
          this._editingValues?.delete(eid);
        }, 200);
      }
    };
    this.shadowRoot.addEventListener("focusin",  this._onShadowFocusIn,  true);
    this.shadowRoot.addEventListener("focusout", this._onShadowFocusOut, true);
    if (this._hass) this._update();
  }

  disconnectedCallback() {
    if (this._boostExpiredSub) {
      this._boostExpiredSub.then((unsub) => unsub()).catch(() => {});
      this._boostExpiredSub = null;
    }
    if (this._boostCountdownTimer) clearInterval(this._boostCountdownTimer);
    if (this._timeAxisTimer) clearInterval(this._timeAxisTimer);
    if (this._autoRefreshTimer) clearTimeout(this._autoRefreshTimer);
    if (this._chartResizeObserver) this._chartResizeObserver.disconnect();
    if (this._infCanvasObserver) this._infCanvasObserver.disconnect();
    if (this._infChart) { try { this._infChart.destroy(); } catch(_) {} this._infChart = null; this._infChartHash = null; }
    if (this._onShadowFocusIn)  this.shadowRoot.removeEventListener("focusin",  this._onShadowFocusIn,  true);
    if (this._onShadowFocusOut) this.shadowRoot.removeEventListener("focusout", this._onShadowFocusOut, true);
  }

  getCardSize() { return 8; }

  // Sections view — karta je široká, výška se řídí obsahem
  getGridOptions() {
    return { columns: "full", min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (this._needsBuild || !this.shadowRoot.querySelector("ha-card")) {
      this._build();
      this._needsBuild = false;
    }
    if (!this._chartInitDone) this._updateChart();
    // Přihlásit se k boost_expired eventu jednou po připojení (odhlášení v disconnectedCallback)
    if (!this._boostExpiredSub && hass.connection && this.isConnected) {
      this._boostExpiredSub = hass.connection.subscribeEvents((event) => {
        const d = event.data || {};
        const isBoost = d.kind === "boost_expired";
        const msg = isBoost
          ? `⬆ Boost +${Math.abs(d.amount)}°C vypršel`
          : `⬇ Útlum −${Math.abs(d.amount)}°C vypršel`;
        this._showToast(msg, "warn");
      }, "heating_curve_boost_expired");
    }
    this._update();
  }

  _build() {
    try {
      this._buildInner();
    } catch (err) {
      console.error("BMS karta: Chyba při sestavování UI:", err);
      // Zobrazit chybu přímo v kartě pro snadnou diagnostiku
      this.shadowRoot.innerHTML = `<ha-card style="padding:16px;color:red;font-family:monospace;font-size:12px">
        <b>BMS karta — chyba při načítání:</b><br><br>
        ${escHtml(err.message)}<br><br>
        <pre>${escHtml(err.stack?.split('\n').slice(0,5).join('\n') || '')}</pre>
      </ha-card>`;
    }
  }

  _buildInner() {
    const style = document.createElement("style");
    style.textContent = CARD_STYLE;

    this.shadowRoot.innerHTML = "";
    this.shadowRoot.appendChild(style);

    const card = document.createElement("ha-card");
    card.innerHTML = `
<div class="bms">

  <!-- ① HLAVIČKA -->
  <div class="bms-header">
    <div>
      <div class="bms-title">Regulace termostatu</div>
      <div class="bms-subtitle" id="bms-subtitle">Ekvitermní křivka · vlivy počasí</div>
    </div>
    <div class="bms-tog-wrap">
      <button class="bms-compact-btn" id="btn-compact" title="Přepnout kompaktní / plný zobrazení">⊟ Kompakt</button>
      <span class="status-badge status-on" id="main-status-badge" title="Aktivní = termostat se řídí výpočtem. Vypnuto = výpočty probíhají, termostat se nenastavuje." aria-label="Stav regulace">Aktivní</span>
      <button class="main-tog on" id="main-toggle" title="Zapnout nebo vypnout regulaci" aria-label="Hlavní vypínač"></button>
    </div>
  </div>

  <!-- ② INFORMAČNÍ PROUŽEK -->
  <div class="state-bar active" id="state-bar" role="status" aria-label="Stav regulace"></div>
  <div class="alert-bar" id="alert-bar" role="alert" aria-live="polite"></div>
  <div class="summary-row" id="summary-row" aria-label="Souhrn výpočtu">Načítám…</div>
  <div class="calc-timestamp" id="calc-timestamp" aria-label="Čas posledního výpočtu"></div>

  <!-- ③ HERO SEKCE — 2 sloupce -->
  <div class="hero-grid">

    <!-- ③a Teploty -->
    <div class="hero-temps">
      <div class="hero-result" id="hero-result" title="Výsledná teplota odesílaná na termostat." role="region" aria-label="Výsledná teplota topení">
        <div class="hero-lbl" id="hero-lbl">Topení</div>
        <div class="hero-val" id="hero-val">—°</div>
        <div class="hero-sub" id="hero-sub">čekám na data</div>
        <!-- Upozornění na výpadek senzoru / bezpečný bod — přímo v bloku Topení -->
        <div id="hero-sensor-warn" style="display:none;margin-top:6px;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:500;background:rgba(239,159,39,.1);color:#9A6200;border:1px solid rgba(239,159,39,.25)" title="Výsledná teplota je počítána ze záložního bezpečného bodu — venkovní senzor ani weather entita nejsou dostupné."></div>
        <canvas id="spark-canvas" width="80" height="18" style="display:block;margin-top:6px;opacity:.6" aria-hidden="true"></canvas>
      </div>
      <div class="metrics">
        <div class="metric" id="m-out" title="Aktuálně naměřená venkovní teplota ze senzoru.">
          <div class="ml">Venkovní</div>
          <div class="mv" id="mv-out">—°C</div>
          <div class="ms" id="ms-out">ze senzoru</div>
        </div>
        <div class="metric" id="m-fc" title="Předpovídaná teplota. Zvýrazněna = vstupuje do výpočtu.">
          <div class="ml">Předpověď</div>
          <div class="mv" id="mv-fc">—°C</div>
          <div class="ms" id="ms-fc">—</div>
        </div>
        <div class="metric" id="m-curve" title="Teplota ze křivky před korekcemi.">
          <div class="ml">Ze křivky</div>
          <div class="mv" id="mv-curve">—°C</div>
          <div class="ms">termostat</div>
        </div>
        <div class="metric" id="m-mod" title="Součet všech korekcí počasí.">
          <div class="ml">Modifikace</div>
          <div class="mv" id="mv-mod">—°C</div>
          <div class="ms">součet vlivů</div>
        </div>
      </div>
    </div>

    <!-- ③b Výpočetní log + log událostí -->
    <div class="hero-log">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12px;font-weight:600;color:var(--primary-text-color)">Výpočetní log</span>
        <span style="font-size:10px;color:var(--secondary-text-color)" id="log-last-update"></span>
      </div>
      <div id="calc-log-list" style="font-size:11px;overflow-y:auto;flex:1;min-height:0;padding-right:2px"></div>
    </div>
  </div>

  <!-- ④ SEKCE REŽIMY — 5 karet -->
  <div class="sec-title" style="margin-top:14px;margin-bottom:8px">Režimy</div>
  <div class="modes-grid">

    <!-- Boost -->
    <div class="mode-card" id="mode-card-boost" title="Dočasně zvýšit teplotu topení o nastavený počet °C na nastavený počet hodin.">
      <div class="mode-card-title">⬆ Boost</div>
      <div class="boost-status-row" id="boost-status-row" style="display:none">
        <span class="boost-status-lbl" id="boost-status-lbl">⚡ Aktivní</span>
        <span class="boost-status-time" id="boost-status-time">—</span>
      </div>
      <div class="mode-card-row">
        <input type="number" id="inp-boost-amount" data-bms-eid="number.bms_boost_amount" class="num-inp" min="0.5" max="20" step="0.5" value="5" style="width:46px" title="O kolik °C zvýšit teplotu topení.">
        <span class="boost-unit">°C</span>
        <input type="number" id="inp-boost-hours" data-bms-eid="number.bms_boost_hours" class="num-inp" min="0.5" max="24" step="0.5" value="2" style="width:40px" title="Na jak dlouho (hodiny).">
        <span class="boost-unit">h</span>
      </div>
      <div class="mode-card-btns">
        <button class="boost-btn boost-btn-up" id="btn-boost" title="Dočasně zvýšit topení.">Zapnout</button>
        <button class="boost-cancel-btn" id="boost-cancel-btn" title="Zrušit boost nebo útlum." style="display:none">✕</button>
      </div>
    </div>

    <!-- Útlum -->
    <div class="mode-card" id="mode-card-red" title="Dočasně snížit teplotu topení o nastavený počet °C na nastavený počet hodin.">
      <div class="mode-card-title">⬇ Útlum</div>
      <div class="mode-card-row">
        <input type="number" id="inp-reduction-amount" data-bms-eid="number.bms_reduction_amount" class="num-inp" min="0.5" max="20" step="0.5" value="5" style="width:46px" title="O kolik °C snížit teplotu topení.">
        <span class="boost-unit">°C</span>
        <input type="number" id="inp-reduction-hours" data-bms-eid="number.bms_reduction_hours" class="num-inp" min="0.5" max="24" step="0.5" value="2" style="width:40px" title="Na jak dlouho (hodiny).">
        <span class="boost-unit">h</span>
      </div>
      <div class="mode-card-btns">
        <button class="boost-btn boost-btn-dn" id="btn-reduction" title="Dočasně snížit topení.">Zapnout</button>
      </div>
    </div>

    <!-- Protimraz -->
    <div class="mode-card" id="mode-card-frost" title="Protimrazová ochrana — při poklesu venkovní teploty pod práh se vynutí minimální teplota topení.">
      <div class="mode-card-title">❄ Protimraz</div>
      <div class="mode-card-status" id="frost-status-badge" style="display:none"></div>
      <div class="mode-card-row" style="justify-content:space-between">
        <span style="font-size:11px;color:var(--secondary-text-color)">Aktivní</span>
        <ha-switch id="sw-frost" title="Zapnout/vypnout protimrazovou ochranu."></ha-switch>
      </div>
      <div class="mode-card-sub" id="frost-vals" style="font-size:10px;color:var(--secondary-text-color);margin-top:4px"></div>
    </div>

    <!-- Noční mód -->
    <div class="mode-card" id="mode-card-night" title="Noční mód — automaticky snižuje topení o nastavený offset mimo nastavený denní časový úsek.">
      <div class="mode-card-title">🌙 Noc</div>
      <div class="mode-card-status" id="night-status-badge" style="display:none"></div>
      <div class="mode-card-row" style="justify-content:space-between">
        <span style="font-size:11px;color:var(--secondary-text-color)">Aktivní</span>
        <ha-switch id="sw-night-mode" title="Zapnout/vypnout noční mód."></ha-switch>
      </div>
      <div class="mode-card-sub" id="night-vals" style="font-size:10px;color:var(--secondary-text-color);margin-top:4px"></div>
    </div>

    <!-- Letní bypass -->
    <div class="mode-card" id="mode-card-bypass" title="Letní bypass — při venkovní teplotě nad nastavený práh se regulace pozastaví a termostat se nenastavuje.">
      <div class="mode-card-title">☀ Bypass</div>
      <div id="bypass-active-badge" style="display:none;font-size:10px;font-weight:600;color:#0F6E56;margin-bottom:4px" title="Letní bypass je aktivní — regulátor nyní nenastavuje termostat.">● Aktivní</div>
      <div class="mode-card-row" style="justify-content:space-between">
        <span style="font-size:11px;color:var(--secondary-text-color)">Aktivní</span>
        <ha-switch id="sw-letni-bypass" title="Zapnout/vypnout letní bypass."></ha-switch>
      </div>
      <div class="mode-card-sub" id="bypass-vals" style="font-size:10px;color:var(--secondary-text-color);margin-top:4px"></div>
      <div id="bypass-active-banner" style="display:none"></div>
    </div>

  </div>

  <!-- ⑤ RYCHLÉ PROFILY -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;margin-bottom:8px">
    <div class="sec-title" style="margin:0">Rychlé profily</div>
    <span style="font-size:11px;color:var(--secondary-text-color)">Hvězdičkou označte profil v sekci Profily</span>
  </div>
  <div id="starred-presets" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px"></div>
  <div id="starred-pager" style="display:none;justify-content:center;gap:6px;margin-top:4px;margin-bottom:4px">
    <button id="starred-prev" title="Předchozí stránka rychlých profilů." style="font-size:11px;padding:2px 10px;border-radius:5px;border:1px solid var(--divider-color);background:transparent;cursor:pointer">‹</button>
    <span id="starred-page-lbl" style="font-size:11px;color:var(--secondary-text-color);align-self:center">1 / 2</span>
    <button id="starred-next" title="Další stránka rychlých profilů." style="font-size:11px;padding:2px 10px;border-radius:5px;border:1px solid var(--divider-color);background:transparent;cursor:pointer">›</button>
  </div>

  <!-- ⑥ PROFILY + ČASOVÉ PLÁNY — 2 sloupce -->
  <div class="sec-title full-only" style="margin-top:14px;margin-bottom:8px">Profily</div>
  <div class="profiles-grid full-only">

    <!-- ⑥a Profily křivky -->
    <div class="prof-manager">
      <div id="prof-system-warn" style="display:none;margin-bottom:10px;padding:7px 12px;border-radius:7px;font-size:12px;font-weight:500;background:var(--c-warn-bg);color:var(--c-warn);border:1px solid rgba(239,159,39,.3)">
        ⚠ Smazali jste výchozí sezónní profil. Pro obnovení restartujte integraci.
      </div>
      <div class="prof-select-row">
        <select id="prof-select" class="prof-select" title="Vyberte profil pro načtení nebo správu.">
          <option value="Výchozí">Výchozí</option>
        </select>
        <span id="prof-active-badge" class="prof-badge" style="display:none">✓ Aktivní</span>
      </div>
      <div class="prof-actions">
        <button class="prof-btn load" id="prof-btn-load" title="Načíst vybraný profil — přepíše aktuální nastavení křivky a všech vlivů.">⬇ Načíst</button>
        <button class="prof-btn save" id="prof-btn-save" title="Uložit aktuální nastavení jako vybraný profil (přepíše ho).">↑ Přepsat</button>
        <button class="prof-btn ren"  id="prof-btn-ren"  title="Přejmenovat vybraný profil.">✏ Přejmenovat</button>
        <button class="prof-btn"      id="prof-btn-star" title="Přidat / odebrat profil z rychlých profilů (hvězdička).">☆ Hvězdička</button>
        <button class="prof-btn del"  id="prof-btn-del"  title="Smazat vybraný profil. Výchozí profil nelze smazat.">✕ Smazat</button>
      </div>
      <div class="prof-new-row">
        <input id="prof-new-name" class="prof-new-inp" placeholder="Název nového profilu…" title="Zadejte název a klikněte Uložit jako nový.">
        <button class="prof-btn save" id="prof-btn-new" title="Uložit aktuální nastavení jako nový pojmenovaný profil.">+ Nový</button>
      </div>
      <div class="prof-toast" id="prof-toast"></div>
      <details style="margin-top:10px">
        <summary style="font-size:12px;color:var(--secondary-text-color);cursor:pointer;user-select:none;padding:4px 0">📦 Export / Import profilů</summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
          <textarea id="prof-export-area" rows="4" style="width:100%;font-size:11px;font-family:monospace;border-radius:6px;border:1px solid var(--divider-color);background:rgba(var(--rgb-primary-text-color,255,255,255),.04);color:var(--primary-text-color);padding:6px;resize:vertical" placeholder="JSON dat profilů…"></textarea>
          <div style="display:flex;gap:6px">
            <button class="prof-btn load" id="prof-btn-export" style="flex:1" title="Exportovat všechny profily jako JSON.">⬆ Export</button>
            <button class="prof-btn save" id="prof-btn-import" style="flex:1" title="Importovat profily z JSON.">⬇ Import</button>
          </div>
          <div id="prof-import-status" style="font-size:11px;min-height:14px"></div>
        </div>
      </details>
    </div>

    <!-- ⑥b Časové plány — scrollovatelné, stejná výška -->
    <div class="schedules-panel" style="max-height:420px">
      <div style="font-size:11px;color:var(--secondary-text-color);margin-bottom:8px" title="Pravidla se vyhodnocují shora dolů — platí první splněné pravidlo. Pokud žádné nevyhovuje, zůstane aktivní aktuální profil.">Pravidla se vyhodnocují shora dolů — platí první splněné.</div>
      <div id="schedules-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
      <button id="btn-add-schedule" title="Přidat nové pravidlo pro automatické přepínání profilů." style="font-size:12px;padding:5px 14px;border-radius:7px;border:1px solid #378ADD;color:#185FA5;background:rgba(55,138,221,.07);cursor:pointer;width:100%">+ Přidat pravidlo</button>
    </div>

  </div>

  <!-- ⑦ TOPNÁ KŘIVKA -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;margin-bottom:6px;flex-wrap:wrap;gap:8px">
    <span class="sec-title" style="margin:0;border:none;padding:0">Topná křivka</span>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:5px" title="Přepnout výpočet topné křivky na předpovídanou venkovní teplotu.">
        <span style="font-size:11px;color:var(--secondary-text-color)" id="curve-fc-lbl">Zdroj: Aktuální</span>
        <ha-switch id="sw-curve-fc" title="Zapnout předpověď pro topnou křivku — výpočet bude vycházet z předpovídané teploty."></ha-switch>
      </div>
      <div style="display:flex;align-items:center;gap:5px" title="Počet hodin výhledu pro předpovídanou teplotu topné křivky.">
        <span style="font-size:11px;color:var(--secondary-text-color)">+</span>
        <input type="number" id="inp-curve-fc-hours" class="num-inp" min="1" max="72" step="1" value="24" style="width:46px;font-size:11px" title="Počet hodin předpovědi pro topnou křivku (1–72 h).">
        <span style="font-size:11px;color:var(--secondary-text-color)">h</span>
      </div>
    </div>
  </div>
  <div class="chart-legend">
    <span class="legend-item" title="Topná křivka bez korekcí — závisí pouze na venkovní teplotě."><span class="legend-line" style="background:var(--primary-color)"></span>Základní křivka</span>
    <span class="legend-item" title="Křivka po přičtení všech aktivních korekcí počasí."><span class="legend-dash" style="border-top:2px dashed #f4511e"></span>S modifikacemi</span>
    <span class="legend-item" title="Výsledná teplota po aplikaci bezpečnostních limitů."><span class="legend-dash" style="border-top:2px dashed #4caf50"></span>Po limitu</span>
    <span class="legend-item" title="Červená čára — aktuálně naměřená venkovní teplota."><span class="legend-vert" style="background:#ef5350"></span>Aktuální teplota</span>
    <span class="legend-item" id="legend-fc-temp" title="Modrá čára — předpovídaná venkovní teplota." style="display:none"><span class="legend-vert" style="background:#378ADD"></span>Předpověď teploty</span>
  </div>
  <div class="chart-wrap"><canvas id="bms-chart" height="230"></canvas></div>
  <button class="accordion-btn full-only" id="acc-btn" title="Zobrazit nebo skrýt tabulku s hodnotami bodů křivky a editací.">
    <span>Hodnoty bodů křivky</span>
    <span class="accordion-arrow" id="acc-arrow">▼</span>
  </button>
  <div class="accordion-body full-only" id="acc-body">
    <div style="overflow-x:auto">
      <table class="curve-table">
        <thead><tr>
          <th title="Venkovní teplota pro tento bod křivky (°C)">Venkovní (°C)</th>
          <th title="Cílová teplota topení z křivky (°C)">Topení (°C)</th>
          <th title="Teplota topení po přičtení korekcí počasí">S modifikací</th>
          <th title="Výsledná teplota po oříznutí limity">Po limitu</th>
          <th></th>
        </tr></thead>
        <tbody id="curve-tbody"></tbody>
      </table>
    </div>
    <div id="curve-save-bar" style="display:none;margin-top:10px;padding:6px 10px;background:rgba(55,138,221,0.07);border-radius:6px;border:1px solid rgba(55,138,221,0.15);align-items:center;gap:8px">
      <span id="curve-save-status" style="font-size:12px;color:#185FA5;font-weight:500;flex:1">Ukládám…</span>
    </div>
  </div>

  <!-- ⑧ VNĚJŠÍ VLIVY -->
  <div class="sec-title-row full-only" style="margin-top:14px">
    <span class="sec-title" style="margin:0;border:none;padding:0">Vnější vlivy</span>
  </div>

  <!-- ⑧a Graf vlivů — celá šířka, bude doplněn v Fázi C -->
  <div id="inf-chart-wrap" class="full-only" style="margin-bottom:24px;display:none;width:100%">
    <div style="font-size:11px;color:var(--secondary-text-color);margin-bottom:6px" title="Spojnicový graf naměřených hodnot a předpovědi. Kliknutím na legendu skryjte/zobrazte řady.">Naměřené hodnoty vlivů + předpověď — kliknutím na legendu skryjte/zobrazte řady</div>
    <div style="position:relative;width:100%;height:260px">
      <canvas id="inf-chart" style="display:none"></canvas>
    </div>
  </div>

  <!-- ⑧b–e Vliv karty — 4 sloupce -->
  <div id="inf-list" class="full-only"></div>

  <!-- ⑧f Slunce — celá šířka (hodnoty + přepínače jsou v inf-sun-row výše) -->
  <div class="sun-block full-only">
    <div id="sun-arc-wrap" title="Vizualizace dráhy slunce přes oblohu. Aktivní okno = rozsah azimutu kde slunce ovlivňuje výpočet.">
      <svg id="sun-arc-svg" viewBox="0 0 360 105" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block">
        <rect x="0" y="80" width="360" height="2" fill="rgba(128,128,128,0.15)" rx="1"/>
        <line x1="90"  y1="78" x2="90"  y2="82" stroke="rgba(128,128,128,0.25)" stroke-width="0.5"/>
        <line x1="180" y1="75" x2="180" y2="85" stroke="rgba(128,128,128,0.4)"  stroke-width="0.8"/>
        <line x1="270" y1="78" x2="270" y2="82" stroke="rgba(128,128,128,0.25)" stroke-width="0.5"/>
        <path id="sun-arc-path"   d="" stroke="#EF9F27" stroke-width="1.5" fill="none" stroke-dasharray="2,2" opacity="0.5"/>
        <path id="sun-arc-active" d="" fill="rgba(239,159,39,0.15)" stroke="none"/>
        <line id="sun-line-lo" x1="0" y1="0" x2="0" y2="80" stroke="#378ADD" stroke-width="1" stroke-dasharray="3,2"/>
        <line id="sun-line-hi" x1="0" y1="0" x2="0" y2="80" stroke="#378ADD" stroke-width="1" stroke-dasharray="3,2"/>
        <g id="sun-rise-g" opacity="0.8">
          <line id="sun-rise-line" x1="0" y1="80" x2="0" y2="90" stroke="#4caf50" stroke-width="1.5"/>
          <text id="sun-rise-lbl"  x="0" y="100" font-size="7" fill="#4caf50" font-family="inherit" text-anchor="middle"></text>
        </g>
        <g id="sun-set-g" opacity="0.8">
          <line id="sun-set-line" x1="0" y1="80" x2="0" y2="90" stroke="#ef5350" stroke-width="1.5"/>
          <text id="sun-set-lbl"  x="0" y="100" font-size="7" fill="#ef5350" font-family="inherit" text-anchor="middle"></text>
        </g>
        <circle id="sun-fc-dot"  cx="0" cy="60" r="5" fill="rgba(239,159,39,0.3)" stroke="rgba(239,159,39,0.6)" stroke-width="1.5" stroke-dasharray="2,1.5"/>
        <text   id="sun-fc-lbl"  x="0" y="52"  font-size="9" fill="rgba(239,159,39,0.65)" font-family="inherit" text-anchor="middle"></text>
        <circle id="sun-dot"     cx="0" cy="60" r="5" fill="#EF9F27" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
        <text   id="sun-dot-lbl" x="0" y="52"  font-size="9" font-weight="500" fill="#EF9F27" font-family="inherit" text-anchor="middle"></text>
      </svg>
      <div style="display:flex;gap:12px;font-size:10px;color:var(--secondary-text-color);margin-top:2px;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:3px" title="Oranžový kruh: aktuální poloha slunce."><span style="width:8px;height:8px;border-radius:50%;background:#EF9F27;display:inline-block"></span>Aktuální pozice</span>
        <span style="display:flex;align-items:center;gap:3px" title="Zelená čára: čas a azimut východu slunce."><span style="width:8px;height:2px;background:#4caf50;display:inline-block"></span>Východ</span>
        <span style="display:flex;align-items:center;gap:3px" title="Průhledný kroužek: předpovídaná poloha slunce."><span style="width:8px;height:8px;border-radius:50%;background:rgba(239,159,39,0.35);border:1.5px dashed #EF9F27;display:inline-block"></span>Předpověď</span>
        <span style="display:flex;align-items:center;gap:3px" title="Červená čára: čas a azimut západu slunce."><span style="width:8px;height:2px;background:#ef5350;display:inline-block"></span>Západ</span>
        <span style="display:flex;align-items:center;gap:3px" title="Světle oranžová plocha: nastavený účinný rozsah azimutu."><span style="width:12px;height:8px;background:rgba(239,159,39,0.2);display:inline-block;border-radius:1px"></span>Účinný rozsah</span>
      </div>
      <svg id="sun-time-svg" viewBox="0 0 360 28" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block;margin-top:6px">
        <rect x="0" y="0" width="360" height="28" fill="rgba(128,128,128,0.05)" rx="3"/>
        <rect id="time-night-am" x="0" y="0" width="0" height="28" fill="rgba(30,50,120,0.12)" rx="2"/>
        <rect id="time-night-pm" x="0" y="0" width="0" height="28" fill="rgba(30,50,120,0.12)" rx="2"/>
        <line x1="90"  y1="0" x2="90"  y2="6"  stroke="rgba(128,128,128,0.3)" stroke-width="0.5"/>
        <line x1="180" y1="0" x2="180" y2="8"  stroke="rgba(128,128,128,0.4)" stroke-width="0.8"/>
        <line x1="270" y1="0" x2="270" y2="6"  stroke="rgba(128,128,128,0.3)" stroke-width="0.5"/>
        <text x="0"   y="22" font-size="9" font-weight="500" fill="var(--secondary-text-color)" font-family="inherit" text-anchor="start">0:00</text>
        <text x="90"  y="22" font-size="9" font-weight="500" fill="var(--secondary-text-color)" font-family="inherit" text-anchor="middle">6:00</text>
        <text x="180" y="22" font-size="9" font-weight="500" fill="var(--secondary-text-color)" font-family="inherit" text-anchor="middle">12:00</text>
        <text x="270" y="22" font-size="9" font-weight="500" fill="var(--secondary-text-color)" font-family="inherit" text-anchor="middle">18:00</text>
        <text x="360" y="22" font-size="9" font-weight="500" fill="var(--secondary-text-color)" font-family="inherit" text-anchor="end">24:00</text>
        <rect id="time-day"      x="0" y="3" width="0" height="10" fill="rgba(239,159,39,0.18)" rx="1"/>
        <line id="time-now-line" x1="0" y1="0" x2="0" y2="28" stroke="#378ADD" stroke-width="1.5"/>
        <text id="time-now-lbl"  x="0" y="11" font-size="10" font-weight="600" fill="#378ADD" font-family="inherit" text-anchor="middle"></text>
      </svg>
    </div>
    <div class="range-track-wrap">
      <span class="range-lbl-side" id="sun-from-lbl">140°</span>
      <div class="dual-slider" id="sun-dual" title="Rozsah azimutu slunce (0°=sever, 90°=východ, 180°=jih, 270°=západ) kde slunce ovlivňuje výpočet.">
        <div class="ds-track"><div class="ds-fill" id="sun-fill"></div></div>
        <div class="ds-thumb ds-thumb-lo" id="sun-thumb-lo"></div>
        <div class="ds-thumb ds-thumb-hi" id="sun-thumb-hi"></div>
      </div>
      <span class="range-lbl-side" style="text-align:right" id="sun-to-lbl">220°</span>
    </div>
    <div class="range-hint" id="sun-hint" title="Vliv slunce se uplatňuje jen tehdy, je-li azimut slunce v nastaveném rozsahu.">Mimo rozsah — vliv slunce se ignoruje</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--divider-color)">
      <span style="font-size:13px;color:var(--primary-text-color)" title="Maximální korekce teploty topení při přímém slunečním záření. Záporná = snížení topení.">Max efekt slunce</span>
      <div style="display:flex;align-items:center;gap:6px">
        <input type="number" id="inp-sun-max" class="num-inp" min="-10" max="0" value="-2" step="0.1" style="width:58px" title="Maximální snížení teploty topení při plném slunečním záření (záporná hodnota).">
        <span style="font-size:12px;color:var(--secondary-text-color)">°C</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px" title="Kolik hodin dopředu použít předpovídanou polohu slunce (pokud je předpověď zapnuta).">
      <span style="font-size:13px;color:var(--primary-text-color)">Předpověď slunce</span>
      <div style="display:flex;align-items:center;gap:6px">
        <input type="number" id="inp-sun-fc-hours" class="num-inp" min="1" max="48" value="6" step="1" style="width:58px" title="Počet hodin do budoucnosti z nichž se bere předpovídaná poloha slunce (1–48 h).">
        <span style="font-size:12px;color:var(--secondary-text-color)">h</span>
      </div>
    </div>
    <canvas id="spark-slunce" width="200" height="28" style="display:block;width:100%;height:28px;margin-top:8px;border-radius:4px;opacity:.85" title="Minigraf efektu slunce: korekce v závislosti na elevaci. Červená čára = aktuální elevace."></canvas>
  </div>

  <!-- ⑨ NASTAVENÍ -->
  <details class="bms-details full-only" id="details-ranges">
  <summary>Nastavení</summary>
  <div class="details-body">

  <div class="settings-group-label">Nastavení profilu křivky</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;align-items:stretch">
    <div style="display:flex;flex-direction:column;gap:10px;height:100%">

      <div class="set-card" style="flex:1" id="set-card-range" title="Rozsah venkovních teplot pro interpolaci topné křivky. Součást profilu křivky.">
        <div class="set-card-title">📐 Rozsah venkovních teplot</div>
        <div class="range-block" style="padding:8px 10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <span style="font-size:11px;color:var(--secondary-text-color)">Aktivní rozsah</span>
            <span style="font-size:11px;font-weight:500" id="out-range-lbl">— – —</span>
          </div>
          <div class="range-track-wrap">
            <span class="range-lbl-side" id="out-from-lbl" style="font-size:10px">—</span>
            <div class="dual-slider" id="out-dual" title="Rozsah venkovních teplot pro interpolaci křivky.">
              <div class="ds-track"><div class="ds-fill" id="out-fill"></div></div>
              <div class="ds-thumb ds-thumb-lo" id="out-thumb-lo"></div>
              <div class="ds-thumb ds-thumb-hi" id="out-thumb-hi"></div>
            </div>
            <span class="range-lbl-side" style="text-align:right;font-size:10px" id="out-to-lbl">—</span>
          </div>
          <div class="range-hint" id="out-hint" style="font-size:10px;margin-top:3px">Mimo rozsah: extrapoluje se krajní hodnotou</div>
        </div>
        <div class="set-save-row">
          <button class="set-btn-save" id="set-save-range" title="Uložit změny rozsahu venkovních teplot do Home Assistant.">✓ Uložit</button>
          <button class="set-btn-discard" id="set-discard-range" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
        </div>
      </div>

    </div>
    <div style="display:flex;flex-direction:column;gap:10px;height:100%">

      <div class="set-card" style="flex:1" id="set-card-safe" title="Bezpečný bod křivky — záložní teplota topení při výpadku všech senzorů. Součást profilu křivky.">
        <div class="set-card-title">⚓ Bezpečný bod křivky</div>
        <div style="font-size:10px;color:var(--secondary-text-color);margin-bottom:7px">Teplota při výpadku všech senzorů. Zlatý bod v grafu.</div>
        <div class="row" style="margin-bottom:5px">
          <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Venkovní</span>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" id="inp-safe-curve-outdoor" class="num-inp" min="-20" max="30" step="0.5" value="0" style="width:46px;font-size:11px" title="Venkovní teplota bezpečného bodu.">
            <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
          </div>
        </div>
        <div class="row">
          <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Topení</span>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" id="inp-safe-curve-temp" class="num-inp" min="10" max="90" step="0.5" value="40" style="width:46px;font-size:11px" title="Výstupní teplota topení při výpadku senzorů.">
            <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
          </div>
        </div>
        <div class="set-save-row">
          <button class="set-btn-save" id="set-save-safe" title="Uložit bezpečný bod křivky do Home Assistant.">✓ Uložit</button>
          <button class="set-btn-discard" id="set-discard-safe" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
        </div>
      </div>

    </div>
  </div>

  <div class="settings-group-label">Nastavení režimů</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;align-items:stretch">
    <!-- Letní bypass -->
    <div class="set-card" id="set-card-bypass" title="Letní bypass — automatické pozastavení regulace při dosažení letní teploty. Nastavení integrace.">
      <div class="set-card-title">☀ Letní bypass</div>
      <div class="row" style="margin-bottom:5px">
        <span class="row-label" style="font-size:11px">Aktivní</span>
        <ha-switch id="sw-letni-bypass-settings" title="Pozastavit regulaci při dosažení letní teploty."></ha-switch>
      </div>
      <div class="row" id="row-bypass-temp">
        <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Teplota bypassu</span>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" id="inp-bypass-temp" class="num-inp" min="5" max="30" step="0.5" value="18" style="width:46px;font-size:11px" title="Nad tuto teplotu se regulace pozastaví.">
          <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
        </div>
      </div>
      <div class="set-save-row">
        <button class="set-btn-save" id="set-save-bypass" title="Uložit nastavení letního bypassu do Home Assistant.">✓ Uložit</button>
        <button class="set-btn-discard" id="set-discard-bypass" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
      </div>
    </div>

    <!-- Noční mód -->
    <div class="set-card" id="set-card-night" title="Noční mód — automatické snížení topení mimo denní hodiny. Součást profilu křivky.">
      <div class="set-card-title">🌙 Noční mód</div>
      <div class="row" style="margin-bottom:5px">
        <span class="row-label" style="font-size:11px">Aktivní</span>
        <ha-switch id="sw-night-mode-settings" title="Zapnout/vypnout noční mód."></ha-switch>
      </div>
      <div class="row" style="margin-bottom:5px">
        <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Denní okno</span>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" id="inp-day-start" class="num-inp" min="0" max="23" step="1" value="6" style="width:42px;font-size:11px" title="Hodina začátku dne.">
          <span style="font-size:11px">–</span>
          <input type="number" id="inp-day-end" class="num-inp" min="0" max="23" step="1" value="22" style="width:42px;font-size:11px" title="Hodina konce dne.">
          <span style="font-size:11px;color:var(--secondary-text-color)">h</span>
        </div>
      </div>
      <div class="row">
        <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Noční snížení</span>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" id="inp-night-offset" class="num-inp" min="-15" max="0" step="0.5" value="-5" style="width:46px;font-size:11px" title="O kolik °C snížit křivku v noci.">
          <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
        </div>
      </div>
      <div class="set-save-row">
        <button class="set-btn-save" id="set-save-night" title="Uložit nastavení nočního módu do Home Assistant.">✓ Uložit</button>
        <button class="set-btn-discard" id="set-discard-night" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
      </div>
    </div>

    <!-- Protimrazová ochrana -->
    <div class="set-card" id="set-card-frost" title="Protimrazová ochrana — minimální topení při velmi nízké venkovní teplotě. Součást profilu křivky.">
      <div class="set-card-title">❄ Protimrazová ochrana</div>
      <div class="row" style="margin-bottom:5px">
        <span class="row-label" style="font-size:11px">Aktivní</span>
        <ha-switch id="sw-frost-settings" title="Zapnout/vypnout protimrazovou ochranu."></ha-switch>
      </div>
      <div class="row" style="margin-bottom:5px">
        <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Aktivační práh</span>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" id="inp-frost-threshold" class="num-inp" min="-20" max="5" step="0.5" value="-5" style="width:46px;font-size:11px" title="Venkovní teplota pod níž se aktivuje protimraz.">
          <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
        </div>
      </div>
      <div class="row">
        <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Min topení</span>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" id="inp-frost-min-heat" class="num-inp" min="20" max="60" step="0.5" value="35" style="width:46px;font-size:11px" title="Minimální teplota topení při protimrazu.">
          <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
        </div>
      </div>
      <div class="set-save-row">
        <button class="set-btn-save" id="set-save-frost" title="Uložit nastavení protimrazové ochrany do Home Assistant.">✓ Uložit</button>
        <button class="set-btn-discard" id="set-discard-frost" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
      </div>
    </div>

  </div>

  <div class="settings-group-label">Nastavení integrace</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;align-items:stretch">
    <div style="display:flex;flex-direction:column;gap:10px;height:100%">

      <div class="set-card" style="flex:1" id="set-card-limits" title="Fyzické limity termostatu — minimální a maximální povolená teplota. Nastavení integrace, neukládá se do profilu.">
        <div class="set-card-title">🔒 Limity termostatu</div>
        <div class="limits-grid" style="gap:8px;margin-bottom:4px">
          <div class="limit-box" style="padding:8px">
            <div class="limit-lbl" style="font-size:11px">Minimum</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
              <input type="number" id="inp-tmin" class="num-inp" min="10" max="89" value="25" step="0.5" style="font-size:11px" title="Nejnižší povolená teplota termostatu.">
              <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
              <span id="badge-min" style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(239,159,39,.12);color:#9A6200;display:none;border:1px solid rgba(239,159,39,.3)">!</span>
            </div>
          </div>
          <div class="limit-box" style="padding:8px">
            <div class="limit-lbl" style="font-size:11px">Maximum</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
              <input type="number" id="inp-tmax" class="num-inp" min="11" max="90" value="42" step="0.5" style="font-size:11px" title="Nejvyšší povolená teplota termostatu.">
              <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
              <span id="badge-max" style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(239,159,39,.12);color:#9A6200;display:none;border:1px solid rgba(239,159,39,.3)">!</span>
            </div>
          </div>
        </div>
        <div class="limit-warn" id="limit-warn" style="font-size:11px">Výsledná teplota byla oříznutá limitem.</div>
        <div class="set-save-row">
          <button class="set-btn-save" id="set-save-limits" title="Uložit limity termostatu do Home Assistant.">✓ Uložit</button>
          <button class="set-btn-discard" id="set-discard-limits" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
        </div>
      </div>


    </div>
    <div style="display:flex;flex-direction:column;gap:10px;height:100%">

      <div class="set-card" style="flex:1" id="set-card-calc" title="Interval a způsob přepočtu topné křivky. Nastavení integrace, neukládá se do profilu.">
        <div class="set-card-title">⚙ Interval přepočtu</div>
        <div class="row" style="margin-bottom:5px">
          <span class="row-label" style="font-size:11px">Režim</span>
          <select id="sel-prepocet-rezim" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)" title="Čas = interval. Teplota = při změně. Obojí = co nastane dřív.">
            <option value="cas">Čas (interval)</option>
            <option value="teplota">Změna teploty</option>
            <option value="oboji">Obojí</option>
          </select>
        </div>
        <div class="row" style="margin-bottom:5px" id="row-prepocet-interval">
          <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Interval</span>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" id="inp-prepocet-interval" class="num-inp" min="1" max="120" step="1" value="30" style="width:46px;font-size:11px" title="Jak často přepočítat (v minutách).">
            <span style="font-size:11px;color:var(--secondary-text-color)">min</span>
          </div>
        </div>
        <div class="row" id="row-prepocet-delta">
          <span class="row-label" style="font-size:11px;color:var(--secondary-text-color)">Delta teploty</span>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" id="inp-prepocet-delta" class="num-inp" min="0.1" max="5" step="0.1" value="0.5" style="width:46px;font-size:11px" title="Minimální změna teploty pro přepočet.">
            <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
          </div>
        </div>
        <div class="set-save-row">
          <button class="set-btn-save" id="set-save-calc" title="Uložit nastavení intervalu přepočtu do Home Assistant.">✓ Uložit</button>
          <button class="set-btn-discard" id="set-discard-calc" disabled title="Zahodit neuložené změny a obnovit hodnoty z Home Assistant.">Zahodit</button>
        </div>
      </div>

    </div>
  </div>

  <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--divider-color);display:flex;align-items:center;justify-content:space-between;gap:10px">
    <div>
      <div style="font-size:11px;font-weight:500;color:var(--primary-text-color)">Vynucený refresh</div>
      <div style="font-size:10px;color:var(--secondary-text-color);margin-top:1px">Přepočítá počasí, vlivy a teplotu. Uloží do logu.</div>
    </div>
    <button id="btn-force-refresh" style="flex-shrink:0;font-size:12px;padding:5px 12px;border-radius:7px;border:1px solid #378ADD;color:#185FA5;background:rgba(55,138,221,.08);cursor:pointer;white-space:nowrap;font-weight:500" title="Okamžitě přepočítat vše a zapsat do logu.">↻ Refresh</button>
  </div>
  <div id="refresh-status" style="display:none;margin-top:6px;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:500"></div>

  </div>
  </details>


  <!-- Hidden compatibility elements — globální forecast control odstraněn, per-vliv přijde ve Fázi C -->
  <input type="hidden" id="inp-fc-hours" value="24">
  <input type="hidden" id="sw-fc">
  <!-- Undo notifikace -->
  <div class="undo-bar" id="undo-bar" role="status" aria-live="assertive">
    <span id="undo-msg"></span>
    <button class="undo-btn" id="undo-btn">Zpět</button>
  </div>

</div>`
;

    this.shadowRoot.appendChild(card);
    this._attachListeners();
    this._buildInfluences();

    // ResizeObserver pro inf-chart — překreslit při změně šířky
    const infWrap = this.shadowRoot.getElementById("inf-chart-wrap");
    if (infWrap && window.ResizeObserver) {
      if (this._infResizeObserver) this._infResizeObserver.disconnect();
      this._infResizeObserver = new ResizeObserver(() => {
        if (this._infChart) {
          this._infChart.resize();
        }
      });
      this._infResizeObserver.observe(infWrap);
    }
    this._initDualSliders();
  }

  _initDualSliders() {
    const sr = this.shadowRoot;

    // Rozsah venkovních teplot (-30 … +30, step 1)
    this._outSlider = new DualSlider(
      sr.getElementById("out-dual"),
      sr.getElementById("out-thumb-lo"),
      sr.getElementById("out-thumb-hi"),
      -30, 30, 1,
      (lo, hi) => this._onOutRangeChange(lo, hi)
    );
    this._outSlider.setValues(-20, 20);

    // Rozsah azimutu slunce (0 … 360, step 1)
    this._sunSlider = new DualSlider(
      sr.getElementById("sun-dual"),
      sr.getElementById("sun-thumb-lo"),
      sr.getElementById("sun-thumb-hi"),
      0, 360, 1,
      (lo, hi) => this._onSunRangeChange(lo, hi)
    );
    this._sunSlider.setValues(140, 220);

    // Minutový timer — aktualizace časové osy nezávisle na HA update cyklu
    this._timeAxisTimer = setInterval(() => this._updateTimeAxis(), 30000);
  }

  _attachListeners() {
    const sr = this.shadowRoot;

    // Kompakt / plný režim
    sr.getElementById("btn-compact").onclick = () => {
      const bms = sr.querySelector(".bms");
      const isCompact = bms.classList.toggle("compact");
      sr.getElementById("btn-compact").textContent = isCompact ? "⊞ Plný" : "⊟ Kompakt";
      this._compactMode = isCompact;
      if (!isCompact) setTimeout(() => this._updateChart(), 100); // resize po rozbalení
    };

    // Stránkování hvězdičkových profilů
    sr.getElementById("starred-prev")?.addEventListener("click", () => {
      this._starredPage = Math.max(0, this._starredPage - 1);
      this._updateSeasonPresets(this._hass);
    });
    sr.getElementById("starred-next")?.addEventListener("click", () => {
      this._starredPage++;
      this._updateSeasonPresets(this._hass);
    });

    // Undo mechanismus
    this._undoStack = [];
    sr.getElementById("undo-btn")?.addEventListener("click", () => this._doUndo());

    // Hlavní vypínač
    sr.getElementById("main-toggle").onclick = () => {
      const isOn = sr.getElementById("main-toggle").classList.contains("on");
      this._hass.callService("switch", isOn ? "turn_off" : "turn_on", { entity_id: "switch.bms_hlavni_vypinac" });
    };

    // Křivka se ukládá automaticky při každé změně bodu (live-save)
    // Tlačítka Uložit/Zahodit jsou odstraněna

    // ── Boost / Útlum ────────────────────────────────────────────────────────
    // Přidat blur listenery pro boost/reduction inputy - markPending zabrání přepsání
    ["inp-boost-amount", "inp-boost-hours", "inp-reduction-amount", "inp-reduction-hours"].forEach(id => {
      const el = sr.getElementById(id);
      if (!el) return;
      const eid = el.dataset.bmsEid;
      if (!eid) return;
      el.addEventListener("change", () => eid && this._markPending(eid));
      el.addEventListener("blur",   () => eid && this._markPending(eid));
    });

    sr.getElementById("btn-boost").onclick = () => {
      const amount = parseFloat(sr.getElementById("inp-boost-amount").value) || 5;
      const hours  = parseFloat(sr.getElementById("inp-boost-hours").value)  || 2;
      // Označit inputy jako pending aby nebyly přepsány HA state updatem
      this._markPending("number.bms_boost_amount");
      this._markPending("number.bms_boost_hours");
      // Okamžitá vizuální zpětná vazba
      const btn = sr.getElementById("btn-boost");
      btn.textContent = "⬆ Aktivováno";
      btn.disabled = true;
      btn.style.opacity = "0.7";
      setTimeout(() => { btn.textContent = "Zapnout"; btn.disabled = false; btn.style.opacity = ""; }, 3000);
      this._hass.callService("heating_curve", "activate_boost", { amount, hours });
      this._syncInput(sr.getElementById("inp-boost-amount"), "number.bms_boost_amount", amount);
      this._syncInput(sr.getElementById("inp-boost-hours"),  "number.bms_boost_hours",  hours);
      this._scheduleAutoRefresh();
    };
    sr.getElementById("btn-reduction").onclick = () => {
      const amount = parseFloat(sr.getElementById("inp-reduction-amount").value) || 5;
      const hours  = parseFloat(sr.getElementById("inp-reduction-hours").value)  || 2;
      this._markPending("number.bms_reduction_amount");
      this._markPending("number.bms_reduction_hours");
      const btn = sr.getElementById("btn-reduction");
      btn.textContent = "⬇ Aktivováno";
      btn.disabled = true;
      btn.style.opacity = "0.7";
      setTimeout(() => { btn.textContent = "Zapnout"; btn.disabled = false; btn.style.opacity = ""; }, 3000);
      this._hass.callService("heating_curve", "activate_reduction", { amount, hours });
      this._scheduleAutoRefresh();
    };
    sr.getElementById("boost-cancel-btn").onclick = () => {
      this._hass.callService("heating_curve", "cancel_boost", {});
      this._scheduleAutoRefresh();
    };

    // Accordion log
    // Výpočetní log — vždy zobrazit v hero-log sekci (accordion odstraněn)
    this._renderCalcLog();

    // ── Noční mód listenery ───────────────────────────────────────────────────
    const nightModeHandler = (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: "switch.bms_night_mode" });
      // Synchronizovat oba switche (mode-card + nastavení)
      const other = e.target.id === "sw-night-mode" ? sr.getElementById("sw-night-mode-settings") : sr.getElementById("sw-night-mode");
      if (other) other.checked = e.target.checked;
      setTimeout(() => this._update(), 50);
      this._scheduleAutoRefresh();
    };
    sr.getElementById("sw-night-mode")?.addEventListener("change", nightModeHandler);
    sr.getElementById("sw-night-mode-settings")?.addEventListener("change", nightModeHandler);
    this._bindInput(sr.getElementById("inp-day-start"),    "number.bms_day_start",    null, "set-card-night");
    this._bindInput(sr.getElementById("inp-day-end"),      "number.bms_day_end",      null, "set-card-night");
    this._bindInput(sr.getElementById("inp-night-offset"), "number.bms_night_offset", null, "set-card-night");

    // ── Protimraz listenery ───────────────────────────────────────────────────
    const frostHandler = (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: "switch.bms_frost_protection" });
      const other = e.target.id === "sw-frost" ? sr.getElementById("sw-frost-settings") : sr.getElementById("sw-frost");
      if (other) other.checked = e.target.checked;
      setTimeout(() => this._update(), 50);
      this._scheduleAutoRefresh();
    };
    sr.getElementById("sw-frost")?.addEventListener("change", frostHandler);
    sr.getElementById("sw-frost-settings")?.addEventListener("change", frostHandler);
    this._bindInput(sr.getElementById("inp-frost-threshold"), "number.bms_frost_threshold", null, "set-card-frost");
    this._bindInput(sr.getElementById("inp-frost-min-heat"),  "number.bms_frost_min_heat",  null, "set-card-frost");

    // ── Tlačítka Uložit/Zahodit pro karty profilu ────────────────────────────
    const NIGHT_EIDS  = ["number.bms_day_start","number.bms_day_end","number.bms_night_offset"];
    const FROST_EIDS  = ["number.bms_frost_threshold","number.bms_frost_min_heat"];
    const RANGE_EIDS  = ["number.bms_rozsah_venku_min","number.bms_rozsah_venku_max"];
    const SAFE_EIDS   = ["number.bms_safe_curve_outdoor","number.bms_safe_curve_temp"];
    const LIMITS_EIDS = ["number.bms_limit_min","number.bms_limit_max"];
    const BYPASS_EIDS = ["number.bms_letni_bypass_temp"];
    const CALC_EIDS   = ["number.bms_prepocet_interval","number.bms_prepocet_delta"];

    const bindCard = (saveId, discardId, eids, cardId) => {
      sr.getElementById(saveId)?.addEventListener("click", () => this._saveSettingsCard(eids, cardId));
      sr.getElementById(discardId)?.addEventListener("click", () => this._discardSettingsCard(eids, cardId));
    };
    bindCard("set-save-night",  "set-discard-night",  NIGHT_EIDS,  "set-card-night");
    bindCard("set-save-frost",  "set-discard-frost",  FROST_EIDS,  "set-card-frost");
    bindCard("set-save-range",  "set-discard-range",  RANGE_EIDS,  "set-card-range");
    bindCard("set-save-safe",   "set-discard-safe",   SAFE_EIDS,   "set-card-safe");
    bindCard("set-save-limits", "set-discard-limits", LIMITS_EIDS, "set-card-limits");
    bindCard("set-save-bypass", "set-discard-bypass", BYPASS_EIDS, "set-card-bypass");
    bindCard("set-save-calc",   "set-discard-calc",   CALC_EIDS,   "set-card-calc");

    // ── Interval a režim přepočtu ─────────────────────────────────────────────
    sr.getElementById("sel-prepocet-rezim")?.addEventListener("change", (e) => {
      const val = e.target.value;
      // Označit jako pending aby HA push nepřepsal hodnotu
      this._focusedInputs.add("select.bms_prepocet_rezim");
      this._markPending("select.bms_prepocet_rezim");
      this._hass.callService("select", "select_option", { entity_id: "select.bms_prepocet_rezim", option: val });
      this._updatePrepocetVisibility(val);
      // Odebrat fokus ochranu po 5s (HA by měl do té doby potvrdit nový stav)
      setTimeout(() => this._focusedInputs.delete("select.bms_prepocet_rezim"), 5000);
    });
    this._bindInput(sr.getElementById("inp-prepocet-interval"), "number.bms_prepocet_interval", null, "set-card-calc");
    this._bindInput(sr.getElementById("inp-prepocet-delta"),    "number.bms_prepocet_delta",    null, "set-card-calc");

    // ── Letní bypass ──────────────────────────────────────────────────────────
    const bypassHandler = (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: "switch.bms_letni_bypass" });
      const other = e.target.id === "sw-letni-bypass" ? sr.getElementById("sw-letni-bypass-settings") : sr.getElementById("sw-letni-bypass");
      if (other) other.checked = e.target.checked;
      setTimeout(() => this._update(), 50);
      this._scheduleAutoRefresh();
    };
    sr.getElementById("sw-letni-bypass")?.addEventListener("change", bypassHandler);
    sr.getElementById("sw-letni-bypass-settings")?.addEventListener("change", bypassHandler);
    this._bindInput(sr.getElementById("inp-bypass-temp"), "number.bms_letni_bypass_temp", null, "set-card-bypass");

    // ── Bezpečný bod křivky ───────────────────────────────────────────────────
    this._bindInput(sr.getElementById("inp-safe-curve-outdoor"), "number.bms_safe_curve_outdoor", null, "set-card-safe");
    this._bindInput(sr.getElementById("inp-safe-curve-temp"),    "number.bms_safe_curve_temp",    null, "set-card-safe");

    // Akordeon
    sr.getElementById("acc-btn").onclick = () => {
      this._accOpen = !this._accOpen;
      sr.getElementById("acc-body").classList.toggle("open", this._accOpen);
      sr.getElementById("acc-arrow").classList.toggle("open", this._accOpen);
    };

    // Spolehlivé hlídání fokusu v editoru křivky — event-based, ne activeElement polling
    const accBody = sr.getElementById("acc-body");
    if (accBody) {
      accBody.addEventListener("focusin",  () => { this._curveEditorFocused = true; });
      accBody.addEventListener("focusout", (e) => {
        // focusout bublá — zkontrolovat zda nový fokus není stále uvnitř acc-body
        if (!accBody.contains(e.relatedTarget)) {
          this._curveEditorFocused = false;
        }
      });
    }

    // Uložit / Smazat profil
    // ── Profily ──────────────────────────────────────────────────────────────
    const profToast = (msg, color="#0F6E56") => {
      const t = sr.getElementById("prof-toast");
      if (!t) return;
      t.textContent = msg; t.style.color = color; t.style.opacity = "1";
      setTimeout(() => { t.style.opacity = "0"; setTimeout(() => { t.textContent = ""; }, 300); }, 2500);
    };

    const selectedProf = () => sr.getElementById("prof-select")?.value || "Výchozí";

    // Chránit prof-select před přepisem z HA dokud uživatel vybírá
    const profSelectEl = sr.getElementById("prof-select");
    profSelectEl?.addEventListener("focus",    () => this._focusedInputs.add("select.bms_profil_krivky"));
    profSelectEl?.addEventListener("mousedown",() => this._focusedInputs.add("select.bms_profil_krivky"));
    profSelectEl?.addEventListener("blur",     () => setTimeout(() => this._focusedInputs.delete("select.bms_profil_krivky"), 3000));

    // Načíst profil
    sr.getElementById("prof-btn-load").onclick = () => {
      const name = selectedProf();
      this._hass.callService("heating_curve", "load_profile", { name });
      this._hass.callService("select", "select_option", { entity_id: "select.bms_profil_krivky", option: name });
      profToast(`✓ Profil "${name}" načten`);
    };

    // Přepsat existující profil
    sr.getElementById("prof-btn-save").onclick = () => {
      const name = selectedProf();
      if (name === "Výchozí") { profToast("Výchozí profil nelze přepsat.", "#A32D2D"); return; }
      this._hass.callService("heating_curve", "save_profile", { name });
      profToast(`✓ Profil "${name}" uložen`);
    };

    // Hvězdička — přidat/odebrat profil z rychlých profilů
    sr.getElementById("prof-btn-star")?.addEventListener("click", () => {
      const name    = selectedProf();
      const calcSt  = this._hass?.states["sensor.bms_calc_temp"];
      const starred = [...(calcSt?.attributes?.starred_profiles || ["Zima", "Jaro/Podzim", "Léto"])];
      const idx     = starred.indexOf(name);
      if (idx >= 0) {
        starred.splice(idx, 1);
        profToast(`☆ "${name}" odebrán z rychlých profilů`);
      } else {
        if (starred.length >= 15) { profToast("Maximálně 15 rychlých profilů.", "#A32D2D"); return; }
        starred.push(name);
        profToast(`★ "${name}" přidán do rychlých profilů`);
      }
      this._hass.callService("heating_curve", "set_starred", { starred });
      // Optimistický update — překreslit okamžitě bez čekání na HA push
      this._optimisticStarred = starred;
      setTimeout(() => {
        this._updateSeasonPresets(this._hass);
        this._optimisticStarred = null;
      }, 100);
    });

    // Export / Import profilů
    sr.getElementById("prof-btn-export")?.addEventListener("click", () => {
      const h = this._hass;
      if (!h) return;
      // Sestavíme snapshot z dostupných HA atributů (profily jsou v store, ne v state)
      // Použijeme workaround — zavoláme get_curve_points a zobrazíme info
      const area = sr.getElementById("prof-export-area");
      const status = sr.getElementById("prof-import-status");
      if (area) {
        // Exportovat dostupná data — profil options + aktivní profil
        const profState  = h.states["select.bms_profil_krivky"];
        const options    = profState?.attributes?.options || [];
        const active     = profState?.state || "Výchozí";
        const exportData = { _note: "Exportujte zálohu z HA Storage nebo použijte full backup.", profiles: options, active };
        area.value = JSON.stringify(exportData, null, 2);
        if (status) { status.textContent = "Záloha profilů je v HA Storage — pro plný export použijte HA backup."; status.style.color = "var(--c-warn)"; }
      }
    });

    sr.getElementById("prof-btn-import")?.addEventListener("click", () => {
      const area   = sr.getElementById("prof-export-area");
      const status = sr.getElementById("prof-import-status");
      if (!area || !this._hass) return;
      try {
        const data = JSON.parse(area.value);
        // Hledáme profily — buď pole stringů nebo objekt s klíčem profiles
        const names = Array.isArray(data) ? data : (Array.isArray(data.profiles) ? data.profiles : Object.keys(data).filter(k => !k.startsWith("_")));
        if (!names.length) throw new Error("Nenalezeny žádné profily.");
        // Import = načtení každého profilu jako nového (bez dat entit — záloha je v HA Storage)
        if (status) { status.textContent = `ℹ Importujte zálohu přes HA Storage restore. Nalezeno ${names.length} názvů profilů.`; status.style.color = "var(--c-info)"; }
      } catch (e) {
        if (status) { status.textContent = `✗ Chyba: ${e.message}`; status.style.color = "var(--c-err)"; }
      }
    });

    // Přidat pravidlo plánu
    sr.getElementById("btn-add-schedule")?.addEventListener("click", () => {
      this._showScheduleEditor(null);
    });

    // Okamžité vykreslení nastavení při otevření panelu
    sr.getElementById("details-ranges")?.addEventListener("toggle", (e) => {
      if (e.target.open) setTimeout(() => this._update(), 50);
    });

    // Okamžité vykreslení plánů při otevření panelu
    // schedules-panel je vždy viditelný — renderujeme ihned po připojení
    setTimeout(() => this._renderSchedules(this._hass), 100);

    // Přejmenovat profil
    sr.getElementById("prof-btn-ren").onclick = () => {
      const oldName = selectedProf();
      if (oldName === "Výchozí") { profToast("Výchozí profil nelze přejmenovat.", "#A32D2D"); return; }
      const newName = prompt(`Přejmenovat profil "${oldName}" na:`, oldName);
      if (!newName || newName.trim() === oldName) return;
      const trimmed = newName.trim();
      this._hass.callService("heating_curve", "save_profile", { name: trimmed });
      this._hass.callService("heating_curve", "delete_profile", { name: oldName });
      profToast(`✓ Přejmenováno na "${trimmed}"`);
      // Optimisticky přejmenovat v dropdownu
      const sel = sr.getElementById("prof-select");
      if (sel) {
        const opt = Array.from(sel.options).find(o => o.value === oldName);
        if (opt) { opt.value = trimmed; opt.textContent = trimmed; }
        sel.value = trimmed;
      }
    };

    // Smazat profil
    sr.getElementById("prof-btn-del").onclick = () => {
      const name = selectedProf();
      if (name === "Výchozí") { profToast("Výchozí profil nelze smazat.", "#A32D2D"); return; }
      const SYSTEM_PROFILES = ["Zima", "Jaro/Podzim", "Léto"];
      const isSystem = SYSTEM_PROFILES.includes(name);
      const confirmMsg = isSystem
        ? `Opravdu smazat výchozí sezónní profil "${name}"?\n\nPozor: tento profil byl automaticky vytvořen. Pro obnovení bude nutné restartovat integraci.`
        : `Opravdu smazat profil "${name}"?`;
      if (!confirm(confirmMsg)) return;
      this._hass.callService("heating_curve", "delete_profile", { name });
      profToast(`Profil "${name}" smazán`, "#9A6200");
      // Pokud jde o systémový profil, zobrazit persistentní varování v kartě
      if (isSystem) {
        this._deletedSystemProfiles = this._deletedSystemProfiles || new Set();
        this._deletedSystemProfiles.add(name);
        const warn = sr.getElementById("prof-system-warn");
        if (warn) warn.style.display = "block";
      }
      // Optimisticky odebrat z dropdownu ihned
      const sel = sr.getElementById("prof-select");
      if (sel) {
        const opt = Array.from(sel.options).find(o => o.value === name);
        if (opt) opt.remove();
        sel.value = "Výchozí";
      }
    };

    // Nový profil
    sr.getElementById("prof-btn-new").onclick = () => {
      const name = sr.getElementById("prof-new-name").value.trim();
      if (!name) { sr.getElementById("prof-new-name").focus(); return; }
      this._hass.callService("heating_curve", "save_profile", { name });
      sr.getElementById("prof-new-name").value = "";
      profToast(`✓ Profil "${name}" vytvořen`);
      // Optimisticky přidat do dropdownu ihned
      const sel = sr.getElementById("prof-select");
      if (sel && !Array.from(sel.options).find(o => o.value === name)) {
        const opt = document.createElement("option");
        opt.value = opt.textContent = name;
        sel.appendChild(opt);
        sel.value = name;
      }
    };
    sr.getElementById("prof-new-name").onkeydown = (e) => {
      if (e.key === "Enter") sr.getElementById("prof-btn-new").click();
    };

    // Předpověď switch (přepínač režimu Aktuální / Předpověď)
    // sw-curve-fc — nový přepínač v hlavičce topné křivky
    sr.getElementById("sw-curve-fc")?.addEventListener("change", (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: "switch.bms_pouziti_predpovedi" });
      const lbl = sr.getElementById("curve-fc-lbl");
      if (lbl) lbl.textContent = `Zdroj: ${e.target.checked ? "Předpověď" : "Aktuální"}`;
      setTimeout(() => this._updateChart(), 100);
      this._scheduleAutoRefresh(1000);
    });
    const inpCurveFcH = sr.getElementById("inp-curve-fc-hours");
    if (inpCurveFcH) {
      inpCurveFcH.dataset.bmsEid = "number.bms_predpoved_hodin";
      ["change","blur"].forEach(ev => inpCurveFcH.addEventListener(ev, (e) => {
        this._markPending("number.bms_predpoved_hodin");
        this._setNum("number.bms_predpoved_hodin", parseFloat(e.target.value));
        this._scheduleAutoRefresh(1500);
      }));
    }
    sr.getElementById("sw-fc")?.addEventListener("change", (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: "switch.bms_pouziti_predpovedi" });
      // Okamžitá odezva grafů — nečekat na HA push
      setTimeout(() => this._update(), 50);
    });

    // Vynucený refresh
    sr.getElementById("btn-force-refresh")?.addEventListener("click", () => {
      const btn = sr.getElementById("btn-force-refresh");
      const statusEl = sr.getElementById("refresh-status");
      if (!btn || !this._hass) return;

      // Vizuální feedback — tlačítko se zamkne
      btn.disabled = true;
      btn.textContent = "↻ Probíhá…";
      btn.style.opacity = "0.65";
      if (statusEl) { statusEl.style.display = "none"; }

      // Nejdřív se přihlásit k eventu s výsledkem, pak zavolat službu (jinak může event utéct)
      let unsub = null;
      let done = false;
      this._hass.connection.subscribeEvents((event) => {
        if (done) return;
        done = true;
        if (unsub) unsub(); // odhlásit se po prvním eventu
        const d = event.data || {};
        const ok = d.status === "ok";
        const partial = d.status === "partial";
        if (statusEl) {
          statusEl.style.display = "block";
          statusEl.style.background = ok
            ? "rgba(29,158,117,0.10)" : partial
            ? "rgba(239,159,39,0.10)"
            : "rgba(226,75,74,0.10)";
          statusEl.style.color = ok ? "#0F6E56" : partial ? "#9A6200" : "#A32D2D";
          statusEl.style.border = `1px solid ${ok ? "rgba(29,158,117,.25)" : partial ? "rgba(239,159,39,.25)" : "rgba(226,75,74,.25)"}`;
          const weatherTxt = d.weather_ok ? "✓ Počasí" : "✗ Počasí";
          const calcTxt    = d.calc_ok    ? "✓ Výpočet" : "✗ Výpočet";
          statusEl.textContent = `${d.time} — ${weatherTxt}, ${calcTxt}`;
          setTimeout(() => { if (statusEl) statusEl.style.display = "none"; }, 6000);
        }
        btn.disabled = false;
        btn.textContent = "↻ Refresh";
        btn.style.opacity = "1";
      }, "heating_curve_force_refresh_done").then((u) => {
        unsub = u;
        if (done) { u(); return; }
        this._hass.callService("heating_curve", "force_refresh", {});
      }).catch((err) => {
        console.warn("BMS: přihlášení k eventu selhalo, volám refresh bez zpětné vazby:", err);
        this._hass.callService("heating_curve", "force_refresh", {});
      });

      // Timeout pojistka — odblokovat tlačítko i bez eventu
      setTimeout(() => {
        if (btn.disabled) {
          btn.disabled = false;
          btn.textContent = "↻ Refresh";
          btn.style.opacity = "1";
        }
      }, 15000);
    });

    // Předpověď hodiny
    this._bindInput(sr.getElementById("inp-fc-hours"), "number.bms_predpoved_hodin",
      null, "set-card-fc");

    // Limity termostatu
    this._bindInput(sr.getElementById("inp-tmin"), "number.bms_limit_min", null, "set-card-limits");
    this._bindInput(sr.getElementById("inp-tmax"), "number.bms_limit_max", null, "set-card-limits");

    // Rozsah venkovních teplot + solární okno — obsluhují DualSlider instance
    // inicializované v _initDualSliders(), zde žádné listenery nepotřebujeme.

    const inpSunMax = sr.getElementById("inp-sun-max");
    if (inpSunMax) {
      inpSunMax.dataset.bmsEid = "number.bms_slunce_max_eff";
      this._bindInput(inpSunMax, "number.bms_slunce_max_eff", null, null);
      // Okamžité odeslání do HA při blur/change — bez čekání na uložení profilu
      const _sendSunMax = (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          this._setNum("number.bms_slunce_max_eff", val);
          this._markPending("number.bms_slunce_max_eff");
          setTimeout(() => this._updateChart(), 100);
        }
      };
      inpSunMax.addEventListener("blur",   _sendSunMax);
      inpSunMax.addEventListener("change", _sendSunMax);
    }
    const inpSunFcH = sr.getElementById("inp-sun-fc-hours");
    if (inpSunFcH) {
      inpSunFcH.dataset.bmsEid = "number.bms_slunce_predpoved_hodin";
      this._bindInput(inpSunFcH, "number.bms_slunce_predpoved_hodin", null, null);
      const _sendSunFcH = (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          this._setNum("number.bms_slunce_predpoved_hodin", val);
          this._markPending("number.bms_slunce_predpoved_hodin");
        }
      };
      inpSunFcH.addEventListener("blur",   _sendSunFcH);
      inpSunFcH.addEventListener("change", _sendSunFcH);
    }
  }

  _buildInfluences() {
    // Definice 4 vlivů — barva, ikona (MDI unicode), jednotky, rozsahy
    const defs = [
      { id: "vitr",      label: "Vítr",      unit: "km/h", icon: "mdi:weather-windy",
        color: "var(--c-info)", bg: "var(--c-info-bg)", border: "rgba(55,138,221,0.2)",
        sw: "switch.bms_vliv_vitr",      cur: "sensor.bms_actual_wind",
        slMax: 150, defaultOd: 10, defaultDo: 60 },
      { id: "srazky",    label: "Srážky",    unit: "mm/h", icon: "mdi:weather-pouring",
        color: "#5BA4E5", bg: "rgba(91,164,229,0.08)", border: "rgba(91,164,229,0.2)",
        sw: "switch.bms_vliv_srazky",    cur: "sensor.bms_actual_rain",
        slMax: 50,  defaultOd: 1,  defaultDo: 15 },
      { id: "vlhkost",   label: "Vlhkost",   unit: "%",    icon: "mdi:water-percent",
        color: "var(--c-frost)", bg: "var(--c-frost-bg)", border: "rgba(38,166,191,0.2)",
        sw: "switch.bms_vliv_vlhkost",   cur: "sensor.bms_actual_humidity",
        slMax: 100, defaultOd: 50, defaultDo: 90 },
      { id: "oblacnost", label: "Oblačnost", unit: "%",    icon: "mdi:weather-cloudy",
        color: "#8A9BB0", bg: "rgba(138,155,176,0.08)", border: "rgba(138,155,176,0.2)",
        sw: "switch.bms_vliv_oblacnost", cur: "sensor.bms_actual_clouds",
        slMax: 100, defaultOd: 20, defaultDo: 80 },
    ];

    const list = this.shadowRoot.getElementById("inf-list");
    if (!list) return;
    list.innerHTML = "";

    // Grid 2×2
    const grid = document.createElement("div");
    grid.className = "inf-grid";
    list.appendChild(grid);

    defs.forEach(d => {
      const card = document.createElement("div");
      card.className = "inf-card";
      card.id = `inf-${d.id}`;
      card.style.background = d.bg;
      card.style.borderColor = d.border;
      card.innerHTML = `
        <div class="inf-header">
          <ha-icon icon="${d.icon}" style="--mdc-icon-size:20px;color:${d.color};flex-shrink:0"></ha-icon>
          <span class="inf-title">${d.label}</span>
          <span class="inf-eff" id="eff-${d.id}" style="color:${d.color}">+0.0 °C</span>
          <ha-switch id="sw-${d.id}" title="Zapnout nebo vypnout vliv ${d.label.toLowerCase()} na výpočet cílové teploty topení."></ha-switch>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;margin-top:2px">
          <span style="font-size:10px;color:var(--secondary-text-color)" id="fc-src-lbl-${d.id}" title="Zdroj dat pro výpočet: Aktuální = naměřená hodnota nyní, Předpověď = předpovídaná hodnota pro zvolený výhled.">Zdroj: Aktuální</span>
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-size:10px;color:var(--secondary-text-color)">Předpověď</span>
            <ha-switch id="sw-${d.id}-fc" title="Přepnout zdroj dat pro ${d.label.toLowerCase()}: Aktuální (nyní naměřeno) nebo Předpověď (pro zvolený výhled)."></ha-switch>
          </div>
        </div>
        <div class="inf-vals">
          <div class="inf-val-box active" id="vbox-actual-${d.id}" title="Aktuálně naměřená hodnota z weather entity.">
            <div class="inf-val-lbl">Aktuální</div>
            <div><span class="inf-val-num" id="vnum-actual-${d.id}">—</span><span class="inf-val-unit">${d.unit}</span></div>
          </div>
          <div class="inf-val-box inactive" id="vbox-fc-${d.id}" title="Předpovídaná hodnota pro zvolený výhled. Dostupná jen při zapnutém režimu Předpověď.">
            <div class="inf-val-lbl">Předpověď</div>
            <div><span class="inf-val-num" id="vnum-fc-${d.id}">—</span><span class="inf-val-unit">${d.unit}</span></div>
          </div>
        </div>
        <div class="inf-range-row">
          <span class="inf-range-lbl">Rozsah účinnosti</span>
          <span class="inf-range-val" id="rng-${d.id}">${d.defaultOd}–${d.defaultDo} ${d.unit}</span>
        </div>
        <div class="range-track-wrap" style="margin-top:2px"
             title="Táhněte za kolečka a nastavte rozsah hodnot, ve kterém vliv začíná a dosahuje plné účinnosti. Pod spodní mezí je efekt nulový, nad horní je maximální.">
          <span class="range-lbl-side" style="min-width:22px;font-size:10px" id="rlo-${d.id}">0</span>
          <div class="dual-slider" id="ds-${d.id}">
            <div class="ds-track"><div class="ds-fill" id="dsf-${d.id}" style="background:${d.color}"></div></div>
            <div class="ds-thumb ds-thumb-lo" id="dsl-${d.id}" style="border-color:${d.color}"></div>
            <div class="ds-thumb ds-thumb-hi" id="dsh-${d.id}" style="border-color:${d.color}"></div>
          </div>
          <span class="range-lbl-side" style="min-width:22px;font-size:10px;text-align:right" id="rhi-${d.id}">${d.slMax}</span>
        </div>
        <div class="inf-max-row">
          <span class="inf-max-lbl">Max efekt</span>
          <input type="number" class="inf-max-inp" id="me-${d.id}" value="2" step="0.1" style="border-color:${d.border}"
                 title="Maximální korekce teploty topení v °C při dosažení horní meze rozsahu. Kladná hodnota topení zvyšuje, záporná snižuje.">
          <span style="font-size:11px;color:var(--secondary-text-color)">°C</span>
        </div>
        <div class="inf-max-row" style="margin-top:4px" title="Kolik hodin dopředu použít předpověď pro tento vliv (pokud je předpověď zapnuta).">
          <span class="inf-max-lbl">Předpověď</span>
          <input type="number" class="inf-max-inp" id="fch-${d.id}" value="6" step="1" min="1" max="48" style="border-color:${d.border}"
                 title="Počet hodin do budoucnosti z nichž se bere předpovídaná hodnota (1–48 h).">
          <span style="font-size:11px;color:var(--secondary-text-color)">h</span>
        </div>
        <canvas id="spark-${d.id}" width="200" height="28"
          style="display:block;width:100%;height:28px;margin-top:8px;border-radius:4px;opacity:.85"
          title="Minigraf efektu: křivka ukazuje jak roste korekce s hodnotou veličiny. Červená svislá čára = aktuálně naměřená (nebo předpovídaná) hodnota — průsečík s křivkou je korekce, která vstupuje do výpočtu."></canvas>`;
      grid.appendChild(card);

      // DualSlider pro rozsah od–do
      const slider = new DualSlider(
        this.shadowRoot.getElementById(`ds-${d.id}`),
        this.shadowRoot.getElementById(`dsl-${d.id}`),
        this.shadowRoot.getElementById(`dsh-${d.id}`),
        0, d.slMax, 1,
        (lo, hi) => {
          this.shadowRoot.getElementById(`rlo-${d.id}`).textContent = lo;
          this.shadowRoot.getElementById(`rhi-${d.id}`).textContent = hi;
          this.shadowRoot.getElementById(`rng-${d.id}`).textContent = `${lo}–${hi} ${d.unit}`;
          this._markPending(`number.bms_${d.id}_od`);
          this._markPending(`number.bms_${d.id}_do`);
          this._setNum(`number.bms_${d.id}_od`, lo);
          this._setNum(`number.bms_${d.id}_do`, hi);
        }
      );
      slider.setValues(d.defaultOd, d.defaultDo);
      // Uložíme referenci pro sync z HA
      if (!this._infSliders) this._infSliders = {};
      this._infSliders[d.id] = { slider, def: d };

      // Switch vliv on/off
      this.shadowRoot.getElementById(`sw-${d.id}`).addEventListener("change", (e) => {
        this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: d.sw });
        setTimeout(() => this._update(), 50);
        this._scheduleAutoRefresh();
      });

      // Forecast toggle — per-vliv
      this.shadowRoot.getElementById(`sw-${d.id}-fc`)?.addEventListener("change", (e) => {
        this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off",
          { entity_id: `switch.bms_${d.id}_predpoved` });
        // Okamžitě aktualizovat label
        const lbl = this.shadowRoot.getElementById(`fc-src-lbl-${d.id}`);
        if (lbl) lbl.textContent = `Zdroj: ${e.target.checked ? "Předpověď" : "Aktuální"}`;
        this._scheduleAutoRefresh(1000);
      });

      // Max efekt — plnohodnotný _bindInput s local-first ochranou před přepisem z HA
      const meEl2 = this.shadowRoot.getElementById(`me-${d.id}`);
      if (meEl2) {
        meEl2.dataset.bmsEid = `number.bms_${d.id}_max_eff`;
        this._bindInput(meEl2, `number.bms_${d.id}_max_eff`, null, null);
        // Dodatečný listener pro okamžité odeslání do HA při blur/change
        // (bez čekání na tlačítko Uložit — tato karta nemá save button)
        const _sendMe = (e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
            this._setNum(`number.bms_${d.id}_max_eff`, val);
            this._markPending(`number.bms_${d.id}_max_eff`);
            setTimeout(() => this._updateChart(), 100);
          }
        };
        meEl2.addEventListener("blur",   _sendMe);
        meEl2.addEventListener("change", _sendMe);
      }
      // Předpověď hodin — stejný pattern
      const fchEl2 = this.shadowRoot.getElementById(`fch-${d.id}`);
      if (fchEl2) {
        fchEl2.dataset.bmsEid = `number.bms_${d.id}_predpoved_hodin`;
        this._bindInput(fchEl2, `number.bms_${d.id}_predpoved_hodin`, null, null);
        const _sendFch = (e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
            this._setNum(`number.bms_${d.id}_predpoved_hodin`, val);
            this._markPending(`number.bms_${d.id}_predpoved_hodin`);
          }
        };
        fchEl2.addEventListener("blur",   _sendFch);
        fchEl2.addEventListener("change", _sendFch);
      }
    });

    // Vliv slunce — kompaktní řádek v gridu (switch je v sun-block níže)
    const sunRow = document.createElement("div");
    sunRow.className = "inf-sun-row";
    sunRow.style.cssText = "background:rgba(239,159,39,0.07);border-radius:10px;padding:10px 12px;border:1px solid rgba(239,159,39,0.15);grid-column:1/-1;";
    sunRow.innerHTML = `
      <div class="inf-header" style="margin-bottom:6px">
        <ha-icon icon="mdi:weather-sunny" style="--mdc-icon-size:20px;color:#EF9F27;flex-shrink:0"></ha-icon>
        <span class="inf-title">Pozice slunce</span>
        <span class="inf-eff" id="eff-sun" style="color:#EF9F27;font-size:13px;font-weight:600;min-width:48px;text-align:right">+0.0 °C</span>
        <ha-switch id="sw-slunce-grid" title="Zapnout nebo vypnout vliv slunce na výpočet topení."></ha-switch>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:10px;color:var(--secondary-text-color)" id="fc-src-lbl-slunce" title="Zdroj dat pro výpočet: Aktuální = naměřená poloha nyní, Předpověď = předpovídaná poloha pro zvolený výhled.">Zdroj: Aktuální</span>
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:10px;color:var(--secondary-text-color)">Předpověď</span>
          <ha-switch id="sw-slunce-fc" title="Přepnout zdroj dat pro slunce: Aktuální (nyní naměřeno) nebo Předpověď (pro zvolený výhled)."></ha-switch>
        </div>
      </div>
      <div class="inf-vals" style="margin-top:4px">
        <div class="inf-val-box active" id="vbox-actual-slunce" title="Aktuální poloha slunce.">
          <div class="inf-val-lbl">Aktuální</div>
          <div><span class="inf-val-num" id="vnum-actual-slunce">—</span><span class="inf-val-unit"> az/el°</span></div>
        </div>
        <div class="inf-val-box inactive" id="vbox-fc-slunce" title="Předpovídaná poloha slunce pro zvolený výhled.">
          <div class="inf-val-lbl">Předpověď</div>
          <div><span class="inf-val-num" id="vnum-fc-slunce">—</span><span class="inf-val-unit"> az/el°</span></div>
        </div>
      </div>
      <div id="sun-cloud-bar" style="margin-top:8px;padding:5px 8px;border-radius:6px;font-size:11px;display:flex;align-items:center;gap:8px;background:rgba(128,128,128,0.06);border:1px solid rgba(128,128,128,0.12)">
        <span style="flex:1;color:var(--secondary-text-color)" id="sun-cloud-txt">Oblačnost: — %</span>
        <div style="width:80px;height:6px;border-radius:3px;background:rgba(128,128,128,0.15);overflow:hidden;flex-shrink:0">
          <div id="sun-cloud-bar-fill" style="height:100%;border-radius:3px;transition:width .4s,background .4s;width:0%"></div>
        </div>
        <span id="sun-cloud-factor" style="font-weight:600;min-width:36px;text-align:right;color:var(--secondary-text-color)">—</span>
      </div>`;
    grid.appendChild(sunRow);

    // sw-slunce-grid je v inf-sun-row v gridu vlivů
    this.shadowRoot.getElementById("sw-slunce-grid")?.addEventListener("change", (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off", { entity_id: "switch.bms_vliv_slunce" });
      setTimeout(() => this._update(), 50);
      this._scheduleAutoRefresh();
    });

    // Forecast toggle pro slunce — používá globální switch.bms_pouziti_predpovedi
    this.shadowRoot.getElementById("sw-slunce-fc")?.addEventListener("change", (e) => {
      this._hass.callService("switch", e.target.checked ? "turn_on" : "turn_off",
        { entity_id: "switch.bms_pouziti_predpovedi" });
      const lbl = this.shadowRoot.getElementById("fc-src-lbl-slunce");
      if (lbl) lbl.textContent = `Zdroj: ${e.target.checked ? "Předpověď" : "Aktuální"}`;
      this._scheduleAutoRefresh(1000);
    });
  }

  _onOutRangeChange(lo, hi) {
    const from = Math.round(lo);
    const to   = Math.round(hi);
    const sr   = this.shadowRoot;
    sr.getElementById("out-range-lbl").textContent = `${from}° – ${to}°`;
    sr.getElementById("out-from-lbl").textContent  = `${from}°`;
    sr.getElementById("out-to-lbl").textContent    = `${to}°`;
    sr.getElementById("out-hint").textContent = `Mimo rozsah ${from}° – ${to}°: extrapoluje se krajní hodnotou`;
    this._markPending("number.bms_rozsah_venku_min");
    this._markPending("number.bms_rozsah_venku_max");
    this._setNum("number.bms_rozsah_venku_min", from);
    this._setNum("number.bms_rozsah_venku_max", to);
  }

  _onSunRangeChange(lo, hi) {
    const from = Math.round(lo);
    const to   = Math.round(hi);
    const sr   = this.shadowRoot;
    sr.getElementById("sun-range-lbl")?.textContent; // odstraněno v novém layoutu
    sr.getElementById("sun-from-lbl").textContent  = `${from}°`;
    sr.getElementById("sun-to-lbl").textContent    = `${to}°`;
    sr.getElementById("sun-hint").textContent = `Pod ${from}° a nad ${to}° — vliv slunce se ignoruje`;
    this._markPending("number.bms_solarni_start");
    this._markPending("number.bms_solarni_konec");
    this._setNum("number.bms_solarni_start", from);
    this._setNum("number.bms_solarni_konec", to);
    this._updateSunArc();
  }

  _setNum(eid, value, label) {
    // Uložit starou hodnotu pro undo
    const prev = this._hass.states[eid]?.state;
    if (prev !== undefined && !isNaN(parseFloat(prev))) {
      this._pushUndo({
        type: "number", eid, value: parseFloat(prev),
        label: label || eid.replace("number.bms_", "").replace(/_/g, " ")
      });
    }
    this._markPending(eid);
    this._hass.callService("number", "set_value", { entity_id: eid, value: parseFloat(value) });
  }

  _markPending(eid) {
    this._pendingInputs.set(eid, Date.now());
  }

  _isPending(eid) {
    const ts = this._pendingInputs.get(eid);
    if (!ts) return false;
    if (Date.now() - ts > this._PENDING_TTL) {
      this._pendingInputs.delete(eid);
      return false;
    }
    return true;
  }

  // Pomocná — nastaví hodnotu inputu jen pokud není pending ani focused
  _syncInput(inputEl, eid, value) {
    if (!inputEl) return;
    // Priorita: lokální neuložená hodnota > focused > pending > HA hodnota
    if (this._localSettings.has(eid)) {
      const localVal = this._localSettings.get(eid);
      if (String(inputEl.value) !== String(localVal)) inputEl.value = localVal;
      return;
    }
    // Ochrana focus — kontrolovat eid i dataset.bmsEid i el.id
    const elEid = inputEl.dataset?.bmsEid || inputEl.id || "";
    if (this._focusedInputs.has(eid)) return;
    if (elEid && this._focusedInputs.has(elEid)) return;
    if (this._isPending(eid)) return;
    if (elEid && this._isPending(elEid)) return;
    // Neaktualizovat pokud je element aktivní (má focus v DOM)
    try {
      const sr = this.shadowRoot;
      if (sr && sr.activeElement && (sr.activeElement === inputEl || sr.activeElement.contains?.(inputEl))) return;
    } catch(_) {}
    const current = parseFloat(inputEl.value);
    if (!isNaN(current) && Math.abs(current - value) < 0.001) return;
    inputEl.value = value;
  }

  // Local-first editace number inputu — žádné okamžité odesílání do HA
  _bindInput(inputEl, eid, _unused, cardId) {
    if (!inputEl || inputEl._bmsBound) return;
    inputEl._bmsBound = true;
    inputEl.dataset.bmsEid = eid;
    inputEl.dataset.bmsCard = cardId || "";

    // Robustní focus tracking — funguje i v Shadow DOM
    const onActivate = () => { this._focusedInputs.add(eid); };
    const onDeactivate = () => {
      const val = parseFloat(inputEl.value);
      if (!isNaN(val)) {
        const prev = this._localSettings.get(eid);
        if (prev === undefined || Math.abs(prev - val) > 0.0001) {
          this._localSettings.set(eid, val);
          this._markCardDirty(cardId);
        }
      }
      this._focusedInputs.delete(eid);
      setTimeout(() => this._update(), 30);
    };

    inputEl.addEventListener("focus",    onActivate);
    inputEl.addEventListener("mousedown", onActivate);
    inputEl.addEventListener("blur",      onDeactivate);
    inputEl.addEventListener("change",    onDeactivate);
    // Keyboard navigation — označit dirty při každém stisknutí šipky/čísla
    inputEl.addEventListener("keydown",   onActivate);
  }

  _markCardDirty(cardId) {
    if (!cardId) return;
    const sr = this.shadowRoot;
    const card = sr?.getElementById(cardId);
    if (card) card.classList.add("dirty");
    // Aktivovat tlačítko Zahodit
    const discardId = cardId.replace("set-card-", "set-discard-");
    const discardBtn = sr?.getElementById(discardId);
    if (discardBtn) discardBtn.disabled = false;
  }

  _saveSettingsCard(eids, cardId) {
    let saved = 0;
    eids.forEach(eid => {
      const val = this._localSettings.has(eid)
        ? this._localSettings.get(eid)
        : parseFloat(this.shadowRoot?.querySelector(`[data-bms-eid="${eid}"]`)?.value);
      if (!isNaN(val)) {
        this._markPending(eid);
        this._setNum(eid, val);
        this._localSettings.delete(eid);
        saved++;
      }
    });
    if (!cardId) return;
    const sr = this.shadowRoot;
    const card = sr?.getElementById(cardId);
    if (!card) return;
    card.classList.remove("dirty");

    // Viditelná zpětná vazba: zelený flash + text tlačítka
    const saveBtn = sr?.getElementById(cardId.replace("set-card-", "set-save-"));
    const discardBtn = sr?.getElementById(cardId.replace("set-card-", "set-discard-"));

    if (saveBtn) {
      const origText = saveBtn.textContent;
      saveBtn.textContent = "✓ Uloženo";
      saveBtn.style.background = "rgba(29,158,117,.25)";
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = origText;
        saveBtn.style.background = "";
        saveBtn.disabled = false;
      }, 2000);
    }
    if (discardBtn) discardBtn.disabled = true;

    card.style.transition = "border-color .4s, background .4s";
    card.style.borderColor = "rgba(29,158,117,.6)";
    card.style.background  = "rgba(29,158,117,.06)";
    setTimeout(() => {
      card.style.borderColor = "";
      card.style.background  = "";
    }, 1500);
    // Automatický přepočet po uložení nastavení
    this._scheduleAutoRefresh(1500);
  }

  _discardSettingsCard(eids, cardId) {
    eids.forEach(eid => this._localSettings.delete(eid));
    if (cardId) {
      const sr  = this.shadowRoot;
      const card = sr?.getElementById(cardId);
      if (card) card.classList.remove("dirty");
      const discardBtn = sr?.getElementById(cardId.replace("set-card-", "set-discard-"));
      if (discardBtn) discardBtn.disabled = true;
    }
    setTimeout(() => this._update(), 30);
  }

  // ─── HLAVNÍ UPDATE ─────────────────────────────────────────────────────────
  __updateImpl() {
    if (!this._hass) return;
    const h = this._hass;
    const sr = this.shadowRoot;

    // bypassOn/bypassActive musí být deklarovány na začátku — používají se před sekcí Letní bypass
    const bypassOn     = sw(h, "switch.bms_letni_bypass");
    const bypassActive = h.states["sensor.bms_calc_temp"]?.attributes?.bypass_active || false;

    // --- Hlavní vypínač ---
    const mainOn = sw(h, "switch.bms_hlavni_vypinac");
    const tog = sr.getElementById("main-toggle");
    const badge = sr.getElementById("main-status-badge");
    if (tog) {
      tog.className = "main-tog " + (mainOn ? "on" : "off");
      badge.className = "status-badge " + (mainOn ? "status-on" : "status-off");
      badge.textContent = mainOn ? "Aktivní" : "Vypnuto";
    }

    // --- Metriky ---
    const rawOutTemp = num(h, "sensor.bms_raw_outdoor_temp"); // vždy naměřená, bez předpovědi
    const outTemp    = num(h, "sensor.bms_applied_out_temp"); // použitá (může být z předpovědi)
    const curveTemp  = num(h, "sensor.bms_calc_temp") - num(h, "sensor.bms_total_correction");
    const totalCorr  = num(h, "sensor.bms_total_correction");
    const result     = num(h, "sensor.bms_calc_temp");

    sr.getElementById("mv-out").textContent   = rawOutTemp.toFixed(1) + " °C";
    sr.getElementById("mv-curve").textContent = curveTemp.toFixed(1) + " °C";
    sr.getElementById("mv-mod").textContent   = (totalCorr >= 0 ? "+" : "") + totalCorr.toFixed(1) + " °C";
    sr.getElementById("mv-out").title   = `Naměřená venkovní teplota: ${rawOutTemp.toFixed(1)} °C.`;
    sr.getElementById("mv-curve").title = `Teplota ze křivky pro ${outTemp.toFixed(1)} °C venku: ${curveTemp.toFixed(1)} °C.`;
    sr.getElementById("mv-mod").title   = `Celková korekce: ${totalCorr >= 0 ? "+" : ""}${totalCorr.toFixed(1)} °C.`;

    // --- Indikace zdroje venkovní teploty ---
    const tempSrc = h.states["sensor.bms_temp_source"];
    const srcKey  = tempSrc?.attributes?.source_key ?? "sensor";
    const useFc   = sw(h, "switch.bms_pouziti_predpovedi");
    const mOut    = sr.getElementById("m-out");
    const msOut   = sr.getElementById("ms-out");
    let srcLabel, srcTitle, srcBg;
    if (srcKey === "safe_fallback") {
      srcLabel = "⚠ záložní teplota";
      srcTitle = "Ani senzor ani weather entita nejsou dostupné — používá se bezpečná záložní teplota.";
      srcBg    = "rgba(226,75,74,0.07)";
    } else if (srcKey === "weather") {
      srcLabel = "weather entita";
      srcTitle = "Přímý senzor není dostupný — teplota pochází z weather entity.";
      srcBg    = "rgba(239,159,39,0.07)";
    } else {
      srcLabel = "ze senzoru";
      srcTitle = "Naměřená hodnota z venkovního senzoru.";
      srcBg    = "";
    }
    if (msOut) { msOut.textContent = srcLabel; msOut.title = srcTitle; }
    if (mOut)  mOut.style.background = srcBg;

    // --- Karta předpovědi (m-fc) ---
    const fcEnabled = sw(h, "switch.bms_pouziti_predpovedi");
    const fcHours   = num(h, "number.bms_predpoved_hodin", 24);
    const fcTempSt  = h.states["sensor.bms_applied_out_temp"]; // použitá teplota
    // Předpovídanou teplotu nemáme jako samostatný senzor — zobrazíme outTemp při aktivní předpovědi
    const mFc  = sr.getElementById("m-fc");
    const mvFc = sr.getElementById("mv-fc");
    const msFc = sr.getElementById("ms-fc");
    if (mvFc) {
      mvFc.textContent = fcEnabled ? outTemp.toFixed(1) + " °C" : "—";
      mvFc.title = fcEnabled ? `Předpovídaná teplota za +${fcHours} h: ${outTemp.toFixed(1)} °C. Tato hodnota vstupuje do výpočtu křivky.` : "Předpověď je vypnutá — do výpočtu vstupuje naměřená teplota.";
    }
    if (msFc) { msFc.textContent = fcEnabled ? `výhled +${fcHours} h` : "vypnuto"; }
    if (mFc) {
      // Zvýraznění: předpověď aktivní = m-fc accent, jinak m-out accent
      const fcActive = fcEnabled && srcKey === "sensor";
      mFc.classList.toggle("accent", fcActive);
      mFc.classList.toggle("dim",    !fcEnabled);
      sr.getElementById("m-out").classList.toggle("accent", !fcActive && srcKey === "sensor");
      sr.getElementById("m-out").classList.toggle("dim", false);
    }

    const modCard = sr.getElementById("m-mod");
    modCard.className = "metric" + (totalCorr > 0 ? " mod-pos" : totalCorr < 0 ? " mod-neg" : "");

    // --- Bezpečnostní limity UI sync ---
    const tMin = num(h, "number.bms_limit_min", 20);
    const tMax = num(h, "number.bms_limit_max", 75);
    this._syncInput(sr.getElementById("inp-tmin"), "number.bms_limit_min", tMin);
    this._syncInput(sr.getElementById("inp-tmax"), "number.bms_limit_max", tMax);

    const wasClamped = result !== (curveTemp + totalCorr);
    sr.getElementById("limit-warn").style.display  = wasClamped ? "block" : "none";
    sr.getElementById("badge-min").style.display   = (result <= tMin && wasClamped) ? "inline-block" : "none";
    sr.getElementById("badge-max").style.display   = (result >= tMax && wasClamped) ? "inline-block" : "none";

    // --- Předpověď / Aktuální — přepínač režimu ---
    const fcOn = sw(h, "switch.bms_pouziti_predpovedi");
    if (sr.getElementById("sw-fc")) sr.getElementById("sw-fc").checked = fcOn;
    // Sync nového curve-fc přepínače
    const curveFcEl = sr.getElementById("sw-curve-fc");
    if (curveFcEl) curveFcEl.checked = fcOn;
    const curveFcLbl = sr.getElementById("curve-fc-lbl");
    if (curveFcLbl) curveFcLbl.textContent = `Zdroj: ${fcOn ? "Předpověď" : "Aktuální"}`;
    const curveFcHoursEl = sr.getElementById("inp-curve-fc-hours");
    if (curveFcHoursEl && !this._focusedInputs?.has("inp-curve-fc-hours")) {
      const fcH = num(h, "number.bms_predpoved_hodin", 24);
      curveFcHoursEl.value = fcH;
    }
    // inp-fc-hours — globální forecast control odstraněn, sync přeskočen
    // Popisek stavu přepínače
    const fcModeLbl = sr.getElementById("fc-mode-lbl");
    if (fcModeLbl) {
      fcModeLbl.textContent = fcOn ? "Předpověď" : "Aktuální";
      fcModeLbl.style.fontWeight = "500";
      fcModeLbl.style.color = fcOn ? "var(--c-info)" : "var(--primary-text-color)";
    }
    // fc-badge (používá ho _updateSeasonPresets a inf-grid)
    const fcBadge = sr.getElementById("fc-badge");
    if (fcBadge) {
      fcBadge.style.display = fcOn ? "inline-block" : "none";
      fcBadge.textContent = `📡 +${num(h, "number.bms_predpoved_hodin", 24)} h`;
    }
    // Forecast border na inf-grid
    const infGrid = sr.querySelector(".inf-grid");
    if (infGrid) infGrid.classList.toggle("forecast-active", fcOn);

    // --- Profily ---
    const profState   = h.states["select.bms_profil_krivky"];
    const activeProf  = profState ? profState.state : "Výchozí";
    const profOptions = profState ? profState.attributes.options || ["Výchozí"] : ["Výchozí"];
    const profSelect  = sr.getElementById("prof-select");
    const profBadge   = sr.getElementById("prof-active-badge");
    const profBtnSave = sr.getElementById("prof-btn-save");
    const profBtnRen  = sr.getElementById("prof-btn-ren");
    const profBtnDel  = sr.getElementById("prof-btn-del");
    if (profSelect) {
      const optKeys = profOptions.join("|");
      if (profSelect.dataset.lastOpts !== optKeys) {
        profSelect.dataset.lastOpts = optKeys;
        profSelect.innerHTML = profOptions.map(p =>
          `<option value="${escHtml(p)}">${escHtml(p)}</option>`
        ).join("");
      }
      // Synchronizovat na aktivní profil — jen pokud uživatel právě nevybírá
      if (!this._focusedInputs.has("select.bms_profil_krivky") &&
          profSelect.value !== activeProf && profOptions.includes(activeProf)) {
        profSelect.value = activeProf;
      }
      // Badge: skrýt — aktivní profil je přímo vidět v selectu
      if (profBadge) profBadge.style.display = "none";
      // Disable tlačítek pro Výchozí
      const isDefault = profSelect.value === "Výchozí";
      if (profBtnSave) profBtnSave.disabled = isDefault;
      if (profBtnRen)  profBtnRen.disabled  = isDefault;
      if (profBtnDel)  profBtnDel.disabled  = isDefault;
    }

    const outFrom = num(h, "number.bms_rozsah_venku_min", -20);
    const outTo   = num(h, "number.bms_rozsah_venku_max",  20);
    sr.getElementById("out-range-lbl").textContent = `${outFrom}° – ${outTo}°`;
    sr.getElementById("out-from-lbl").textContent  = `${outFrom}°`;
    sr.getElementById("out-to-lbl").textContent    = `${outTo}°`;
    if (this._outSlider && !this._isPending("number.bms_rozsah_venku_min") && !this._isPending("number.bms_rozsah_venku_max")) {
      this._outSlider.setValues(outFrom, outTo);
    }

    const sunFrom = num(h, "number.bms_solarni_start", 140);
    const sunTo   = num(h, "number.bms_solarni_konec", 220);
    // sun-range-lbl odstraněn z layoutu
    sr.getElementById("sun-from-lbl").textContent  = `${sunFrom}°`;
    sr.getElementById("sun-to-lbl").textContent    = `${sunTo}°`;
    sr.getElementById("sun-hint").textContent = `Pod ${sunFrom}° a nad ${sunTo}° — vliv slunce se ignoruje`;
    if (this._sunSlider && !this._isPending("number.bms_solarni_start") && !this._isPending("number.bms_solarni_konec")) {
      this._sunSlider.setValues(sunFrom, sunTo);
    }
    this._syncInput(sr.getElementById("inp-sun-max"), "number.bms_slunce_max_eff", num(h, "number.bms_slunce_max_eff", -2));
    this._syncInput(sr.getElementById("inp-sun-fc-hours"), "number.bms_slunce_predpoved_hodin", num(h, "number.bms_slunce_predpoved_hodin", 6));

    // calcAttrs je definováno hned pod tím — přečteme je předem pro sun sekci

    // Aktuální poloha slunce — z dedikovaných senzorů
    const actSunElSt = h.states["sensor.bms_actual_sun_elevation"];
    const actSunAzSt = h.states["sensor.bms_actual_sun_azimuth"];
    const actualSunEl = (actSunElSt && actSunElSt.state !== "unavailable") ? parseFloat(actSunElSt.state) : null;
    const actualSunAz = (actSunAzSt && actSunAzSt.state !== "unavailable") ? parseFloat(actSunAzSt.state) : null;

    // Předpovídaná poloha — z dedikovaných senzorů; fallback JS výpočet
    const fcSunElSt = h.states["sensor.bms_forecast_sun_elevation"];
    const fcSunAzSt = h.states["sensor.bms_forecast_sun_azimuth"];
    let fcSunEl = (fcSunElSt && fcSunElSt.state !== "unavailable" && fcSunElSt.state !== "None")
      ? parseFloat(fcSunElSt.state) : null;
    let fcSunAz = (fcSunAzSt && fcSunAzSt.state !== "unavailable" && fcSunAzSt.state !== "None")
      ? parseFloat(fcSunAzSt.state) : null;

    // JS fallback — spočítáme ihned pokud senzory ještě nemají data
    if (fcSunEl === null) {
      const fcHoursSun = num(h, "number.bms_predpoved_hodin", 24);
      const lat = h.config?.latitude  ?? 50.0;
      const lng = h.config?.longitude ?? 14.0;
      const fcPos = this._sunPositionAt(Date.now() + fcHoursSun * 3600000, lat, lng);
      fcSunEl = fcPos.el;
      fcSunAz = fcPos.az;
    }

    // Fallback pro aktuální polohu — z applied senzoru
    const appliedSunEl = actualSunEl ?? num(h, "sensor.bms_sun_elevation", 0);
    const appliedSunAz = actualSunAz ?? num(h, "sensor.bms_sun_azimuth",   0);

    // Dual boxy pro pozici slunce
    const vboxActSun = sr.getElementById("vbox-actual-slunce");
    const vboxFcSun  = sr.getElementById("vbox-fc-slunce");
    const vnumActSun = sr.getElementById("vnum-actual-slunce");
    const vnumFcSun  = sr.getElementById("vnum-fc-slunce");
    if (vnumActSun) vnumActSun.textContent = `${appliedSunAz.toFixed(0)}/${appliedSunEl.toFixed(0)}`;
    if (vnumFcSun)  vnumFcSun.textContent  = fcSunEl !== null ? `${fcSunAz.toFixed(0)}/${fcSunEl.toFixed(0)}` : "—";
    if (vboxActSun) { vboxActSun.classList.toggle("active", !fcOn); vboxActSun.classList.toggle("inactive", fcOn); }
    if (vboxFcSun)  { vboxFcSun.classList.toggle("active",   fcOn); vboxFcSun.classList.toggle("inactive", !fcOn); }
    const _sunIsOn = sw(h, "switch.bms_vliv_slunce");
    sr.getElementById("sw-slunce")?.setAttribute && (()=>{})();
    const _sgEl = sr.getElementById("sw-slunce-grid"); if (_sgEl) _sgEl.checked = _sunIsOn;
    // Sync per-slunce forecast toggle
    const fcSunPerVliv = sw(h, "switch.bms_pouziti_predpovedi");
    const fcSunTogEl   = sr.getElementById("sw-slunce-fc");
    const fcSunLblEl   = sr.getElementById("fc-src-lbl-slunce");
    if (fcSunTogEl) fcSunTogEl.checked = fcSunPerVliv;
    if (fcSunLblEl) fcSunLblEl.textContent = `Zdroj: ${fcSunPerVliv ? "Předpověď" : "Aktuální"}`;
    // dual boxy dle per-vliv přepínače slunce
    if (vboxActSun) { vboxActSun.classList.toggle("active", !fcSunPerVliv); vboxActSun.classList.toggle("inactive",  fcSunPerVliv); }
    if (vboxFcSun)  { vboxFcSun.classList.toggle("active",   fcSunPerVliv); vboxFcSun.classList.toggle("inactive", !fcSunPerVliv); }
    const effSun = num(h, "sensor.bms_corr_sun", 0);
    const effSunEl = sr.getElementById("eff-sun");
    if (effSunEl) { effSunEl.textContent = fmtEff(effSun); effSunEl.style.color = effColor(effSun); effSunEl.title = `Korekce teploty topení způsobená polohou slunce: ${effSun >= 0 ? "+" : ""}${effSun.toFixed(2)} °C.`; }
    // sun-eff-badge v nadpisu sun-block sekce
    const sunEffBadge = sr.getElementById("sun-eff-badge");
    const sunIsOn = sw(h, "switch.bms_vliv_slunce");
    if (sunEffBadge) {
      const hasEff = sunIsOn && Math.abs(effSun) > 0.01;
      sunEffBadge.style.display = hasEff ? "inline-flex" : "none";
      if (hasEff) sunEffBadge.textContent = fmtEff(effSun) + " °C";
    }

    // Informační pruh — vliv oblačnosti na korekci slunce
    {
      const cloudsActSt = h.states["sensor.bms_actual_clouds"];
      const cloudsFcSt  = h.states["sensor.bms_forecast_clouds"];
      // Použijeme tu hodnotu oblačnosti která vstupuje do výpočtu
      const cloudsVal = fcOn && cloudsFcSt && cloudsFcSt.state !== "unavailable"
        ? parseFloat(cloudsFcSt.state)
        : (cloudsActSt && cloudsActSt.state !== "unavailable" ? parseFloat(cloudsActSt.state) : null);
      const cloudBar     = sr.getElementById("sun-cloud-bar");
      const cloudTxt     = sr.getElementById("sun-cloud-txt");
      const cloudFill    = sr.getElementById("sun-cloud-bar-fill");
      const cloudFactor  = sr.getElementById("sun-cloud-factor");
      if (cloudBar && cloudsVal !== null && !isNaN(cloudsVal)) {
        const cf = Math.max(0, 1 - cloudsVal / 100);
        // Barva a zpráva dle cloud_factor
        let barColor, msg, factorColor;
        if (cf >= 0.8) {
          barColor = "#1D9E75"; factorColor = "#0F6E56";
          msg = `Oblačnost ${cloudsVal.toFixed(0)} % — slunce svítí naplno`;
        } else if (cf >= 0.5) {
          barColor = "#EF9F27"; factorColor = "#9A6200";
          msg = `Oblačnost ${cloudsVal.toFixed(0)} % — částečná oblačnost, vliv slunce snížen`;
        } else if (cf >= 0.1) {
          barColor = "#E24B4A"; factorColor = "#A32D2D";
          msg = `Oblačnost ${cloudsVal.toFixed(0)} % — silná oblačnost, vliv slunce výrazně tlumen`;
        } else {
          barColor = "rgba(128,128,128,0.4)"; factorColor = "var(--secondary-text-color)";
          msg = `Oblačnost ${cloudsVal.toFixed(0)} % — úplná oblačnost, vliv slunce nulový`;
        }
        if (cloudTxt)    cloudTxt.textContent = msg;
        if (cloudFill) { cloudFill.style.width = `${(cf * 100).toFixed(0)}%`; cloudFill.style.background = barColor; }
        if (cloudFactor) {
          cloudFactor.textContent = `×${cf.toFixed(2)}`;
          cloudFactor.style.color = factorColor;
        }
        // Pruh je vždy viditelný (ne jen při zapnutém vlivu slunce) — informuje uživatele
        cloudBar.style.display = "flex";
        const isZero = cf < 0.01;
        cloudBar.style.background = isZero ? "rgba(226,75,74,0.06)" : "rgba(128,128,128,0.06)";
        cloudBar.style.borderColor = isZero ? "rgba(226,75,74,0.15)" : "rgba(128,128,128,0.12)";
      } else if (cloudBar) {
        cloudBar.style.display = "none";
      }
    }

    // Minigraf slunce — osa X = elevace (0–90°), aktivní hodnota = aktuální nebo forecast elevace
    {
      const sunMaxEff = num(h, "number.bms_slunce_max_eff", -2);
      const sunIsOn   = sw(h, "switch.bms_vliv_slunce");
      const sparkEl   = fcOn ? (fcSunEl ?? appliedSunEl) : appliedSunEl;
      // Pro minigraf použijeme lineární model elevace 0→30° = 0→maxEff
      this._drawInfluenceSpark("slunce", 0, 30, sunMaxEff, sparkEl, effSun, "#EF9F27", sunIsOn);
    }

    // --- Vnější vlivy UI sync (dual hodnoty: aktuální + předpověď) ---
    // Čteme z dedikovaných diag senzorů — vždy živé hodnoty, bez čekání na 30min cyklus
    const calcAttrs = h.states["sensor.bms_calc_temp"]?.attributes || {};
    const corrKey = { vitr: "wind", srazky: "rain", vlhkost: "humidity", oblacnost: "clouds" };
    if (this._infSliders) {
      Object.entries(this._infSliders).forEach(([id, {slider, def}]) => {
        const ck     = corrKey[id] || id;
        // Aktuální hodnota — dedikovaný senzor sensor.bms_actual_*
        const actSt  = h.states[`sensor.bms_actual_${ck}`];
        const actVal = (actSt && actSt.state !== "unavailable" && actSt.state !== "unknown")
          ? parseFloat(actSt.state) : num(h, def.cur, 0);
        // Předpovídaná — dedikovaný senzor sensor.bms_forecast_*
        const fcSt   = h.states[`sensor.bms_forecast_${ck}`];
        const hasFc  = fcSt && fcSt.state !== "unavailable" && fcSt.state !== "unknown" && fcSt.state !== "None";
        const fcVal  = hasFc ? parseFloat(fcSt.state) : null;
        const effVal = num(h, `sensor.bms_corr_${ck}`, 0);
        const odVal  = num(h, `number.bms_${id}_od`,      def.defaultOd);
        const doVal  = num(h, `number.bms_${id}_do`,      def.defaultDo);
        const meVal  = num(h, `number.bms_${id}_max_eff`, 2);
        const isOn   = sw(h, def.sw);

        // Dual value boxes
        const vboxAct = sr.getElementById(`vbox-actual-${id}`);
        const vboxFc  = sr.getElementById(`vbox-fc-${id}`);
        const vnumAct = sr.getElementById(`vnum-actual-${id}`);
        const vnumFc  = sr.getElementById(`vnum-fc-${id}`);

        if (vnumAct) vnumAct.textContent = isNaN(actVal) ? "—" : actVal.toFixed(1);
        if (vnumFc)  vnumFc.textContent  = hasFc ? fcVal.toFixed(1) : "—";

        // Per-vliv forecast toggle stav
        const fcPerVliv = sw(h, `switch.bms_${id}_predpoved`);
        const fcTogEl = sr.getElementById(`sw-${id}-fc`);
        if (fcTogEl) fcTogEl.checked = fcPerVliv;
        const fcLblEl = sr.getElementById(`fc-src-lbl-${id}`);
        if (fcLblEl) fcLblEl.textContent = `Zdroj: ${fcPerVliv ? "Předpověď" : "Aktuální"}`;

        // Dual value boxes — zvýraznit podle per-vliv přepínače
        if (vboxAct) { vboxAct.classList.toggle("active", !fcPerVliv); vboxAct.classList.toggle("inactive", fcPerVliv); }
        if (vboxFc)  { vboxFc.classList.toggle("active",  fcPerVliv);  vboxFc.classList.toggle("inactive", !fcPerVliv); }

        const effEl = sr.getElementById(`eff-${id}`);
        const swEl  = sr.getElementById(`sw-${id}`);
        const rngEl = sr.getElementById(`rng-${id}`);
        const meEl  = sr.getElementById(`me-${id}`);
        const card  = sr.getElementById(`inf-${id}`);

        if (effEl) { effEl.textContent = fmtEff(effVal); effEl.title = `Korekce: ${effVal >= 0 ? "+" : ""}${effVal.toFixed(2)} °C`; }
        if (swEl)  swEl.checked = isOn;
        if (card)  card.classList.toggle("disabled", !isOn);
        if (rngEl) rngEl.textContent = `${odVal}–${doVal} ${def.unit}`;
        this._syncInput(meEl, `number.bms_${id}_max_eff`, meVal);
        const fchEl = sr.getElementById(`fch-${id}`);
        const fchVal = num(h, `number.bms_${id}_predpoved_hodin`, 6);
        this._syncInput(fchEl, `number.bms_${id}_predpoved_hodin`, fchVal);

        if (!this._isPending(`number.bms_${id}_od`) && !this._isPending(`number.bms_${id}_do`)) {
          slider.setValues(odVal, doVal);
          const rlo = sr.getElementById(`rlo-${id}`); if (rlo) rlo.textContent = odVal;
          const rhi = sr.getElementById(`rhi-${id}`); if (rhi) rhi.textContent = doVal;
        }

        const sparkVal = fcPerVliv && hasFc ? fcVal : actVal;
        this._drawInfluenceSpark(id, odVal, doVal, meVal, sparkVal, effVal, def.color, isOn);
      });
    }

    // --- Hero + boost/noční/frost indikátor ---
    const boostSt   = h.states["sensor.bms_boost_status"];
    const boostIsUp = boostSt?.state === "boost";
    const boostIsDn = boostSt?.state === "reduction";
    // calcAttrs je definováno výše (vliv sekce) — sdílíme stejný objekt
    const nightNow  = calcAttrs.night_active || false;
    const frostNow  = calcAttrs.frost_active || false;

    // Hero element
    const heroEl  = sr.getElementById("hero-result");
    const heroVal = sr.getElementById("hero-val");
    const heroSub = sr.getElementById("hero-sub");
    if (heroEl && heroVal) {
      heroVal.textContent = result.toFixed(1) + "°C";
      heroVal.title = `Výsledná = křivka ${curveTemp.toFixed(1)}°C ${totalCorr >= 0 ? "+" : ""}${totalCorr.toFixed(1)}°C korekcí${wasClamped ? " → oříznutá na " + result.toFixed(1) + "°C" : ""}`;
      let heroState = "accent";
      let subText = "topení";
      if      (boostIsUp)  { heroState = "boost-up"; subText = `boost +${boostSt.attributes?.amount || ""}°C`; }
      else if (boostIsDn)  { heroState = "boost-dn"; subText = `útlum ${boostSt.attributes?.amount || ""}°C`; }
      else if (frostNow)   { heroState = "frost";    subText = "protimraz aktivní"; }
      else if (nightNow)   { heroState = "night";    subText = "noční mód"; }
      else if (wasClamped) { heroState = "clamped";  subText = "oříznutá limitem"; }
      heroEl.className = `hero-result ${heroState}`;
      if (heroSub) heroSub.textContent = subText;
    }

    // Noční a protimraz indikátor v metrice "Ze křivky"
    const mCurve = sr.getElementById("m-curve");
    if (mCurve) {
      mCurve.classList.toggle("night", nightNow && !frostNow);
      mCurve.classList.toggle("frost", frostNow);
    }

    // --- Graf ---
    this._updateChart();

    // --- Boost panel sync ---
    this._updateBoostPanel();

    // --- Noční mód + Protimraz UI sync ---
    const nightOn = sw(h, "switch.bms_night_mode");
    const frostOn = sw(h, "switch.bms_frost_protection");
    const swNight = sr.getElementById("sw-night-mode");
    const swNightS = sr.getElementById("sw-night-mode-settings");
    const swFrost = sr.getElementById("sw-frost");
    const swFrostS = sr.getElementById("sw-frost-settings");
    if (swNight) swNight.checked = nightOn;
    if (swNightS) swNightS.checked = nightOn;
    if (swFrost) swFrost.checked = frostOn;
    if (swFrostS) swFrostS.checked = frostOn;
    // Mode-card status a hodnoty
    const nightActive = nightOn && (h.states["sensor.bms_calc_temp"]?.attributes?.night_active || false);
    const frostActive = frostOn && (h.states["sensor.bms_calc_temp"]?.attributes?.frost_active || false);
    const nightBadge = sr.getElementById("night-status-badge");
    const frostBadge = sr.getElementById("frost-status-badge");
    if (nightBadge) { nightBadge.style.display = nightActive ? "block" : "none"; nightBadge.textContent = "🌙 Aktivní"; nightBadge.style.color = "var(--c-info)"; }
    if (frostBadge) { frostBadge.style.display = frostActive ? "block" : "none"; frostBadge.textContent = "❄ Aktivní"; frostBadge.style.color = "#26A6BF"; }
    // Mode-card visual border highlight
    const modeCardFrost = sr.getElementById("mode-card-frost");
    const modeCardNight = sr.getElementById("mode-card-night");
    const modeCardBypass = sr.getElementById("mode-card-bypass");
    if (modeCardFrost) {
      modeCardFrost.style.borderColor = frostActive ? "rgba(38,166,191,.4)" : "";
      modeCardFrost.style.background  = frostActive ? "rgba(38,166,191,.06)" : "";
    }
    if (modeCardNight) {
      modeCardNight.style.borderColor = nightActive ? "rgba(121,134,203,.4)" : "";
      modeCardNight.style.background  = nightActive ? "rgba(121,134,203,.06)" : "";
    }
    if (modeCardBypass) {
      modeCardBypass.style.borderColor = bypassActive ? "rgba(29,158,117,.4)" : "";
      modeCardBypass.style.background  = bypassActive ? "rgba(29,158,117,.06)" : "";
    }
    // row-bypass-temp — vždy zobrazit
    const rowBypassTemp = sr.getElementById("row-bypass-temp");
    if (rowBypassTemp) rowBypassTemp.style.display = "flex";
    const nightVals = sr.getElementById("night-vals");
    const frostVals = sr.getElementById("frost-vals");
    if (nightVals) nightVals.textContent = `${num(h,"number.bms_day_start",6)}:00–${num(h,"number.bms_day_end",22)}:00, offset ${num(h,"number.bms_night_offset",-5)}°C`;
    if (frostVals) frostVals.textContent = `Práh ${num(h,"number.bms_frost_threshold",-5)}°C, min ${num(h,"number.bms_frost_min_heat",35)}°C`;
    this._syncInput(sr.getElementById("inp-day-start"),       "number.bms_day_start",       num(h, "number.bms_day_start",       6));
    this._syncInput(sr.getElementById("inp-day-end"),         "number.bms_day_end",         num(h, "number.bms_day_end",         22));
    this._syncInput(sr.getElementById("inp-night-offset"),    "number.bms_night_offset",    num(h, "number.bms_night_offset",    -5));
    this._syncInput(sr.getElementById("inp-frost-threshold"), "number.bms_frost_threshold", num(h, "number.bms_frost_threshold", -5));
    this._syncInput(sr.getElementById("inp-frost-min-heat"),  "number.bms_frost_min_heat",  num(h, "number.bms_frost_min_heat",  35));

    // ── Přepočet ──────────────────────────────────────────────────────────────
    const selRezim = sr.getElementById("sel-prepocet-rezim");
    const rezimEid = "select.bms_prepocet_rezim";
    if (selRezim && !this._focusedInputs.has(rezimEid) && !this._localSettings.has(rezimEid)) {
      const haRezim = h.states[rezimEid]?.state;
      const validOptions = ["cas", "teplota", "oboji"];
      const prepocetRezim = validOptions.includes(haRezim) ? haRezim : "cas";
      if (selRezim.value !== prepocetRezim) selRezim.value = prepocetRezim;
      this._updatePrepocetVisibility(prepocetRezim);
    }
    this._syncInput(sr.getElementById("inp-prepocet-interval"), "number.bms_prepocet_interval", num(h, "number.bms_prepocet_interval", 30));
    this._syncInput(sr.getElementById("inp-prepocet-delta"),    "number.bms_prepocet_delta",    num(h, "number.bms_prepocet_delta",    0.5));

    // ── Letní bypass ──────────────────────────────────────────────────────────
    // bypassOn a bypassActive jsou deklarovány na začátku metody
    const bypassSwEl   = sr.getElementById("sw-letni-bypass");
    const bypassSwS    = sr.getElementById("sw-letni-bypass-settings");
    if (bypassSwEl) bypassSwEl.checked = bypassOn;
    if (bypassSwS)  bypassSwS.checked  = bypassOn;
    const bypassBadge = sr.getElementById("bypass-active-badge");
    if (bypassBadge) bypassBadge.style.display = bypassActive ? "block" : "none";
    const bypassVals = sr.getElementById("bypass-vals");
    if (bypassVals) bypassVals.textContent = `Práh ${num(h,"number.bms_letni_bypass_temp",18)}°C`;
    this._syncInput(sr.getElementById("inp-bypass-temp"), "number.bms_letni_bypass_temp", num(h, "number.bms_letni_bypass_temp", 18));
    const bypassBanner = sr.getElementById("bypass-active-banner");
    if (bypassBanner) bypassBanner.style.display = bypassActive ? "block" : "none";

    // ── Bezpečný bod křivky ───────────────────────────────────────────────────
    this._syncInput(sr.getElementById("inp-safe-curve-outdoor"), "number.bms_safe_curve_outdoor", num(h, "number.bms_safe_curve_outdoor", 0));
    this._syncInput(sr.getElementById("inp-safe-curve-temp"),    "number.bms_safe_curve_temp",    num(h, "number.bms_safe_curve_temp",    40));
  }



  // Auto-refresh po uživatelské změně — debounce 2s, pak force_refresh + toast
  _scheduleAutoRefresh(debounceMs = 2000) {
    if (this._autoRefreshTimer) clearTimeout(this._autoRefreshTimer);
    // Zobraz indikátor "Přepočítávám…"
    const sr = this.shadowRoot;
    const alertBar = sr?.getElementById("alert-bar");
    if (alertBar && !this._toastTimer) {
      alertBar.innerHTML = `<span>⟳ Přepočítávám…</span>`;
      alertBar.className = "alert-bar show";
    }
    this._autoRefreshTimer = setTimeout(() => {
      this._autoRefreshTimer = null;
      if (!this._hass) return;
      this._hass.callService("heating_curve", "force_refresh", {});
      // Výsledek příjde přes HA event — toast se zobrazí v _updateAlerts
    }, debounceMs);
  }

  _updatePrepocetVisibility(rezim) {
    const sr = this.shadowRoot;
    const showInterval = rezim === "cas" || rezim === "oboji";
    const showDelta    = rezim === "teplota" || rezim === "oboji";
    const rowInt = sr.getElementById("row-prepocet-interval");
    const rowDel = sr.getElementById("row-prepocet-delta");
    if (rowInt) rowInt.style.display = showInterval ? "flex" : "none";
    if (rowDel) rowDel.style.display = showDelta    ? "flex" : "none";
  }

  _updateBoostPanel() {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;
    const boostSt   = h.states["sensor.bms_boost_status"];
    const statusRow = sr.getElementById("boost-status-row");
    const statusLbl = sr.getElementById("boost-status-lbl");
    const statusTime= sr.getElementById("boost-status-time");
    const btnBoost  = sr.getElementById("btn-boost");
    const btnRed    = sr.getElementById("btn-reduction");
    if (!statusRow) return;

    const active = boostSt && boostSt.state !== "inactive";
    statusRow.style.display = active ? "flex" : "none";

    // Zastavit předchozí countdown timer
    if (this._boostCountdownTimer) {
      clearInterval(this._boostCountdownTimer);
      this._boostCountdownTimer = null;
    }

    if (active && boostSt) {
      const amt     = boostSt.attributes?.amount ?? 0;
      const untilTs = boostSt.attributes?.until_ts ?? 0;

      if (boostSt.state === "boost") {
        statusRow.style.background  = "rgba(226,75,74,0.1)";
        statusRow.style.borderColor = "rgba(226,75,74,0.25)";
        if (statusLbl) statusLbl.textContent = `⬆ Boost +${amt} °C`;
      } else {
        statusRow.style.background  = "rgba(55,138,221,0.1)";
        statusRow.style.borderColor = "rgba(55,138,221,0.25)";
        if (statusLbl) statusLbl.textContent = `⬇ Útlum −${Math.abs(amt)} °C`;
      }

      // Live countdown — aktualizuje se každou sekundu
      const _updateCountdown = () => {
        const remSec = Math.max(0, Math.round(untilTs - Date.now() / 1000));
        const h_rem  = Math.floor(remSec / 3600);
        const m_rem  = Math.floor((remSec % 3600) / 60);
        const s_rem  = remSec % 60;
        if (statusTime) {
          statusTime.textContent = h_rem > 0
            ? `zbývá ${h_rem} h ${m_rem} min`
            : m_rem > 0
            ? `zbývá ${m_rem}:${String(s_rem).padStart(2,"0")} min`
            : `zbývá ${s_rem} s`;
        }
        if (remSec === 0 && this._boostCountdownTimer) {
          clearInterval(this._boostCountdownTimer);
          this._boostCountdownTimer = null;
        }
      };
      _updateCountdown();
      this._boostCountdownTimer = setInterval(_updateCountdown, 1000);
    }
    if (btnBoost) btnBoost.classList.toggle("active", active && boostSt.state === "boost");
    if (btnRed)   btnRed.classList.toggle("active",   active && boostSt.state === "reduction");
    // Zobrazit tlačítko Zrušit v mode-card při aktivním boostu
    const cancelBtn = sr.getElementById("boost-cancel-btn");
    if (cancelBtn) cancelBtn.style.display = active ? "inline-flex" : "none";
    // Vizuální stav mode-card
    const modeCardBoost = sr.getElementById("mode-card-boost");
    const modeCardRed   = sr.getElementById("mode-card-red");
    if (modeCardBoost) {
      modeCardBoost.style.borderColor = active && boostSt.state === "boost"
        ? "rgba(226,75,74,.4)" : "";
      modeCardBoost.style.background  = active && boostSt.state === "boost"
        ? "rgba(226,75,74,.06)" : "";
    }
    if (modeCardRed) {
      modeCardRed.style.borderColor = active && boostSt.state === "reduction"
        ? "rgba(55,138,221,.4)" : "";
      modeCardRed.style.background  = active && boostSt.state === "reduction"
        ? "rgba(55,138,221,.06)" : "";
    }

    // Sync defaultních hodnot
    this._syncInput(sr.getElementById("inp-boost-amount"),     "number.bms_boost_amount",     num(this._hass, "number.bms_boost_amount",     5));
    this._syncInput(sr.getElementById("inp-boost-hours"),      "number.bms_boost_hours",      num(this._hass, "number.bms_boost_hours",      2));
    this._syncInput(sr.getElementById("inp-reduction-amount"), "number.bms_reduction_amount", num(this._hass, "number.bms_reduction_amount", 5));
    this._syncInput(sr.getElementById("inp-reduction-hours"),  "number.bms_reduction_hours",  num(this._hass, "number.bms_reduction_hours",  2));
  }

  /**
   * Kreslí minigraf lineárního efektu vlivu do <canvas id="spark-{id}">.
   * Osa X = hodnota meteorologické veličiny (0 … slMax nebo do*1.2)
   * Osa Y = korekce teploty (0 … meVal nebo meVal*1.2)
   * Svislá červená čára = aktuální naměřená hodnota (curVal)
   * Tečka na křivce = aktuální korekce (effVal)
   */
  _drawInfluenceSpark(id, od, doV, me, curVal, effVal, color, isOn) {
    const canvas = this.shadowRoot.getElementById(`spark-${id}`);
    if (!canvas) return;
    const W = canvas.offsetWidth || 200;
    const H = canvas.offsetHeight || 28;
    canvas.width  = W * (window.devicePixelRatio || 1);
    canvas.height = H * (window.devicePixelRatio || 1);
    const ctx = canvas.getContext("2d");
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, W, H);

    // Polyfill roundRect pro starší Safari
    if (!ctx.roundRect) {
      ctx.roundRect = function(x, y, w, h, r) {
        this.beginPath(); this.moveTo(x+r,y);
        this.lineTo(x+w-r,y); this.arcTo(x+w,y,x+w,y+r,r);
        this.lineTo(x+w,y+h-r); this.arcTo(x+w,y+h,x+w-r,y+h,r);
        this.lineTo(x+r,y+h); this.arcTo(x,y+h,x,y+h-r,r);
        this.lineTo(x,y+r); this.arcTo(x,y,x+r,y,r); this.closePath();
      };
    }
    const PAD_L = 2, PAD_R = 6, PAD_T = 4, PAD_B = 4;
    const cW = W - PAD_L - PAD_R;
    const cH = H - PAD_T - PAD_B;

    // Rozsah X: 0 … max(doV * 1.3, curVal * 1.1)
    const xMax = Math.max(doV * 1.3, curVal > 0 ? curVal * 1.1 : doV * 1.3, 1);
    // Rozsah Y: 0 … abs(me) * 1.2 (vždy kladné pro zobrazení)
    const absME = Math.abs(me) || 1;
    const yMax  = absME * 1.2;

    const toX = v => PAD_L + (v / xMax) * cW;
    const toY = v => PAD_T + cH - (Math.abs(v) / yMax) * cH; // vždy vykresli od spodku

    // ── Pozadí ─────────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(128,128,128,0.06)";
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 3);
    ctx.fill();

    // ── Nulová linie (spodek) ───────────────────────────────────────────────
    ctx.strokeStyle = "rgba(128,128,128,0.2)";
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T + cH);
    ctx.lineTo(PAD_L + cW, PAD_T + cH);
    ctx.stroke();

    // ── Aktivní efektová oblast (světlé fill) ───────────────────────────────
    const fillColor = color.startsWith("var(") ? "rgba(55,138,221,0.12)" : color.replace(")", ",0.12)").replace("rgb(", "rgba(");
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(toX(0),   PAD_T + cH);
    ctx.lineTo(toX(od),  PAD_T + cH);
    ctx.lineTo(toX(doV), toY(me));
    ctx.lineTo(toX(xMax),toY(me));
    ctx.lineTo(toX(xMax),PAD_T + cH);
    ctx.closePath();
    ctx.fill();

    // ── Efektová křivka (linka) ─────────────────────────────────────────────
    const lineColor = color.startsWith("var(") ? "#378ADD" : color;
    ctx.strokeStyle = isOn ? lineColor : "rgba(128,128,128,0.3)";
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(toX(0),   PAD_T + cH);       // 0 → 0 efekt
    ctx.lineTo(toX(od),  PAD_T + cH);       // od → stále 0
    ctx.lineTo(toX(doV), toY(me));           // plato začíná u doV
    ctx.lineTo(toX(xMax),toY(me));           // plato pokračuje
    ctx.stroke();

    // ── Mez od/do — svislé čáry ────────────────────────────────────────────
    ctx.strokeStyle = "rgba(128,128,128,0.25)";
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([2, 2]);
    [od, doV].forEach(v => {
      ctx.beginPath();
      ctx.moveTo(toX(v), PAD_T);
      ctx.lineTo(toX(v), PAD_T + cH);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // ── Aktuální hodnota — svislá čára ─────────────────────────────────────
    if (curVal >= 0 && curVal <= xMax) {
      ctx.strokeStyle = "rgba(226,75,74,0.7)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(toX(curVal), PAD_T);
      ctx.lineTo(toX(curVal), PAD_T + cH);
      ctx.stroke();

      // Tečka na křivce v místě aktuální hodnoty
      const dotY = toY(effVal);
      ctx.fillStyle = isOn ? lineColor : "rgba(128,128,128,0.4)";
      ctx.beginPath();
      ctx.arc(toX(curVal), dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Popisek max efektu (pravý okraj) ───────────────────────────────────
    ctx.fillStyle = "rgba(128,128,128,0.55)";
    ctx.font = `${Math.max(8, Math.round(H * 0.32))}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText((me >= 0 ? "+" : "") + me.toFixed(1) + "°", W - 1, PAD_T);
  }

  _renderCalcLog() {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;
    const listEl = sr.getElementById("calc-log-list");
    if (!listEl) return;

    const calcSt = h.states["sensor.bms_calc_temp"];
    const log = calcSt?.attributes?.calc_log || [];

    // Aktualizovat timestamp posledního záznamu
    const lastUpdate = sr.getElementById("log-last-update");
    if (lastUpdate && log.length) {
      lastUpdate.textContent = `poslední: ${log[0].time || ""}`;
    }

    if (!log.length) {
      listEl.innerHTML = '<div style="color:var(--secondary-text-color);font-size:12px;padding:8px 0">Žádné záznamy — log se plní při každém výpočtu.</div>';
      return;
    }

    listEl.innerHTML = log.map(e => {
      // Speciální záznamy událostí (boost start/stop/expire)
      if (e.event) {
        const eventMap = {
          boost_start:      { icon: "⬆", color: "#A32D2D", bg: "rgba(226,75,74,.1)",  border: "rgba(226,75,74,.25)",  text: `Boost +${Math.abs(e.amount)}°C spuštěn na ${e.hours}h` },
          reduction_start:  { icon: "⬇", color: "#185FA5", bg: "rgba(55,138,221,.1)", border: "rgba(55,138,221,.25)", text: `Útlum −${Math.abs(e.amount)}°C spuštěn na ${e.hours}h` },
          boost_cancel:     { icon: "✕", color: "#9A6200", bg: "rgba(239,159,39,.08)", border: "rgba(239,159,39,.2)",  text: "Boost zrušen" },
          reduction_cancel: { icon: "✕", color: "#9A6200", bg: "rgba(239,159,39,.08)", border: "rgba(239,159,39,.2)",  text: "Útlum zrušen" },
          boost_expired:    { icon: "⏱", color: "#9A6200", bg: "rgba(239,159,39,.08)", border: "rgba(239,159,39,.2)",  text: `Boost +${Math.abs(e.amount)}°C vypršel` },
          reduction_expired:{ icon: "⏱", color: "#9A6200", bg: "rgba(239,159,39,.08)", border: "rgba(239,159,39,.2)",  text: `Útlum −${Math.abs(e.amount)}°C vypršel` },
        };
        const ev = eventMap[e.event] || { icon: "●", color: "var(--secondary-text-color)", bg: "transparent", border: "var(--divider-color)", text: e.event };
        return `<div class="calc-log-entry" style="border-left-color:${ev.border};background:${ev.bg}">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="calc-log-time">${e.time}</span>
            <span style="font-size:12px;font-weight:500;color:${ev.color}">${ev.icon} ${ev.text}</span>
          </div>
        </div>`;
      }

      const tags = [
        e.manual    ? '<span class="calc-log-tag" style="background:rgba(55,138,221,.15);color:#185FA5">↻ Manuální</span>' : '',
        e.frost     ? '<span class="calc-log-tag tag-frost">❄ Protimraz</span>'    : '',
        e.night     ? '<span class="calc-log-tag tag-night">🌙 Noc</span>'         : '',
        e.boost > 0 ? `<span class="calc-log-tag tag-boost">⬆ Boost +${e.boost}°C</span>` : '',
        e.boost < 0 ? `<span class="calc-log-tag tag-reduction">⬇ Útlum ${e.boost}°C</span>` : '',
        e.clamped   ? '<span class="calc-log-tag tag-clamped">⚠ Oříznutí</span>'  : '',
      ].filter(Boolean).join('');

      const parts = [
        `křivka ${e.curve}°C`,
        e.corr_wind    ? `vítr ${e.corr_wind > 0 ? '+' : ''}${e.corr_wind}°C`      : '',
        e.corr_rain    ? `srážky ${e.corr_rain > 0 ? '+' : ''}${e.corr_rain}°C`    : '',
        e.corr_hum     ? `vlhkost ${e.corr_hum > 0 ? '+' : ''}${e.corr_hum}°C`    : '',
        e.corr_clouds  ? `oblačnost ${e.corr_clouds > 0 ? '+' : ''}${e.corr_clouds}°C` : '',
        e.corr_sun     ? `slunce ${e.corr_sun > 0 ? '+' : ''}${e.corr_sun}°C`     : '',
        e.night_offset ? `noc ${e.night_offset}°C`                                  : '',
        e.boost        ? `boost ${e.boost > 0 ? '+' : ''}${e.boost}°C`             : '',
      ].filter(Boolean).join(' + ');

      const cls = e.frost ? 'frost' : e.night ? 'night'
               : (e.boost > 0) ? 'boost' : (e.boost < 0) ? 'reduction'
               : e.clamped ? 'clamped' : '';

      const resultColor = e.clamped ? '#EF9F27' : '#1D9E75';
      return `<div class="calc-log-entry ${cls}">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="calc-log-time">${e.time}</span>
          <span style="font-size:11px;color:var(--secondary-text-color)">venku ${e.out}°C</span>
          <span class="calc-log-result" style="color:${resultColor}">${e.result}°C</span>
          ${tags}
        </div>
        <div class="calc-log-breakdown">${parts} = ${e.raw}°C${e.clamped ? ` → oříznutí → ${e.result}°C` : ''}</div>
      </div>`;
    }).join('');
  }

  // ── Undo mechanismus ─────────────────────────────────────────────────────
  _pushUndo(action) {
    this._undoStack = this._undoStack || [];
    this._undoStack.push(action);
    if (this._undoStack.length > 10) this._undoStack.shift();
    // Zobraz undo bar na 4 sekundy
    if (this._undoTimer) clearTimeout(this._undoTimer);
    const bar = this.shadowRoot?.getElementById("undo-bar");
    const msg = this.shadowRoot?.getElementById("undo-msg");
    if (bar && msg) {
      msg.textContent = `Změněno: ${action.label}`;
      bar.classList.add("show");
      this._undoTimer = setTimeout(() => { bar.classList.remove("show"); }, 4000);
    }
  }

  _doUndo() {
    const action = this._undoStack?.pop();
    if (!action) return;
    const bar = this.shadowRoot?.getElementById("undo-bar");
    bar?.classList.remove("show");
    if (action.type === "number") {
      this._markPending(action.eid);
      this._hass.callService("number", "set_value", { entity_id: action.eid, value: action.value });
    }
  }

  // ── Toast notifikace ──────────────────────────────────────────────────────
  _showToast(msg, type = "info") {
    const alertBar = this.shadowRoot?.getElementById("alert-bar");
    if (!alertBar) return;
    const colors = {
      season: { bg: "rgba(55,138,221,.12)", color: "#185FA5", border: "rgba(55,138,221,.25)", icon: "ℹ" },
      info:   { bg: "rgba(29,158,117,.12)", color: "#0F6E56", border: "rgba(29,158,117,.25)", icon: "✓" },
      warn:   { bg: "rgba(239,159,39,.12)", color: "#9A6200", border: "rgba(239,159,39,.3)",  icon: "⚠" },
    };
    const col = colors[type] || colors.info;
    alertBar.style.background  = col.bg;
    alertBar.style.color       = col.color;
    alertBar.style.borderColor = col.border;
    alertBar.style.border      = `1px solid ${col.border}`;
    alertBar.innerHTML = `<span>${col.icon} ${escHtml(msg)}</span>`;
    alertBar.className = "alert-bar show";
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      alertBar.className = "alert-bar";
      alertBar.innerHTML = "";
      this._toastTimer = null;
    }, type === "warn" ? 5000 : 3000);
  }

  // ── Přirozený jazykový souhrn ─────────────────────────────────────────────
  _updateSummary(h) {
    const el = this.shadowRoot?.getElementById("summary-row");
    if (!el || !h) return;

    const outTemp    = num(h, "sensor.bms_raw_outdoor_temp");
    const result     = num(h, "sensor.bms_calc_temp");
    const curveTemp  = num(h, "sensor.bms_calc_temp") - num(h, "sensor.bms_total_correction");
    const totalCorr  = num(h, "sensor.bms_total_correction");
    const boostSt    = h.states["sensor.bms_boost_status"];
    const calcAttrs  = h.states["sensor.bms_calc_temp"]?.attributes || {};
    const nightNow   = calcAttrs.night_active || false;
    const frostNow   = calcAttrs.frost_active || false;
    const mainOn     = h.states["switch.bms_hlavni_vypinac"]?.state === "on";

    if (!mainOn) {
      el.innerHTML = '⏸ Regulace je <strong>vypnutá</strong> — termostat se nenastavuje, výpočty probíhají.';
      return;
    }
    if (outTemp === 0 && result === 0) {
      el.innerHTML = '⏳ Čekám na data…';
      return;
    }

    const parts = [];
    if (Math.abs(totalCorr) > 0.1) {
      const corrParts = [];
      const w = num(h, "sensor.bms_corr_wind",     0);
      const r = num(h, "sensor.bms_corr_rain",      0);
      const hu= num(h, "sensor.bms_corr_humidity",  0);
      const cl= num(h, "sensor.bms_corr_clouds",    0);
      const su= num(h, "sensor.bms_corr_sun",       0);
      if (Math.abs(w)  > 0.05) corrParts.push(`vítr ${w > 0 ? "+" : ""}${w.toFixed(1)}°C`);
      if (Math.abs(r)  > 0.05) corrParts.push(`srážky ${r > 0 ? "+" : ""}${r.toFixed(1)}°C`);
      if (Math.abs(hu) > 0.05) corrParts.push(`vlhkost ${hu > 0 ? "+" : ""}${hu.toFixed(1)}°C`);
      if (Math.abs(cl) > 0.05) corrParts.push(`oblačnost ${cl > 0 ? "+" : ""}${cl.toFixed(1)}°C`);
      if (Math.abs(su) > 0.05) corrParts.push(`slunce ${su > 0 ? "+" : ""}${su.toFixed(1)}°C`);
      if (corrParts.length) parts.push(corrParts.join(", "));
    }
    if (nightNow)  parts.push(`<span class="sum-tag" style="background:rgba(121,134,203,.15);color:#3949AB">🌙 noční útlum</span>`);
    if (frostNow)  parts.push(`<span class="sum-tag" style="background:rgba(38,166,191,.15);color:#0D7A8A">❄ protimraz</span>`);
    if (boostSt?.state === "boost")     parts.push(`<span class="sum-tag" style="background:rgba(226,75,74,.15);color:#A32D2D">⬆ boost +${boostSt.attributes?.amount || 0}°C</span>`);
    if (boostSt?.state === "reduction") parts.push(`<span class="sum-tag" style="background:rgba(55,138,221,.15);color:#185FA5">⬇ útlum ${boostSt.attributes?.amount || 0}°C</span>`);

    const profState  = h.states["select.bms_profil_krivky"];
    const activeProf = profState ? profState.state : null;

    const wasClamped = Math.abs(result - (curveTemp + totalCorr)) > 0.5;
    let txt = "";
    // Název aktivního profilu jako první — pokud není Výchozí
    if (activeProf && activeProf !== "Výchozí") {
      txt += `<span class="sum-tag" style="background:rgba(29,158,117,.13);color:#0F6E56;border:1px solid rgba(29,158,117,.25)">📋 ${escHtml(activeProf)}</span> `;
    }
    txt += `Topím na <strong>${result.toFixed(1)} °C</strong> — křivka ${curveTemp.toFixed(1)}°C`;
    if (parts.length) txt += `, ${parts.join(", ")}`;
    if (wasClamped) txt += ` <span class="sum-tag" style="background:rgba(239,159,39,.15);color:#9A6200">⚠ oříznutí limitem</span>`;
    txt += `.`;
    el.innerHTML = txt;
  }

  // ── Stavová lišta ─────────────────────────────────────────────────────────
  _updateStateBar(h) {
    const bar = this.shadowRoot?.getElementById("state-bar");
    if (!bar || !h) return;
    const mainOn   = h.states["switch.bms_hlavni_vypinac"]?.state === "on";
    const boostSt  = h.states["sensor.bms_boost_status"];
    const calcAttr = h.states["sensor.bms_calc_temp"]?.attributes || {};
    if (!mainOn) { bar.className = "state-bar inactive"; return; }
    if (boostSt?.state === "boost")     { bar.className = "state-bar boost"; return; }
    if (boostSt?.state === "reduction") { bar.className = "state-bar reduction"; return; }
    if (calcAttr.frost_active)          { bar.className = "state-bar frost"; return; }
    if (calcAttr.night_active)          { bar.className = "state-bar night"; return; }
    bar.className = "state-bar active";
  }

  // ── Alerty ────────────────────────────────────────────────────────────────
  _updateAlerts(h) {
    const sr  = this.shadowRoot;
    const bar = sr?.getElementById("alert-bar");
    if (!bar || !h || this._toastTimer) return; // nepřepisovat aktivní toast
    const srcSt    = h.states["sensor.bms_temp_source"];
    const boostSt  = h.states["sensor.bms_boost_status"];
    const calcAttr = h.states["sensor.bms_calc_temp"]?.attributes || {};

    let msg = "", cls = "";

    if (boostSt?.state === "boost") {
      const rem = boostSt.attributes?.remaining_min ?? 0;
      msg = `⬆ Boost aktivní — zbývá ${rem} min`; cls = "boost";
    } else if (boostSt?.state === "reduction") {
      const rem = boostSt.attributes?.remaining_min ?? 0;
      msg = `⬇ Útlum aktivní — zbývá ${rem} min`; cls = "reduction";
    } else if (calcAttr.frost_active) {
      msg = "❄ Protimrazová ochrana aktivní"; cls = "frost";
    } else if (calcAttr.night_active) {
      msg = "🌙 Noční mód — snížená teplota topení"; cls = "night";
    }

    // 1b — Alert při výpadku senzoru déle než 15 min
    if (!msg && srcSt?.attributes?.source_key === "safe_fallback") {
      const since = srcSt.attributes?.safe_since_min ?? 0;
      if (since >= 15) {
        msg = `⚠ Senzor nedostupný ${since} min — topím na bezpečné teplotě`; cls = "sensor";
      }
    }
    // Upozornění přímo v bloku Topení
    const heroWarn = sr.getElementById("hero-sensor-warn");
    if (heroWarn) {
      const isSafe = srcSt?.attributes?.source_key === "safe_fallback";
      heroWarn.style.display = isSafe ? "block" : "none";
      if (isSafe) {
        const since = srcSt.attributes?.safe_since_min ?? 0;
        heroWarn.textContent = since > 0
          ? `⚠ Senzor nedostupný ${since} min — bezpečný bod`
          : "⚠ Záložní bezpečný bod";
      }
    }

    // 1a — Varování při opakovaném oříznutí limitem (≥3× za posledních 6h)
    if (!msg) {
      const clampLog = h.states["sensor.bms_calc_temp"]?.attributes?.clamp_log || [];
      const sixHAgo  = Date.now() / 1000 - 6 * 3600;
      const recentClamps = clampLog.filter(e => e.ts > sixHAgo).length;
      if (recentClamps >= 3) {
        const dir = clampLog[0]?.raw > clampLog[0]?.clamped ? "přetopení" : "podchlazení";
        msg = `⚠ Limit termostatu zasáhl ${recentClamps}× za 6 h — možné ${dir}`; cls = "sensor";
      }
    }

    if (msg) {
      bar.innerHTML = `<span>${msg}</span>`;
      bar.className = `alert-bar show ${cls}`;
    } else {
      bar.className = "alert-bar";
    }
  }

  // ── Sparkline ─────────────────────────────────────────────────────────────
  _updateSparkline(h) {
    const canvas = this.shadowRoot?.getElementById("spark-canvas");
    if (!canvas) return;
    const log = h.states["sensor.bms_calc_temp"]?.attributes?.calc_log || [];
    if (log.length < 2) return;

    const vals = log.slice(0, 10).map(e => e.result).reverse();
    const W = canvas.offsetWidth || 80;
    const H = 20;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const mn = Math.min(...vals) - 1, mx = Math.max(...vals) + 1;
    const toY = v => H - 2 - ((v - mn) / (mx - mn)) * (H - 4);
    const toX = i => (i / (vals.length - 1)) * (W - 2) + 1;

    ctx.strokeStyle = "#1D9E75";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    vals.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
    ctx.stroke();

    // Aktuální bod
    const last = vals[vals.length - 1];
    ctx.fillStyle = "#1D9E75";
    ctx.beginPath();
    ctx.arc(toX(vals.length - 1), toY(last), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Časové plány profilů ──────────────────────────────────────────────────
  _renderSchedules(h) {
    const sr = this.shadowRoot;
    const listEl = sr.getElementById("schedules-list");
    if (!listEl || !h) return;

    const calcSt    = h.states["sensor.bms_calc_temp"];
    const schedules = calcSt?.attributes?.schedules || [];
    const profState = h.states["select.bms_profil_krivky"];
    const options   = profState?.attributes?.options || ["Výchozí"];

    // Hash guard — nepřekreslovat pokud se data nezměnila (zabraňuje přerušení interakce)
    const hash = JSON.stringify(schedules);
    if (hash === this._schedulesHash) return;
    this._schedulesHash = hash;

    if (!schedules.length) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--secondary-text-color);padding:4px 0">Žádná pravidla — klikněte "+ Přidat pravidlo".</div>`;
      return;
    }

    listEl.innerHTML = "";
    schedules.forEach((rule, idx) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:rgba(var(--rgb-primary-text-color,255,255,255),.04);border:1px solid var(--divider-color)";

      // Enabled toggle
      const tog = document.createElement("ha-switch");
      tog.checked = rule.enabled !== false;
      tog.addEventListener("change", () => {
        this._hass.callService("heating_curve", "save_schedule", { ...rule, enabled: tog.checked });
      });

      // Popis pravidla
      let desc = "";
      if (rule.type === "date") {
        desc = `📅 ${escHtml(rule.date_from || "?")} – ${escHtml(rule.date_to || "?")} → <strong>${escHtml(rule.profile)}</strong>`;
      } else {
        desc = `🌡 venku ${escHtml(rule.temp_op)} ${escHtml(rule.temp_val)}°C po ${escHtml(rule.temp_days)} d → <strong>${escHtml(rule.profile)}</strong>`;
      }

      // Pořadí
      const orderBtns = document.createElement("div");
      orderBtns.style.cssText = "display:flex;flex-direction:column;gap:1px;flex-shrink:0";
      const btnUp = document.createElement("button");
      btnUp.textContent = "▲"; btnUp.style.cssText = "font-size:9px;padding:0 4px;border:none;background:transparent;cursor:pointer;color:var(--secondary-text-color)";
      btnUp.disabled = idx === 0;
      btnUp.onclick = () => this._reorderSchedule(schedules, idx, -1);
      const btnDn = document.createElement("button");
      btnDn.textContent = "▼"; btnDn.style.cssText = "font-size:9px;padding:0 4px;border:none;background:transparent;cursor:pointer;color:var(--secondary-text-color)";
      btnDn.disabled = idx === schedules.length - 1;
      btnDn.onclick = () => this._reorderSchedule(schedules, idx, +1);
      orderBtns.append(btnUp, btnDn);

      const descEl = document.createElement("span");
      descEl.style.cssText = "flex:1;font-size:12px;color:var(--primary-text-color)";
      descEl.innerHTML = desc;

      const editBtn = document.createElement("button");
      editBtn.textContent = "✏";
      editBtn.style.cssText = "font-size:12px;padding:3px 7px;border-radius:5px;border:1px solid var(--divider-color);background:transparent;cursor:pointer;flex-shrink:0";
      editBtn.onclick = () => this._showScheduleEditor(rule);

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = "font-size:12px;padding:3px 7px;border-radius:5px;border:1px solid rgba(226,75,74,.3);color:#A32D2D;background:transparent;cursor:pointer;flex-shrink:0";
      delBtn.onclick = () => {
        if (confirm(`Smazat pravidlo?`)) {
          this._hass.callService("heating_curve", "delete_schedule", { id: rule.id });
        }
      };

      row.append(orderBtns, tog, descEl, editBtn, delBtn);
      listEl.appendChild(row);
    });
  }

  _reorderSchedule(schedules, idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= schedules.length) return;
    const reordered = [...schedules];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    this._hass.callService("heating_curve", "reorder_schedules", { order: reordered.map(r => r.id) });
  }

  _showScheduleEditor(existingRule) {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;
    const profState = h.states["select.bms_profil_krivky"];
    const options   = (profState?.attributes?.options || ["Výchozí"]).filter(p => !p.startsWith("__"));
    const r = existingRule || { type: "date", profile: "Výchozí", date_from: "", date_to: "", temp_op: "<", temp_val: 5, temp_days: 3, enabled: true };

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center";

    const dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--card-background-color);border-radius:12px;padding:20px;width:320px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.3)";
    dialog.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:14px">${existingRule ? "Upravit pravidlo" : "Nové pravidlo"}</div>
      <div style="margin-bottom:10px">
        <label style="font-size:12px;color:var(--secondary-text-color)">Typ pravidla</label><br>
        <select id="sch-type" title="Typ pravidla: Datum = platí v daném období každý rok. Teplota = platí když je průměrná venkovní teplota splňuje podmínku déle než N dní." style="width:100%;margin-top:4px;padding:5px 8px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:13px">
          <option value="date" ${r.type==="date"?"selected":""}>Datum (od–do)</option>
          <option value="temp" ${r.type==="temp"?"selected":""}>Venkovní teplota</option>
        </select>
      </div>
      <div id="sch-date-fields" style="display:${r.type==="date"?"block":"none"};margin-bottom:10px">
        <label style="font-size:12px;color:var(--secondary-text-color)">Datum od–do (MM-DD)</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <input id="sch-from" type="text" placeholder="11-01" title="Datum začátku ve formátu MM-DD (měsíc-den), např. 11-01 pro 1. listopadu." value="${escHtml(r.date_from||"")}" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:13px">
          <span style="align-self:center">–</span>
          <input id="sch-to" type="text" placeholder="03-31" title="Datum konce ve formátu MM-DD (měsíc-den), např. 03-31 pro 31. března. Pravidlo funguje i přes přelom roku." value="${escHtml(r.date_to||"")}" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:13px">
        </div>
      </div>
      <div id="sch-temp-fields" style="display:${r.type==="temp"?"block":"none"};margin-bottom:10px">
        <label style="font-size:12px;color:var(--secondary-text-color)">Podmínka teploty</label>
        <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
          <span style="font-size:12px">Venku</span>
          <select id="sch-op" title="Porovnání: pod = průměr nižší než hodnota. nad = průměr vyšší než hodnota." style="padding:5px 6px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)">
            <option value="<" ${r.temp_op==="<"?"selected":""}>pod</option>
            <option value=">" ${r.temp_op===">"?"selected":""}>nad</option>
          </select>
          <input id="sch-val" type="number" title="Prahová teplota pro teplotní podmínku (°C)." value="${escHtml(r.temp_val)}" style="width:56px;padding:5px 6px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:13px"> °C
          <span style="font-size:12px">déle než</span>
          <input id="sch-days" type="number" min="1" max="30" title="Podmínka musí být splněna alespoň tento počet dní v kuse (průměr za posledních N dní)." value="${escHtml(r.temp_days)}" style="width:44px;padding:5px 6px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:13px"> <span style="font-size:12px">dní</span>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:var(--secondary-text-color)">Použít profil</label>
        <select id="sch-profile" title="Profil křivky který se aktivuje při splnění podmínky." style="width:100%;margin-top:4px;padding:5px 8px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:13px">
          ${options.map(p => `<option value="${escHtml(p)}" ${p===r.profile?"selected":""}>${escHtml(p)}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button id="sch-cancel" title="Zrušit bez uložení." style="flex:1;padding:7px;border-radius:7px;border:1px solid var(--divider-color);background:transparent;cursor:pointer;font-size:13px">Zrušit</button>
        <button id="sch-save" title="Uložit pravidlo časového plánu." style="flex:1;padding:7px;border-radius:7px;border:1px solid #1D9E75;background:rgba(29,158,117,.12);color:#0F6E56;cursor:pointer;font-size:13px;font-weight:500">Uložit</button>
      </div>`;

    overlay.appendChild(dialog);
    this.shadowRoot.appendChild(overlay);

    const typeEl = dialog.querySelector("#sch-type");
    typeEl.addEventListener("change", () => {
      dialog.querySelector("#sch-date-fields").style.display = typeEl.value === "date" ? "block" : "none";
      dialog.querySelector("#sch-temp-fields").style.display = typeEl.value === "temp" ? "block" : "none";
    });

    dialog.querySelector("#sch-cancel").onclick = () => overlay.remove();
    dialog.querySelector("#sch-save").onclick = () => {
      const rule = {
        id:         existingRule?.id || "",
        enabled:    existingRule?.enabled !== false,
        type:       dialog.querySelector("#sch-type").value,
        profile:    dialog.querySelector("#sch-profile").value,
        date_from:  dialog.querySelector("#sch-from")?.value || "",
        date_to:    dialog.querySelector("#sch-to")?.value   || "",
        temp_op:    dialog.querySelector("#sch-op")?.value   || "<",
        temp_val:   parseFloat(dialog.querySelector("#sch-val")?.value) || 5,
        temp_days:  parseInt(dialog.querySelector("#sch-days")?.value)  || 3,
      };
      this._hass.callService("heating_curve", "save_schedule", rule);
      overlay.remove();
      // Okamžité překreslení — nečekat na HA push
      this._optimisticSchedulePending = true;
      setTimeout(() => {
        this._renderSchedules(this._hass);
        this._optimisticSchedulePending = false;
      }, 300);
    };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Sezónní presety — vizuální stav ──────────────────────────────────────
  // ── Graf vnějších vlivů (-24h … +24h) ─────────────────────────────────────
  _updateInfChart(h) {
    if (!window.Chart) return;
    const wrap   = this.shadowRoot?.getElementById("inf-chart-wrap");
    const canvas = this.shadowRoot?.getElementById("inf-chart");
    if (!wrap || !canvas || !h) return;
    wrap.style.display = "block";

    const now   = Date.now();
    const H24   = 24 * 3600000;
    const lat   = h.config?.latitude  ?? 50.0;
    const lng   = h.config?.longitude ?? 14.0;

    // ── Číst z dedikovaného sensor.bms_influences_log ─────────────────────
    const logSt   = h.states["sensor.bms_influences_log"];
    const history = (logSt?.attributes?.history  || []);
    const fcRaw   = (logSt?.attributes?.forecast || []);

    // ── Sestavit pole bodů -24h až +24h, nyní vždy uprostřed ─────────────
    // Historické body: ts je v sekundách
    const histPts = history
      .map(e => ({ ...e, ts: e.ts * 1000, _hist: true }))
      .filter(e => e.ts >= now - H24 && e.ts <= now + 60000);

    // Bod "nyní" ze senzorů bms_actual_*
    const safeN = (eid, fb = null) => {
      const s = h.states[eid];
      if (!s || s.state === "unavailable" || s.state === "unknown") return fb;
      const v = parseFloat(s.state); return isNaN(v) ? fb : v;
    };
    const nowSun = this._sunPositionAt(now, lat, lng);
    const nowPt  = {
      ts:         now,
      out:        safeN("sensor.bms_raw_outdoor_temp") ?? safeN("sensor.bms_actual_temp"),
      act_wind:   safeN("sensor.bms_actual_wind"),
      act_rain:   safeN("sensor.bms_actual_rain"),
      act_hum:    safeN("sensor.bms_actual_humidity"),
      act_clouds: safeN("sensor.bms_actual_clouds"),
      result:     safeN("sensor.bms_calc_temp"),
      sun_el:     parseFloat(nowSun.el.toFixed(1)),
      _isNow:     true,
    };

    // Forecast body: filtrovat nyní → +24h, dopočítat slunce
    const fcPts = fcRaw
      .filter(f => {
        const ts = f.ts * 1000;
        return ts > now - 60000 && ts <= now + H24;
      })
      .map(f => {
        const tsMs  = f.ts * 1000;
        const sunP  = this._sunPositionAt(tsMs, lat, lng);
        return { ...f, ts: tsMs, sun_el: parseFloat(sunP.el.toFixed(1)), _isForecast: true };
      });

    // Sloučit: hist + nowPt + forecast; deduplikovat (< 10 min od sebe)
    const combined = [...histPts];
    const lastHist = histPts.length ? histPts[histPts.length - 1].ts : 0;
    if (now - lastHist > 10 * 60000) combined.push(nowPt);
    fcPts.forEach(fp => {
      if (!combined.some(p => Math.abs(p.ts - fp.ts) < 10 * 60000 && !p._isForecast))
        combined.push(fp);
    });
    const allPoints = combined.sort((a, b) => a.ts - b.ts);

    // ── No-data guard ─────────────────────────────────────────────────────
    let noDataMsg = wrap.querySelector(".no-data-msg");
    if (allPoints.length < 2) {
      canvas.style.display = "none";
      if (!noDataMsg) {
        noDataMsg = document.createElement("div");
        noDataMsg.className = "no-data-msg";
        noDataMsg.style.cssText = "padding:20px;text-align:center;font-size:12px;color:var(--secondary-text-color)";
        noDataMsg.textContent = logSt
          ? "Načítám data… (senzor bms_influences_log se inicializuje)"
          : "Senzor sensor.bms_influences_log není dostupný — zkontrolujte instalaci a restartujte HA.";
        wrap.querySelector("div > canvas")?.parentElement?.appendChild(noDataMsg)
          || wrap.appendChild(noDataMsg);
      }
      return;
    }
    noDataMsg?.remove();
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%";
    canvas.style.display = "block";
    if (this._infChart && !this._infChart.canvas?.isConnected) {
      this._infChart.destroy(); this._infChart = null; this._infChartHash = null;
    }

    // ── Labely osy X ─────────────────────────────────────────────────────
    const fmtRel = ts => {
      const dh = (ts - now) / 3600000;
      if (Math.abs(dh) < 0.25) return "nyní";
      return `${dh >= 0 ? "+" : ""}${Math.round(dh)} h`;
    };
    const fmtAbs = ts => {
      const d = new Date(ts);
      return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')} `
           + `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    };
    const labels    = allPoints.map(p => fmtRel(p.ts));
    const absLabels = allPoints.map(p => fmtAbs(p.ts));
    const fcStart   = allPoints.findIndex(p => p._isForecast);
    const nowIdx    = allPoints.findIndex(p => p._isNow || Math.abs(p.ts - now) < 5 * 60000);

    // ── Témování ─────────────────────────────────────────────────────────
    const isDark   = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const gridCol  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
    const tickCol  = isDark ? "rgba(255,255,255,0.5)"  : "rgba(0,0,0,0.55)";
    const ttBg     = isDark ? "rgba(20,22,32,0.96)"    : "rgba(255,255,255,0.97)";
    const ttBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
    const ttTitle  = isDark ? "#e8eaf6"                : "#1a1c2e";
    const ttBody   = isDark ? "rgba(255,255,255,0.7)"  : "rgba(0,0,0,0.65)";

    // ── Now-line + hover plugin ───────────────────────────────────────────
    const self_ = this;
    const nowLinePlugin = {
      id: "infNowLine",
      afterDraw(chart) {
        const { ctx, tooltip, chartArea: ca, scales: { x } } = chart;
        // Šedé pozadí pro forecast oblast
        if (fcStart > 0) {
          const _ratio = allPoints.length > 1 ? fcStart / (allPoints.length - 1) : 0;
          const nx = ca.left + _ratio * (ca.right - ca.left);
          ctx.save();
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.022)" : "rgba(0,0,0,0.022)";
          ctx.fillRect(nx, ca.top, ca.right - nx, ca.bottom - ca.top);
          ctx.restore();
        }
        // Svislá čára "nyní"
        const ni = nowIdx >= 0 ? nowIdx : (fcStart > 0 ? fcStart - 1 : -1);
        if (ni >= 0) {
          const _ratio2 = allPoints.length > 1 ? ni / (allPoints.length - 1) : 0;
          const nx2 = ca.left + _ratio2 * (ca.right - ca.left);
          ctx.save();
          ctx.strokeStyle = "rgba(55,138,221,0.55)";
          ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(nx2, ca.top); ctx.lineTo(nx2, ca.bottom); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(55,138,221,0.7)";
          ctx.font = "bold 9px inherit"; ctx.textAlign = "center";
          ctx.fillText("nyní", nx2, ca.top - 3);
          ctx.restore();
        }
        // Hover line
        if (tooltip?._active?.length) {
          const hx = tooltip._active[0].element.x;
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(hx, ca.top); ctx.lineTo(hx, ca.bottom); ctx.stroke();
          ctx.restore();
        }
      }
    };

    // ── Datové řady ───────────────────────────────────────────────────────
    if (!this._infChartHidden) this._infChartHidden = {};
    const SERIES = [
      { key: "act_wind",   label: "Vítr (km/h)",      color: "#378ADD", yAxis: "yWind", unit: "km/h" },
      { key: "act_rain",   label: "Srážky (mm/h)",    color: "#5BA4E5", yAxis: "yRain", unit: "mm/h" },
      { key: "act_hum",    label: "Vlhkost (%)",       color: "#26A6BF", yAxis: "yPct",  unit: "%" },
      { key: "act_clouds", label: "Oblačnost (%)",     color: "#8A9BB0", yAxis: "yPct",  unit: "%" },
      { key: "sun_el",     label: "Slunce – el. (°)",  color: "#EF9F27", yAxis: "yDeg",  unit: "°" },
      { key: "out",        label: "Venkovní (°C)",     color: "#ef5350", yAxis: "yTemp", unit: "°C" },
      { key: "result",     label: "Topení (°C)",       color: "#1D9E75", yAxis: "yTemp", unit: "°C" },
    ];

    const datasets = SERIES.map(s => ({
      label:           s.label,
      data:            allPoints.map(p => (p[s.key] !== undefined && p[s.key] !== null) ? p[s.key] : null),
      borderColor:     s.color,
      backgroundColor: s.color + "18",
      borderWidth:     s.yAxis === "yTemp" ? 2 : 1.5,
      pointRadius:     allPoints.map(p => p._isNow ? 4 : (p._isForecast ? 1.5 : 2.5)),
      pointHoverRadius: 5,
      tension:         0.3,
      yAxisID:         s.yAxis,
      hidden:          this._infChartHidden[s.label] || false,
      fill:            false,
      spanGaps:        true,
      segment:         fcStart > 0 ? {
        borderDash: ctx => ctx.p0DataIndex >= fcStart ? [4, 3] : [],
      } : undefined,
      _unit: s.unit,
    }));

    // ── Hash guard ────────────────────────────────────────────────────────
    const hash = allPoints.map(p => `${Math.round(p.ts/60000)}:${p.out ?? ''}`).join(",");
    if (this._infChart) {
      if (hash === this._infChartHash) return;
      this._infChartHash = hash;
      this._infChart.data.labels = labels;
      this._infChart.data.datasets.forEach((ds, i) => {
        if (datasets[i]) {
          ds.data        = datasets[i].data;
          ds.pointRadius = datasets[i].pointRadius;
          ds.segment     = datasets[i].segment;
        }
      });
      this._infChart.update("none");
      return;
    }
    this._infChartHash = hash;

    // ── Inicializace grafu ────────────────────────────────────────────────
    this._infChart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 14 } },
        plugins: {
          legend: {
            position: "top", align: "start",
            labels: {
              boxWidth: 24, boxHeight: 2,
              font: { size: 11, family: "inherit" },
              padding: 12,
              color: isDark ? "#dde2f0" : "#22223a",
              usePointStyle: false,
            },
            // Přímá manipulace s meta.hidden — nejspolehlivější způsob
            onClick: (_evt, item, legend) => {
              const chart = legend.chart;
              const meta  = chart.getDatasetMeta(item.datasetIndex);
              meta.hidden = !meta.hidden;
              if (!this._infChartHidden) this._infChartHidden = {};
              this._infChartHidden[item.text] = meta.hidden;
              chart.update();
            },
          },
          tooltip: {
            enabled: true,
            backgroundColor: ttBg, borderColor: ttBorder, borderWidth: 1,
            titleColor: ttTitle, bodyColor: ttBody,
            padding: { top: 8, bottom: 8, left: 12, right: 14 },
            titleFont: { size: 12, weight: "600" },
            bodyFont: { size: 11 },
            callbacks: {
              title: items => {
                const idx = items[0].dataIndex;
                const p   = allPoints[idx];
                const tag = p?._isForecast ? "🔮 " : p?._isNow ? "● " : "📊 ";
                return `${tag}${absLabels[idx]}  (${items[0].label})`;
              },
              label: ctx => {
                const v = ctx.parsed.y;
                if (v === null || v === undefined) return null;
                const isTemp = ctx.dataset.yAxisID === "yTemp";
                const sign   = (!isTemp && v > 0) ? "+" : "";
                const val    = Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v);
                return ` ${ctx.dataset.label.replace(/ \(.*\)/, "")}: ${sign}${val} ${ctx.dataset._unit || ""}`;
              },
            },
          },
        },
        scales: {
          x:     { ticks: { font: { size: 10 }, color: tickCol, maxRotation: 40, autoSkip: true, maxTicksLimit: 12 }, grid: { color: gridCol } },
          yPct:  { position: "left",  min: 0, max: 100, title: { display: true, text: "%",     font: { size: 9 }, color: tickCol }, ticks: { font: { size: 9 }, color: tickCol }, grid: { color: gridCol } },
          yWind: { position: "left",  display: "auto",  title: { display: true, text: "km/h",  font: { size: 9 }, color: tickCol }, ticks: { font: { size: 9 }, color: tickCol }, grid: { drawOnChartArea: false } },
          yRain: { position: "left",  display: "auto", min: 0, title: { display: true, text: "mm/h", font: { size: 9 }, color: tickCol }, ticks: { font: { size: 9 }, color: tickCol }, grid: { drawOnChartArea: false } },
          yDeg:  { position: "right", display: "auto", min: -10, max: 90, title: { display: true, text: "° el.", font: { size: 9 }, color: tickCol }, ticks: { font: { size: 9 }, color: tickCol }, grid: { drawOnChartArea: false } },
          yTemp: { position: "right", title: { display: true, text: "°C", font: { size: 9 }, color: tickCol }, ticks: { font: { size: 9 }, color: tickCol }, grid: { drawOnChartArea: false } },
        },
      },
      plugins: [nowLinePlugin],
    });
  }


















  _updateSeasonPresets(h) {
    const sr = this.shadowRoot;
    if (!h) return;
    const profState  = h.states["select.bms_profil_krivky"];
    const activeProf = profState ? profState.state : "Výchozí";
    // Starred seznam z atributů nebo fallback na sezónní
    const calcSt  = h.states["sensor.bms_calc_temp"];
    // Hvězdičky jsou uloženy v profiles store — přístup přes HA event bus není přímý,
    // takže karta čte seznam ze speciálního atributu který přidáme do calc_temp
    // Fallback: použij sezónní profily
    const starred = this._optimisticStarred
      || (calcSt?.attributes?.starred_profiles)
      || ["Zima", "Jaro/Podzim", "Léto"];
    const profOptions = profState?.attributes?.options || ["Výchozí"];

    const PER_PAGE = 8;
    const totalPages = Math.max(1, Math.ceil(starred.length / PER_PAGE));
    this._starredPage = Math.min(this._starredPage, totalPages - 1);
    const page = starred.slice(this._starredPage * PER_PAGE, (this._starredPage + 1) * PER_PAGE);

    const container = sr.getElementById("starred-presets");
    const pager     = sr.getElementById("starred-pager");
    const pageLbl   = sr.getElementById("starred-page-lbl");
    if (!container) return;

    container.innerHTML = "";
    if (starred.length === 0) {
      container.innerHTML = `<span style="font-size:12px;color:var(--secondary-text-color)">Žádné hvězdičkové profily — označte profil hvězdičkou v sekci Profily křivky.</span>`;
    }

    page.forEach(name => {
      const exists   = profOptions.includes(name) || name === "Výchozí";
      const isActive = activeProf === name;
      const btn = document.createElement("button");
      btn.className = "season-btn" + (isActive ? " active" : "");
      btn.style.cssText = "flex:0 1 calc(25% - 6px);min-width:70px";
      btn.disabled = !exists;
      btn.style.opacity = exists ? "1" : "0.4";
      btn.title = isActive ? `Profil "${name}" je aktivní` : (exists ? `Načíst profil "${name}"` : `Profil "${name}" neexistuje`);
      btn.innerHTML = `<span style="font-size:13px">${isActive ? "✓" : "📋"}</span><span class="season-lbl" style="font-size:11px;margin-top:2px;color:${isActive ? "#0F6E56" : ""}">${escHtml(name)}</span>`;
      btn.addEventListener("click", () => {
        if (!exists || !this._hass) return;
        this._hass.callService("heating_curve", "load_profile", { name });
        this._hass.callService("select", "select_option", { entity_id: "select.bms_profil_krivky", option: name });
        const sel = sr.getElementById("prof-select");
        if (sel) sel.value = name;
        this._showToast(`Načten profil "${name}"`, "season");
      });
      container.appendChild(btn);
    });

    if (pager && pageLbl) {
      pager.style.display = totalPages > 1 ? "flex" : "none";
      pageLbl.textContent = `${this._starredPage + 1} / ${totalPages}`;
    }
  }

  // ── Timestamp ─────────────────────────────────────────────────────────────
  _updateTimestamp(h) {
    const el = this.shadowRoot?.getElementById("calc-timestamp");
    if (!el || !h) return;
    const log = h.states["sensor.bms_calc_temp"]?.attributes?.calc_log || [];
    if (log.length > 0) {
      el.textContent = `Vypočteno ${log[0].time}`;
      el.setAttribute("aria-label", `Poslední výpočet v ${log[0].time}`);
    }
  }

  // ── Storage status banner ──────────────────────────────────────────────────
  _updateStorageBanner() {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;
    const status = h.states["sensor.bms_curve_storage_status"];
    let banner = sr.getElementById("storage-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "storage-banner";
      banner.style.cssText = "display:none;margin-bottom:10px;padding:8px 12px;border-radius:6px;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px";
      const secTitle = sr.querySelector(".sec-title");
      if (secTitle) secTitle.parentNode.insertBefore(banner, secTitle);
    }
    if (!status || status.state === "OK") {
      banner.style.display = "none";
      return;
    }
    if (status.state === "FALLBACK") {
      banner.style.cssText = banner.style.cssText.replace(/background:[^;]+/, "");
      banner.style.background = "rgba(239,159,39,.14)";
      banner.style.color = "#EF9F27";
      banner.style.border = "1px solid rgba(239,159,39,.3)";
      const pts = status.attributes?.point_count ?? "?";
      banner.innerHTML = `
        <span>⚠ Storage nedostupné — body křivky jsou v paměti (${pts} bodů, nepřežijí restart)</span>
        <button style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid #EF9F27;background:transparent;color:#EF9F27;cursor:pointer" id="btn-retry-storage" title="Pokusit se znovu zapsat body křivky do trvalého úložiště po opravě chyby.">Zkusit znovu</button>`;
      const btn = sr.getElementById("btn-retry-storage");
      if (btn) btn.onclick = () => this._hass.callService("heating_curve", "retry_storage", {});
    } else {
      banner.style.background = "rgba(226,75,74,.14)";
      banner.style.color = "#E24B4A";
      banner.style.border = "1px solid rgba(226,75,74,.3)";
      banner.innerHTML = `<span>✕ Storage chyba — body křivky nejsou dostupné</span>`;
    }
    banner.style.display = "flex";
  }

  // ── Temp source banner ────────────────────────────────────────────────────
  _updateTempSourceBanner() {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;

    const srcSensor = h.states["sensor.bms_temp_source"];
    let banner = sr.getElementById("temp-source-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "temp-source-banner";
      banner.style.cssText = "display:none;margin-bottom:10px;padding:8px 12px;border-radius:6px;font-size:12px;align-items:center;gap:8px";
      const metrics = sr.querySelector(".metrics");
      if (metrics) metrics.parentNode.insertBefore(banner, metrics);
    }

    if (!srcSensor || !srcSensor.attributes?.is_fallback) {
      banner.style.display = "none";
      return;
    }

    const sourceKey = srcSensor.attributes?.source_key;
    const safeTemp  = srcSensor.attributes?.safe_temp ?? 0;

    if (sourceKey === "weather") {
      banner.style.background = "rgba(239,159,39,.12)";
      banner.style.color      = "#EF9F27";
      banner.style.border     = "1px solid rgba(239,159,39,.25)";
      banner.innerHTML = `<span>⚠ Venkovní senzor nedostupný — teplota z weather entity</span>`;
    } else {
      banner.style.background = "rgba(226,75,74,.12)";
      banner.style.color      = "#E24B4A";
      banner.style.border     = "1px solid rgba(226,75,74,.25)";
      banner.innerHTML = `<span>✕ Venkovní senzor ani weather entita nejsou dostupné — používám bezpečnou teplotu ${safeTemp} °C</span>`;
    }
    banner.style.display = "flex";
  }

  // ── Časová osa pod SVG slunce ─────────────────────────────────────────────
  _updateTimeAxis() {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;

    const now    = new Date();
    const hours  = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    // Lineární mapování 0–24h → 0–360px
    const h2x    = t => (t / 24) * 360;
    const nowX   = h2x(hours);
    const nowStr = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });

    // Čas východu a západu z sun.sun atributů
    const sunState  = h.states["sun.sun"];
    let riseH = 6, setH = 18; // výchozí hodnoty
    if (sunState) {
      const riseIso = sunState.attributes?.next_rising;
      const setIso  = sunState.attributes?.next_setting;
      if (riseIso) {
        const rd = new Date(riseIso);
        // next_rising může být zítřejší — vezmeme jen čas
        riseH = rd.getHours() + rd.getMinutes() / 60;
        // Pokud je next_rising za víc než 12h, je to zítřejší → odečteme 24h
        if (riseH > hours + 12) riseH -= 24;
        if (riseH < 0) riseH += 24;
      }
      if (setIso) {
        const sd = new Date(setIso);
        setH = sd.getHours() + sd.getMinutes() / 60;
        if (setH > hours + 12) setH -= 24;
        if (setH < 0) setH += 24;
      }
    }

    const riseX = h2x(riseH);
    const setX  = h2x(setH);

    const setA = (id, attrs) => {
      const el = sr.getElementById(id);
      if (el) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    };

    // Denní světlo — oranžový pruh od východu do západu
    if (riseX < setX) {
      setA("time-day", { x: riseX.toFixed(1), width: (setX - riseX).toFixed(1) });
    } else {
      setA("time-day", { x: "0", width: "0" });
    }

    // Noční oblasti
    setA("time-night-am", { x: "0",              width: Math.max(0, riseX).toFixed(1) });
    setA("time-night-pm", { x: setX.toFixed(1),  width: Math.max(0, 360 - setX).toFixed(1) });

    // Aktuální čas — čára + popisek
    const clampedX  = Math.max(10, Math.min(nowX, 350));
    const anchor    = nowX < 20 ? "start" : nowX > 340 ? "end" : "middle";
    setA("time-now-line", { x1: nowX.toFixed(1), x2: nowX.toFixed(1) });
    setA("time-now-lbl",  { x: clampedX.toFixed(1), "text-anchor": anchor });
    const lblEl = sr.getElementById("time-now-lbl");
    if (lblEl) lblEl.textContent = nowStr;
  }

  /**
   * Výpočet azimutu a elevace slunce pro daný čas a GPS pozici.
   * Vrací { az, el } ve stupních.
   */
  _sunPositionAt(date, lat, lng) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;

    // Juliánský den
    const JD = date / 86400000 + 2440587.5;
    const n  = JD - 2451545.0;

    // Střední délka a anomálie
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = toRad((357.528 + 0.9856003 * n) % 360);

    // Ekliptická délka
    const lambda = toRad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));

    // Deklinace a rektascenze
    const eps   = toRad(23.439 - 0.0000004 * n);
    const sinDec = Math.sin(eps) * Math.sin(lambda);
    const dec   = Math.asin(sinDec);

    // Sideretický čas → hodinový úhel
    const UT   = (date % 86400000) / 3600000; // hodiny UTC
    const GMST = (6.697375 + 0.0657098242 * n + UT) % 24;
    const LMST = (GMST + lng / 15) % 24;
    const RA   = toDeg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))) / 15;
    const HA   = toRad((LMST - ((RA % 24) + 24) % 24) * 15);

    const latR = toRad(lat);

    // Elevace
    const sinEl = Math.sin(latR) * sinDec + Math.cos(latR) * Math.cos(dec) * Math.cos(HA);
    const el    = toDeg(Math.asin(Math.max(-1, Math.min(1, sinEl))));

    // Azimut (navigační, 0=S)
    const cosAz = (sinDec - Math.sin(latR) * sinEl) / (Math.cos(latR) * Math.cos(toRad(el)));
    let az = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
    if (Math.sin(HA) > 0) az = 360 - az;

    return { az: Math.round(az), el: Math.round(el) };
  }

  // ── SVG vizualizace dráhy slunce ─────────────────────────────────────────

  /**
   * Výpočet sluneční deklinace pro daný den v roce.
   * Vrací deklinaci ve stupních.
   */
  _sunDeclination(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff  = date - start;
    const dayOfYear = Math.floor(diff / 86400000);
    // Přibližná deklinace dle Cooperovy rovnice
    return 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);
  }

  /**
   * Přesný azimut východu/západu slunce z GPS souřadnic.
   * Navigační azimut: 0=S, 90=V, 180=J, 270=Z.
   * Vzorec: cos(Az_rise) = sin(decl) / cos(lat)
   * Léto (decl>0, CZ): cosAz>0 → Az<90° → SV kvadrant ✓
   * Zima (decl<0, CZ): cosAz<0 → Az>90° → JV kvadrant ✓
   * Západ je zrcadlově: setAz = 360 - riseAz
   */
  _sunRiseSetAzimuth(lat) {
    const decl  = this._sunDeclination(new Date());
    const latR  = lat * Math.PI / 180;
    const declR = decl * Math.PI / 180;
    const cosAz = Math.sin(declR) / Math.cos(latR);
    if (Math.abs(cosAz) > 1) {
      return cosAz > 0
        ? { riseAz: 0,   setAz: 0,   polarDay: true }
        : { riseAz: 180, setAz: 180, polarNight: true };
    }
    const azOffset = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
    return {
      riseAz: Math.round(azOffset),       // V nebo JV kvadrant (< 180°)
      setAz:  Math.round(360 - azOffset), // Z nebo JZ kvadrant (> 180°)
    };
  }

  _updateSunArc() {
    const sr = this.shadowRoot;
    const h  = this._hass;
    if (!h) return;

    const sunState = h.states["sun.sun"];
    const fcOn     = sw(h, "switch.bms_pouziti_predpovedi");

    // Číst přímo z dedikovaných diag senzorů
    const actElSt = h.states["sensor.bms_actual_sun_elevation"];
    const actAzSt = h.states["sensor.bms_actual_sun_azimuth"];
    const fcElSt  = h.states["sensor.bms_forecast_sun_elevation"];
    const fcAzSt  = h.states["sensor.bms_forecast_sun_azimuth"];

    const actEl = (actElSt && actElSt.state !== "unavailable" && actElSt.state !== "None")
      ? parseFloat(actElSt.state) : num(h, "sensor.bms_sun_elevation", 0);
    const actAz = (actAzSt && actAzSt.state !== "unavailable" && actAzSt.state !== "None")
      ? parseFloat(actAzSt.state) : num(h, "sensor.bms_sun_azimuth", 0);

    // Forecast — fallback na JS výpočet
    let fcEl = (fcElSt && fcElSt.state !== "unavailable" && fcElSt.state !== "None")
      ? parseFloat(fcElSt.state) : null;
    let fcAz = (fcAzSt && fcAzSt.state !== "unavailable" && fcAzSt.state !== "None")
      ? parseFloat(fcAzSt.state) : null;
    if (fcEl === null) {
      const fcHours = num(h, "number.bms_predpoved_hodin", 24);
      const lat2 = h.config?.latitude  ?? 50.0;
      const lng2 = h.config?.longitude ?? 14.0;
      const p = this._sunPositionAt(Date.now() + fcHours * 3600000, lat2, lng2);
      fcEl = p.el; fcAz = p.az;
    }

    // curAz/curEl = applied (ta která vstupuje do výpočtu)
    const curAz = fcOn ? fcAz : actAz;
    const curEl = fcOn ? fcEl : actEl;

    const sunFrom  = num(h, "number.bms_solarni_start", 140);
    const sunTo    = num(h, "number.bms_solarni_konec", 220);

    // GPS ze systémového nastavení HA
    const lat = h.config?.latitude  ?? 50.0;
    const lng = h.config?.longitude ?? 14.0;

    // SVG viewport: 360 × 110, obzor na Y=80, vrchol oblouku na Y=8
    const W = 360, HORIZON = 80, APEX = 8;

    // Azimut → X (lineární 0–360 → 0–360)
    const az2x = az => ((az % 360 + 360) % 360);

    // Přesný výpočet výšky dráhy slunce:
    // Elevace = arcsin(sin(lat)*sin(decl) + cos(lat)*cos(decl)*cos(hodinový_úhel))
    // Aproximujeme: výška je symetrická kolem jihu (180°), s amplitudou závisející na deklinaci+lat
    const decl    = this._sunDeclination(new Date());
    const latR    = lat * Math.PI / 180;
    const declR   = decl * Math.PI / 180;
    const maxEl   = Math.asin(
      Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR)
    ) * 180 / Math.PI; // max elevace (kulminace na jihu)

    const arcY = az => {
      // Hodinový úhel z azimutu — aproximace pro body na dráze
      const azR = (az - 180) * Math.PI / 180;
      // sin(elevace) ≈ sin(lat)*sin(decl) + cos(lat)*cos(decl)*cos(HA)
      // HA ≈ (az - 180) * faktor
      const coeff = Math.cos(latR) * Math.cos(declR);
      const base  = Math.sin(latR) * Math.sin(declR);
      const el    = Math.asin(
        Math.max(-1, Math.min(1, base + coeff * Math.cos(azR)))
      ) * 180 / Math.PI;
      if (el <= 0) return HORIZON;
      // Mapování elevace na Y: max elevace → APEX, 0° → HORIZON
      return HORIZON - (el / Math.max(maxEl, 1)) * (HORIZON - APEX);
    };

    // Přesný azimut východu a západu z GPS
    const { riseAz, setAz } = this._sunRiseSetAzimuth(lat);

    // ── Dráha slunce ──────────────────────────────────────────────────────
    // Jdeme od azimutu východu přes jih (180°) až k azimutu západu
    let arcPath = "";
    // Pod-obzorová část (přerušovaně, jen informativně) — přeskočíme
    // Nad-obzorová část: od riseAz do setAz přes 180°
    const rAz = riseAz <= setAz ? riseAz : riseAz - 360;
    for (let a = rAz; a <= setAz; a += 3) {
      const x = az2x(a), y = arcY(a);
      arcPath += arcPath === "" ? `M${x.toFixed(1)},${y.toFixed(1)}`
                                : ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    // Zajistíme přesný koncový bod
    arcPath += ` L${az2x(setAz).toFixed(1)},${HORIZON}`;

    const pathEl = sr.getElementById("sun-arc-path");
    if (pathEl) pathEl.setAttribute("d", arcPath);

    // Helper: elevace → Y pozice v SVG (přímé mapování bez aproximace přes azimut)
    const elToY = el => el > 0
      ? HORIZON - (el / Math.max(maxEl, 1)) * (HORIZON - APEX)
      : HORIZON + 3;

    // ── Aktivní okno ──────────────────────────────────────────────────────
    const loX = az2x(sunFrom), hiX = az2x(sunTo);
    let activePath = `M${loX},${HORIZON}`;
    for (let a = sunFrom; a <= sunTo; a += 2) {
      const x = az2x(a), y = arcY(a);
      activePath += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    activePath += ` L${hiX},${HORIZON} Z`;
    const activeEl = sr.getElementById("sun-arc-active");
    if (activeEl) activeEl.setAttribute("d", activePath);

    // ── Svislé čáry hranic okna ───────────────────────────────────────────
    const setAttr = (id, attrs) => {
      const el = sr.getElementById(id);
      if (el) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    };
    setAttr("sun-line-lo", { x1: loX, x2: loX, y1: arcY(sunFrom).toFixed(1), y2: HORIZON });
    setAttr("sun-line-hi", { x1: hiX, x2: hiX, y1: arcY(sunTo).toFixed(1),   y2: HORIZON });

    // ── Aktuální pozice slunce ────────────────────────────────────────────
    // Vždy zobrazit aktuální polohu — zvýrazněná pokud není aktivní předpověď
    const actCx = az2x(actAz).toFixed(1);
    const actCy = elToY(actEl).toFixed(1);
    setAttr("sun-dot", {
      cx: actCx, cy: actCy,
      fill: actEl > 0
        ? (fcOn ? "rgba(239,159,39,0.3)" : "#EF9F27")
        : "rgba(128,128,128,0.25)",
      r: actEl > 0 ? (fcOn ? "4" : "6") : "3",
      stroke: actEl > 0 && !fcOn ? "rgba(0,0,0,0.15)" : "none",
      "stroke-width": "1",
    });
    setAttr("sun-dot-lbl", { x: actCx, y: (Math.max(10, parseFloat(actCy) - 7)).toFixed(1),
      fill: fcOn ? "rgba(239,159,39,0.5)" : "#EF9F27",
      "font-weight": fcOn ? "400" : "500" });
    const dotLbl = sr.getElementById("sun-dot-lbl");
    if (dotLbl) dotLbl.textContent = actEl > 0 ? `${actAz.toFixed(0)}°/${actEl.toFixed(0)}°` : "";

    // ── Forecast pozice slunce — zobrazit vždy ────────────────────────────
    // Zvýrazněná pokud je předpověď aktivní
    const useFc    = fcOn;
    const fcDotEl  = sr.getElementById("sun-fc-dot");
    const fcLblEl  = sr.getElementById("sun-fc-lbl");

    if (fcDotEl && fcLblEl) {
      const fcHours   = num(h, "number.bms_predpoved_hodin", 24);
      const fcDate    = new Date(Date.now() + fcHours * 3600000);
      const fcTimeStr = fcDate.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
      const fcCx      = az2x(fcAz).toFixed(1);
      const fcCy      = elToY(fcEl).toFixed(1);

      setAttr("sun-fc-dot", {
        cx: fcCx, cy: fcCy,
        r:  fcEl > 0 ? (useFc ? "6" : "4") : "3",
        fill: fcEl > 0
          ? (useFc ? "rgba(239,159,39,0.5)" : "rgba(239,159,39,0.18)")
          : "rgba(128,128,128,0.15)",
        stroke: fcEl > 0
          ? (useFc ? "rgba(239,159,39,0.9)" : "rgba(239,159,39,0.4)")
          : "none",
        "stroke-width": "1.5",
        "stroke-dasharray": "2,1.5",
      });

      const fcLblY = Math.max(10, parseFloat(fcCy) - 8).toFixed(1);
      setAttr("sun-fc-lbl", {
        x: fcCx, y: fcLblY,
        fill: useFc ? "rgba(239,159,39,0.9)" : "rgba(239,159,39,0.45)",
        "font-weight": useFc ? "500" : "400",
      });
      if (fcEl > 0) {
        fcLblEl.textContent = useFc
          ? `${fcTimeStr} ${fcAz.toFixed(0)}°/${fcEl.toFixed(0)}°`
          : `${fcAz.toFixed(0)}°/${fcEl.toFixed(0)}°`;
      } else {
        fcLblEl.textContent = "";
      }
    }

    // ── Časy a azimuty východu / západu ──────────────────────────────────
    if (sunState) {
      const riseIso = sunState.attributes?.next_rising;
      const setIso  = sunState.attributes?.next_setting;
      const fmt = iso => iso
        ? new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
        : null;
      const riseTime = fmt(riseIso);
      const setTime  = fmt(setIso);

      const placeMarker = (lineId, lblId, az, time, azDeg, icon, color) => {
        const x = az2x(az);
        // Čára od obzoru dolů (do "půdy")
        setAttr(lineId, { x1: x, x2: x, y1: HORIZON, y2: HORIZON + 8, stroke: color, "stroke-width": "1.5" });
        const lblEl = sr.getElementById(lblId);
        if (lblEl) {
          // Popisek pod obzorem — dvouřádkový efekt přes tspan není v plain SVG text snadný,
          // použijeme kompaktní jednořádkový formát
          const clampedX = Math.max(18, Math.min(x, 342)); // nepřetékáme přes okraj
          const anchor = x < 25 ? "start" : x > 335 ? "end" : "middle";
          Object.entries({
            x: clampedX.toFixed(1),
            y: (HORIZON + 18).toFixed(1),
            "text-anchor": anchor,
            fill: color,
            "font-size": "7.5",
          }).forEach(([k, v]) => lblEl.setAttribute(k, v));
          lblEl.textContent = `${icon} ${time} · ${azDeg}°`;
        }
      };

      // Správné přiřazení: západ má větší azimut (> 180°), východ menší (< 180°)
      if (riseTime) placeMarker("sun-rise-line", "sun-rise-lbl", riseAz, riseTime, riseAz, "↑", "#4caf50");
      if (setTime)  placeMarker("sun-set-line",  "sun-set-lbl",  setAz,  setTime,  setAz,  "↓", "#ef5350");

    }

    // viewBox je fixní v HTML — meet zajistí správné proporce bez deformace textu
  }

  // ── Načtení bodů z HA (Storage sensor attrs nebo fallback entity) ───────────
  _getCurveNodes() {
    // Pokud editujeme, použij lokální kopii (blokuj přepis z HA)
    if (this._editingCurve && this._localNodes) {
      return this._localNodes;
    }

    const h = this._hass;
    if (!h) return [];

    // Primárně: atributy storage senzoru
    const storageSensor = h.states["sensor.bms_curve_storage_status"];
    if (storageSensor && storageSensor.attributes?.points?.length >= 2) {
      try {
        const haNodes = storageSensor.attributes.points
          .map(p => [parseFloat(p.x), parseFloat(p.y)])
          .filter(([x, y]) => !isNaN(x) && !isNaN(y))
          .sort((a, b) => a[0] - b[0]);

        // Zkontroluj zda HA potvrdilo čekající počet bodů
        if (this._pendingPointCount !== null && haNodes.length === this._pendingPointCount) {
          this._pendingPointCount = null;
          this._editingCurve = false;
          this._localNodes = null;
          this._updateSaveBtn();
        }

        return haNodes;
      } catch (_) {}
    }

    // Fallback: storage senzor není dostupný — vrátit výchozí body křivky
    // (number.bms_bod_N_x/y entity neexistují — byly odstraněny)
    const defaultPoints = [
      [-20, 70], [-10, 57], [0, 45], [10, 33], [20, 20]
    ];
    return defaultPoints;
  }

  // ── Editor bodů křivky (dynamický počet) ────────────────────────────────────
  _renderCurveEditor(nodes, totalCorr, tMin, tMax) {
    const sr = this.shadowRoot;
    const tbody = sr.getElementById("curve-tbody");
    if (!tbody) return;

    // Neprepisovat DOM pokud uživatel právě edituje — spolehlivé event-based hlídání
    if (this._curveEditorFocused) return;

    // Hlavička — + Bod tlačítko jen jednou
    const thead = sr.querySelector(".curve-table thead tr");
    if (thead && !sr.getElementById("btn-add-point")) {
      const thAct = document.createElement("th");
      thAct.innerHTML = `<button id="btn-add-point" title="Přidat nový bod na konec křivky. Nový bod bude o 5° vpravo a o 5 °C níže než poslední existující bod." style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid #378ADD;color:#185FA5;background:transparent;cursor:pointer">+ Bod</button>`;
      thead.appendChild(thAct);
      sr.getElementById("btn-add-point").onclick = () => this._addCurvePoint();
    }

    tbody.innerHTML = nodes.map(([x, y], idx) => {
      const wm = parseFloat((y + totalCorr).toFixed(1));
      const cl = parseFloat(Math.min(tMax, Math.max(tMin, wm)).toFixed(1));
      const clClass = Math.abs(cl - wm) > 0.01 ? "clamped-bad" : "clamped-ok";
      const canDel = nodes.length > 2;
      return `<tr>
        <td><input class="sens-inp" type="number" value="${x}" step="1"
            style="width:54px" data-idx="${idx}" data-key="x"
            title="Venkovní teplota pro tento bod křivky (°C)."
            onchange="this.getRootNode().host._onPointEdit(event)"></td>
        <td><input class="sens-inp" type="number" value="${y.toFixed(1)}" step="0.5"
            style="width:54px" data-idx="${idx}" data-key="y"
            title="Cílová teplota topné vody při dané venkovní teplotě (°C). Ořízne se na bezpečnostní limity."
            onchange="this.getRootNode().host._onPointEdit(event)"></td>
        <td class="mod" title="Teplota topení po přičtení celkové korekce (${totalCorr >= 0 ? "+" : ""}${totalCorr.toFixed(1)} °C): ${wm.toFixed(1)} °C">${wm.toFixed(1)}</td>
        <td class="${clClass}" title="${Math.abs(cl - wm) > 0.01 ? 'Oříznutá limitem na ' + cl.toFixed(1) + ' °C (bez limitu: ' + wm.toFixed(1) + ' °C)' : 'V mezích limitů (' + tMin + '\u2013' + tMax + ' °C)'}">${cl.toFixed(1)}</td>
        <td>${canDel ? `<button onclick="this.getRootNode().host._removeCurvePointAt(${idx})"
            style="font-size:12px;padding:4px 8px;border-radius:4px;min-width:32px;min-height:32px;border:1px solid #E24B4A;color:#A32D2D;background:transparent;cursor:pointer" title="Odebrat tento bod z křivky. Minimum jsou 2 body.">×</button>` : ''}</td>
      </tr>`;
    }).join("");
  }

  _onPointEdit(e) {
    const idx = parseInt(e.target.dataset.idx);
    const key = e.target.dataset.key;
    let val = parseFloat(e.target.value);
    if (isNaN(val)) return;

    if (key === "y") {
      const tMin = num(this._hass, "number.bms_limit_min", 10);
      const tMax = num(this._hass, "number.bms_limit_max", 90);
      const clamped = Math.min(tMax, Math.max(tMin, val));
      if (clamped !== val) { val = clamped; e.target.value = val; }
    }

    const nodes = this._getCurveNodes();
    if (idx >= nodes.length) return;
    const updated = nodes.map(n => [...n]);
    if (key === "x") updated[idx][0] = val;
    else              updated[idx][1] = val;
    this._setLocalNodes(updated);
    this._updateChart();
    // Auto-save: okamžitě odeslat do HA bez čekání na uživatelské potvrzení
    this._pushCurveToHA(this._localNodes);
  }

  _addCurvePoint() {
    const nodes = this._getCurveNodes();
    const base = nodes.length ? nodes : [[-20, 70], [20, 20]];
    const last = base[base.length - 1];
    const updated = [...base, [last[0] + 5, Math.max(10, last[1] - 5)]];
    this._setLocalNodes(updated);
    this._updateChart();
    this._pushCurveToHA(this._localNodes);
  }

  _removeCurvePointAt(idx) {
    const nodes = this._getCurveNodes();
    if (nodes.length <= 2) return;
    const updated = nodes.filter((_, i) => i !== idx);
    this._setLocalNodes(updated);
    this._updateChart();
    this._pushCurveToHA(this._localNodes);
  }

  _updateSaveBtn() {
    const sr = this.shadowRoot;
    const bar = sr.getElementById("curve-save-bar");
    const status = sr.getElementById("curve-save-status");
    if (!bar) return;

    if (this._pendingPointCount !== null) {
      // Aktivní síťový požadavek — zobraz "Ukládám…"
      bar.style.display = "flex";
      bar.style.background = "rgba(55,138,221,0.07)";
      bar.style.borderColor = "rgba(55,138,221,0.15)";
      if (status) { status.textContent = "Ukládám křivku…"; status.style.color = "#185FA5"; }
    } else if (!this._editingCurve) {
      // Potvrzeno z HA — zobraz "Uloženo ✓" a skryj po 2s
      bar.style.display = "flex";
      bar.style.background = "rgba(29,158,117,0.10)";
      bar.style.borderColor = "rgba(29,158,117,0.2)";
      if (status) { status.textContent = "✓ Křivka uložena"; status.style.color = "#0F6E56"; }
      setTimeout(() => { bar.style.display = "none"; }, 2000);
    } else {
      // editingCurve=true ale žádný pending request — skrýt
      bar.style.display = "none";
    }
  }

  _setLocalNodes(nodes) {
    this._localNodes = [...nodes].sort((a, b) => a[0] - b[0]);
    this._editingCurve = true;
  }

  _pushCurveToHA(nodes) {
    const points = nodes.map(n => Array.isArray(n) ? {x: n[0], y: n[1]} : n);
    points.sort((a, b) => a.x - b.x);
    // Lokální kopii udržujeme — editingCurve zůstane true dokud HA nepotvrdí
    // nová data přes sensor.bms_curve_storage_status atribut
    this._setLocalNodes(points.map(p => [p.x, p.y]));
    this._pendingPointCount = points.length; // čekáme na potvrzení tohoto počtu
    this._hass.callService("heating_curve", "set_curve_points", { points });
    this._updateChart();
    this._updateSaveBtn();
  }

  _chartDebug(msg) {
    const wrap = this.shadowRoot?.querySelector(".chart-wrap");
    if (!wrap) return;
    let dbg = wrap.querySelector(".chart-dbg");
    if (!msg) { if (dbg) dbg.remove(); return; }
    if (!dbg) {
      dbg = document.createElement("div");
      dbg.className = "chart-dbg";
      dbg.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--secondary-text-color);background:rgba(var(--rgb-primary-text-color,0,0,0),.03);border-radius:4px;pointer-events:none";
      wrap.appendChild(dbg);
    }
    dbg.textContent = msg;
  }

  // ── Graf ────────────────────────────────────────────────────────────────────
  _updateChart() {
    if (!window.Chart) {
      if (!this._chartRetryTimer) {
        this._chartRetryTimer = setTimeout(() => {
          this._chartRetryTimer = null;
          this._updateChart();
        }, 300);
      }
      this._chartDebug("⏳ Čekám na Chart.js…");
      return;
    }
    const h = this._hass;
    if (!h) {
      return;
    }

    const nodes = this._getCurveNodes();
    if (!nodes.length) {
      if (!this._chartRetryTimer) {
        this._chartRetryTimer = setTimeout(() => {
          this._chartRetryTimer = null;
          this._updateChart();
        }, 800);
      }
      const st = h.states["sensor.bms_curve_storage_status"];
      const pts = st?.attributes?.points;
      this._chartDebug(st
        ? `⚠ Storage senzor: ${st.state}, bodů: ${pts ? pts.length : "null/undefined"}`
        : "⚠ sensor.bms_curve_storage_status nenalezen");
      return;
    }

    this._chartDebug(null);
    if (this._chartRetryTimer) {
      clearTimeout(this._chartRetryTimer);
      this._chartRetryTimer = null;
    }

    const tMin    = num(h, "number.bms_limit_min", 20);
    const tMax    = num(h, "number.bms_limit_max", 75);
    const outTemp = num(h, "sensor.bms_applied_out_temp", 4);
    const totalCorr = num(h, "sensor.bms_total_correction", 0);
    const fcOn    = sw(h, "switch.bms_pouziti_predpovedi");
    // Předpovídaná venkovní teplota pro druhou svislou čáru v grafu
    const calcAttrsChart = h.states["sensor.bms_calc_temp"]?.attributes || {};
    const fcOutTemp = calcAttrsChart.forecast_temp ?? null;
    // Letní bypass — zelená svislá čára
    const bypassOn   = sw(h, "switch.bms_letni_bypass");
    const bypassTemp = num(h, "number.bms_letni_bypass_temp", 18);
    // Bezpečný bod — zlatý diamant
    const safePtX = num(h, "number.bms_safe_curve_outdoor", 0);
    const safePtY = num(h, "number.bms_safe_curve_temp",    40);

    // Legenda předpovídané teploty — zobrazit jen pokud má smysl
    const legendFcEl = this.shadowRoot?.getElementById("legend-fc-temp");
    if (legendFcEl) {
      const showFcLegend = fcOutTemp !== null && Math.abs(fcOutTemp - outTemp) > 0.2;
      legendFcEl.style.display = showFcLegend ? "inline-flex" : "none";
    }

    // Tabulka s editorem
    this._renderCurveEditor(nodes, totalCorr, tMin, tMax);

    // ── Hover plugin — tooltip kdekoliv na linii ────────────────────────────
    // Interpoluje hodnoty ze všech tří křivek pro libovolnou X pozici myši
    const hoverLinePlugin = {
      id: "hoverLine",
      afterInit(chart) {
        chart._hoverX = null;
        chart._hoverTooltipEl = null;
      },
      afterEvent(chart, args) {
        const e = args.event;
        if (e.type === "mousemove") {
          const ca = chart.chartArea;
          if (!ca) return;
          const x = e.x;
          if (x >= ca.left && x <= ca.right) {
            chart._hoverX = x;
          } else {
            chart._hoverX = null;
          }
          chart.draw();
        } else if (e.type === "mouseout") {
          chart._hoverX = null;
          chart.draw();
        }
      },
      afterDraw(chart) {
        const x = chart._hoverX;
        if (x == null) return;
        const { ctx, chartArea: ca, scales } = chart;
        if (!ca) return;

        // Převést pixel → venkovní teplota
        const xVal = scales.x.getValueForPixel(x);

        // Interpolovat hodnoty ze všech aktivních datasetů
        const results = chart.data.datasets.map((ds, i) => {
          const pts = ds.data;
          if (!pts || pts.length < 2) return null;
          // Lineární interpolace mezi body
          const sorted = [...pts].sort((a, b) => a.x - b.x);
          let yVal = null;
          if (xVal <= sorted[0].x) {
            yVal = sorted[0].y;
          } else if (xVal >= sorted[sorted.length - 1].x) {
            yVal = sorted[sorted.length - 1].y;
          } else {
            for (let j = 0; j < sorted.length - 1; j++) {
              if (sorted[j].x <= xVal && xVal <= sorted[j + 1].x) {
                const t = (xVal - sorted[j].x) / (sorted[j + 1].x - sorted[j].x);
                yVal = sorted[j].y + t * (sorted[j + 1].y - sorted[j].y);
                break;
              }
            }
          }
          return yVal !== null ? {
            label: ds.label,
            value: yVal,
            color: ds.borderColor,
          } : null;
        }).filter(Boolean);

        if (!results.length) return;

        // Přečíst skutečné computed barvy z DOM (canvas nerozumí CSS vars)
        const cardEl = chart.canvas.closest("ha-card") || chart.canvas;
        const cs = window.getComputedStyle(cardEl);
        const isDark = (() => {
          const bg = cs.getPropertyValue("--card-background-color").trim()
            || cs.backgroundColor || "#1c1e26";
          // Zjistit světlost: parse rgb
          const m = bg.match(/\d+/g);
          if (m && m.length >= 3) {
            const lum = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
            return lum < 128;
          }
          return true; // default tmavé
        })();

        // Barvy tooltipů — dvě varianty pro světlé/tmavé téma
        const TT = isDark ? {
          bg:      "#1e2330",      // tmavě modrošedá — neutrální, nekonkuruje čarám
          border:  "rgba(255,255,255,0.12)",
          header:  "rgba(255,255,255,0.45)",  // šedá — venkovní teplota
          text:    "rgba(255,255,255,0.92)",
          shadow:  "rgba(0,0,0,0.5)",
        } : {
          bg:      "#ffffff",
          border:  "rgba(0,0,0,0.12)",
          header:  "rgba(0,0,0,0.45)",
          text:    "rgba(0,0,0,0.85)",
          shadow:  "rgba(0,0,0,0.15)",
        };

        // Svislá čára na pozici myši
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(128,128,128,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ca.top);
        ctx.lineTo(x, ca.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tečky na průsečíku s každou linií
        results.forEach(r => {
          const yPx = scales.y.getPixelForValue(r.value);
          if (yPx >= ca.top && yPx <= ca.bottom) {
            ctx.beginPath();
            ctx.arc(x, yPx, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = r.color;
            ctx.fill();
            ctx.strokeStyle = isDark ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        });

        // ── Tooltip box ──────────────────────────────────────────────────────
        const FONT   = "11px -apple-system, Roboto, sans-serif";
        const FONT_B = "600 11px -apple-system, Roboto, sans-serif";
        const PAD    = 10;
        const LINE_H = 18;
        const DOT_R  = 4;
        const HEADER_H = 22; // výška hlavičkového řádku (venkovní teplota)

        const boxW = 172;
        const boxH = HEADER_H + PAD + results.length * LINE_H + PAD * 0.5;

        // Pozice — vyhýbat se okrajům
        let bx = x + 14;
        let by = ca.top + 8;
        if (bx + boxW > ca.right - 4) bx = x - boxW - 14;
        if (bx < ca.left + 4)          bx = ca.left + 4;
        if (by + boxH > ca.bottom - 4) by = ca.bottom - boxH - 4;
        if (by < ca.top + 4)           by = ca.top + 4;

        // Shadow
        ctx.shadowColor   = TT.shadow;
        ctx.shadowBlur    = 12;
        ctx.shadowOffsetY = 3;

        // Pozadí s rounded corners
        ctx.fillStyle = TT.bg;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 8);
        ctx.fill();

        // Vypnout shadow před dalším vykreslením
        ctx.shadowBlur    = 0;
        ctx.shadowOffsetY = 0;

        // Border
        ctx.strokeStyle = TT.border;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // ── Hlavičkový řádek — venkovní teplota ──────────────────────────
        // Jemný oddělovač pod hlavičkou
        ctx.fillStyle = "rgba(128,128,128,0.08)";
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, HEADER_H, [8, 8, 0, 0]);
        ctx.fill();

        ctx.font        = FONT_B;
        ctx.fillStyle   = TT.header;
        ctx.textBaseline = "middle";
        const xLabel = `${xVal.toFixed(1)} °C venku`;
        ctx.fillText(xLabel, bx + PAD, by + HEADER_H / 2);

        // Oddělovač
        ctx.strokeStyle = TT.border;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 1, by + HEADER_H);
        ctx.lineTo(bx + boxW - 1, by + HEADER_H);
        ctx.stroke();

        // ── Řádky hodnot ─────────────────────────────────────────────────
        ctx.font = FONT;
        results.forEach((r, i) => {
          const ty = by + HEADER_H + PAD * 0.75 + i * LINE_H + LINE_H / 2;

          // Barevná tečka
          ctx.beginPath();
          ctx.arc(bx + PAD + DOT_R, ty, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = r.color;
          ctx.fill();

          // Label vlevo (kratší název)
          const shortLabel = r.label.replace("Základní křivka", "Křivka")
                                    .replace("S modifikacemi", "S korekcemi")
                                    .replace("Po limitu", "Po limitu");
          ctx.fillStyle   = TT.header;
          ctx.textAlign   = "left";
          ctx.fillText(shortLabel, bx + PAD + DOT_R * 2 + 5, ty);

          // Hodnota vpravo — výrazná
          ctx.font      = FONT_B;
          ctx.fillStyle = r.color;
          ctx.textAlign = "right";
          ctx.fillText(`${r.value.toFixed(1)} °C`, bx + boxW - PAD, ty);
          ctx.font      = FONT;
        });

        ctx.textAlign = "left"; // reset
        ctx.restore();
      },
    };

    const vertLinePlugin = {
      id: "vertLine",
      afterDraw(chart) {
        const xs  = chart.scales.x;
        const ctx = chart.ctx;
        // fcOn určuje která čára je aktivní (vstupuje do výpočtu)
        const fcActive = fcOn && fcOutTemp !== null && Math.abs(fcOutTemp - outTemp) > 0.2;

        // Aktuální (naměřená) teplota — červená; silnější pokud aktivní
        // Aktivní čára = silnější, neaktivní = průhledná
        const actIsActual  = !fcActive;  // actual je aktivní pokud fcActive=false
        const actIsFc      = fcActive;   // fc je aktivní pokud fcActive=true
        if (outTemp >= xs.min && outTemp <= xs.max) {
          const xp = xs.getPixelForValue(outTemp);
          ctx.save();
          ctx.setLineDash(fcActive ? [3, 3] : [5, 4]);
          ctx.strokeStyle = "#E24B4A";
          ctx.lineWidth   = fcActive ? 1.0 : 2.0;
          ctx.globalAlpha = fcActive ? 0.45 : 1.0;
          ctx.beginPath();
          ctx.moveTo(xp, chart.chartArea.top);
          ctx.lineTo(xp, chart.chartArea.bottom);
          ctx.stroke();
          // Popisek teploty
          if (!fcActive) {
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.85;
            ctx.font = "bold 10px sans-serif";
            ctx.fillStyle = "#E24B4A";
            ctx.textAlign = xp > chart.chartArea.right - 40 ? "right" : "left";
            ctx.fillText(`${outTemp.toFixed(1)}°`, xp + (xp > chart.chartArea.right - 40 ? -4 : 4), chart.chartArea.top + 12);
          }
          ctx.restore();
        }

        // Předpovídaná teplota — modrá; silnější pokud aktivní
        if (fcOutTemp !== null && fcOutTemp >= xs.min && fcOutTemp <= xs.max
            && Math.abs(fcOutTemp - outTemp) > 0.2) {
          const xpFc = xs.getPixelForValue(fcOutTemp);
          ctx.save();
          ctx.setLineDash(fcActive ? [5, 4] : [3, 3]);
          ctx.strokeStyle = "#378ADD";
          ctx.lineWidth   = fcActive ? 2.0 : 1.0;
          ctx.globalAlpha = fcActive ? 1.0 : 0.45;
          ctx.beginPath();
          ctx.moveTo(xpFc, chart.chartArea.top);
          ctx.lineTo(xpFc, chart.chartArea.bottom);
          ctx.stroke();
          // Popisek teploty
          if (fcActive) {
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.85;
            ctx.font = "bold 10px sans-serif";
            ctx.fillStyle = "#378ADD";
            ctx.textAlign = xpFc > chart.chartArea.right - 40 ? "right" : "left";
            ctx.fillText(`${fcOutTemp.toFixed(1)}°`, xpFc + (xpFc > chart.chartArea.right - 40 ? -4 : 4), chart.chartArea.top + 12);
          }
          ctx.restore();
        }
      },
    };

    const limitPlugin = {
      id: "limitLines",
      afterDraw(chart) {
        const ys = chart.scales.y;
        [tMin, tMax].forEach(lim => {
          const yp = ys.getPixelForValue(lim);
          if (yp < chart.chartArea.top || yp > chart.chartArea.bottom) return;
          const ctx = chart.ctx;
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(128,128,128,.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(chart.chartArea.left, yp);
          ctx.lineTo(chart.chartArea.right, yp);
          ctx.stroke();
          ctx.restore();
        });
      },
    };

    // Letní bypass — zelená svislá čára
    const bypassPlugin = {
      id: "bypassLine",
      afterDraw(chart) {
        if (!bypassOn) return;
        const xs = chart.scales.x;
        if (bypassTemp < xs.min || bypassTemp > xs.max) return;
        const xp  = xs.getPixelForValue(bypassTemp);
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = "#1D9E75";
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(xp, chart.chartArea.top);
        ctx.lineTo(xp, chart.chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font        = "bold 10px sans-serif";
        ctx.fillStyle   = "#1D9E75";
        ctx.textAlign   = "left";
        ctx.globalAlpha = 0.9;
        ctx.fillText(`☀ bypass ${bypassTemp}°`, xp + 4, chart.chartArea.top + 14);
        ctx.restore();
      },
    };

    // Bezpečný bod — zlatý diamant
    const safePointPlugin = {
      id: "safePoint",
      afterDraw(chart) {
        const xs = chart.scales.x;
        const ys = chart.scales.y;
        if (safePtX < xs.min || safePtX > xs.max) return;
        const xp  = xs.getPixelForValue(safePtX);
        const yp  = ys.getPixelForValue(Math.min(tMax, Math.max(tMin, safePtY)));
        const ctx = chart.ctx;
        const S   = 7; // velikost diamantu
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xp,     yp - S);
        ctx.lineTo(xp + S, yp);
        ctx.lineTo(xp,     yp + S);
        ctx.lineTo(xp - S, yp);
        ctx.closePath();
        ctx.fillStyle   = "#EF9F27";
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.strokeStyle = "#9A6200";
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.font        = "10px sans-serif";
        ctx.fillStyle   = "#9A6200";
        ctx.textAlign   = "left";
        ctx.globalAlpha = 0.85;
        ctx.fillText(`⚓ ${safePtY}°`, xp + S + 3, yp + 4);
        ctx.restore();
      },
    };

    const canvas = this.shadowRoot.getElementById("bms-chart");
    if (!canvas) return;
    // Nastavit výšku pevně, šířku vždy 100% wrapperu — nikdy pevné px
    canvas.style.width  = "100%";
    canvas.style.height = "230px";

    // Dynamická Y osa
    const yMax = Math.ceil((tMax + 5) / 10) * 10;
    const yMin = 0;

    // Dynamická X osa — rozsah venkovních teplot
    const xMin = num(h, "number.bms_rozsah_venku_min", -20);
    const xMax = num(h, "number.bms_rozsah_venku_max",  20);

    // Lineární data pro X osu (skutečné hodnoty, ne kategorie)
    const baseData    = nodes.map(([x, y]) => ({ x, y: parseFloat(y.toFixed(1)) }));
    const withModData = nodes.map(([x, y]) => ({ x, y: parseFloat((y + totalCorr).toFixed(1)) }));
    const clampedData = nodes.map(([x, y]) => ({ x, y: parseFloat(Math.min(tMax, Math.max(tMin, y + totalCorr)).toFixed(1)) }));

    if (this._chartInstance) {
      const needRebuild =
        this._chartInstance.data.datasets[0].data.length !== baseData.length ||
        this._chartInstance.options.scales.x.min !== xMin ||
        this._chartInstance.options.scales.x.max !== xMax;

      if (needRebuild) {
        this._chartInstance.destroy();
        this._chartInstance = null;
      } else {
        this._chartInstance.data.datasets[0].data = baseData;
        this._chartInstance.data.datasets[1].data = withModData;
        this._chartInstance.data.datasets[2].data = clampedData;
        this._chartInstance.options.scales.y.max = yMax;
        this._chartInstance.update("none");
        // Pokud má canvas stále nulové rozměry, vynutit resize
        if (canvas.offsetWidth === 0) this._chartInstance.resize();
        return;
      }
    }

    this._chartInstance = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      plugins: [hoverLinePlugin, vertLinePlugin, limitPlugin, bypassPlugin, safePointPlugin],
      data: {
        datasets: [
          { label: "Základní křivka", data: baseData,    borderColor: "#378ADD", backgroundColor: "rgba(55,138,221,0.08)", pointRadius: 5, tension: 0.35, fill: true,  borderWidth: 2 },
          { label: "S modifikacemi",  data: withModData, borderColor: "#D85A30", backgroundColor: "rgba(216,90,48,0.05)",  pointRadius: 3, tension: 0.35, fill: false, borderWidth: 1.5, borderDash: [5, 4] },
          { label: "Po limitu",       data: clampedData, borderColor: "#1D9E75", backgroundColor: "transparent",           pointRadius: 3, tension: 0.35, fill: false, borderWidth: 1.5, borderDash: [2, 3] },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: "index", intersect: false },
        events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
        onHover: (e, els, chart) => {
          const ca = chart.chartArea;
          if (ca && e.x >= ca.left && e.x <= ca.right &&
              e.y >= ca.top  && e.y <= ca.bottom) {
            chart.canvas.style.cursor = "crosshair";
          } else {
            chart.canvas.style.cursor = "default";
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }, // nahrazen hoverLinePlugin
        },
        scales: {
          x: {
            type: "linear",
            min: xMin,
            max: xMax,
            grid: { color: "rgba(128,128,128,0.1)" },
            ticks: {
              font: { size: 10 },
              color: "var(--secondary-text-color)",
              callback: v => v + "°",
              stepSize: Math.ceil((xMax - xMin) / 8),
            },
          },
          y: {
            grid: { color: "rgba(128,128,128,0.1)" },
            ticks: { font: { size: 10 }, color: "var(--secondary-text-color)", callback: v => v + "°C" },
            min: yMin,
            max: yMax,
          },
        },
      },
    });
    this._chartInitDone = true;
    // Vynutit přepočet rozměrů
    this._chartInstance.resize();

    // ResizeObserver — přizpůsobit graf při změně šířky (rotace mobilu, změna layoutu)
    if (!this._chartResizeObserver) {
      const wrap = canvas.parentElement;
      if (wrap) {
        this._chartResizeObserver = new ResizeObserver(() => {
          if (this._chartInstance) this._chartInstance.resize();
        });
        this._chartResizeObserver.observe(wrap);
      }
    }

    // Pokud má canvas stále nulové rozměry (karta ještě není viditelná),
    // sledujeme ho přes ResizeObserver a překreslíme jakmile dostane správnou velikost
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
      if (this._canvasObserver) this._canvasObserver.disconnect();
      this._canvasObserver = new ResizeObserver(() => {
        if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
          this._canvasObserver.disconnect();
          this._canvasObserver = null;
          if (this._chartInstance) {
            this._chartInstance.destroy();
            this._chartInstance = null;
            this._chartInitDone = false;
          }
          this._updateChart();
        }
      });
      this._canvasObserver.observe(canvas);
    }
  }

  _update() {
    if (!this._hass) return;
    if (!this.shadowRoot.querySelector("ha-card")) return; // DOM ještě není připraven
    this._updateStorageBanner();
    this._updateTempSourceBanner();
    this._updateSunArc();
    this._updateTimeAxis();
    this.__updateImpl();
    this._updateSummary(this._hass);
    this._updateStateBar(this._hass);
    this._updateAlerts(this._hass);
    this._updateSparkline(this._hass);
    this._updateTimestamp(this._hass);
    this._updateSeasonPresets(this._hass);
    this._updateInfChart(this._hass);
    // Výpočetní log — vždy překreslit (je stále viditelný v hero-grid)
    this._renderCalcLog();
    // schedules-panel vždy viditelný — render vždy
    this._renderSchedules(this._hass);
  }

  // HA card config — karta nemá volby, vizuální editor není potřeba (HA nabídne YAML)
  static getStubConfig() { return {}; }
}

if (!customElements.get("bms-master-card")) {
  customElements.define("bms-master-card", BMSMasterCard);
}