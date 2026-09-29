import { css } from "lit";

/**
 * Barvy výhradně přes proměnné HA (motivy, tmavý režim).
 * Význam: oranžová = topí víc, modrá = topí míň / křivka, žlutá = pozor, zelená = výsledek / v pořádku.
 */
export const baseStyles = css`
  :host {
    --bms-ok: var(--success-color, #2e9d4f);
    --bms-info: var(--info-color, #1e88e5);
    --bms-cool: var(--state-climate-cool-color, #1e88e5);
    --bms-warn: var(--warning-color, #f2a100);
    --bms-err: var(--error-color, #d93025);
    --bms-heat: var(--state-climate-heat-color, #ff7a00);
    --bms-night: var(--purple-color, #7e57c2);
    --bms-frost: var(--cyan-color, #00bcd4);
    --bms-muted: var(--secondary-text-color);
    --bms-border: var(--divider-color, rgba(127, 127, 127, 0.2));
    --bms-surface: rgba(var(--rgb-primary-text-color, 127, 127, 127), 0.05);
    --bms-surface-2: rgba(var(--rgb-primary-text-color, 127, 127, 127), 0.09);
    --bms-radius: var(--ha-card-border-radius, 12px);
    --bms-gap: 12px;
    display: block;
    color: var(--primary-text-color);
    font-family: var(--ha-font-family-body, Roboto, sans-serif);
  }
  .section { padding: 14px 16px; }
  .section + .section { border-top: 1px solid var(--bms-border); }
  .section-header {
    display: flex; align-items: center; gap: 10px; margin: 0 0 10px; min-height: 28px;
    font-size: var(--ha-font-size-m, 14px); font-weight: var(--ha-font-weight-medium, 500);
  }
  .section-header ha-icon { --mdc-icon-size: 20px; color: var(--bms-muted); }
  .section-header .spacer { flex: 1; }
  details > summary { cursor: pointer; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary .chevron { transition: transform 0.2s; }
  details[open] > summary .chevron { transform: rotate(180deg); }
  .muted { color: var(--bms-muted); }
  .small { font-size: var(--ha-font-size-s, 12px); }
  .row { display: flex; align-items: center; gap: 8px; min-height: 44px; }
  .row .label { flex: 1; min-width: 0; }
  .grid { display: grid; gap: var(--bms-gap); grid-template-columns: repeat(auto-fill, minmax(var(--bms-col, 200px), 1fr)); }
  .tile {
    border: 1px solid var(--bms-border); border-radius: calc(var(--bms-radius) - 2px);
    padding: 10px 12px; background: var(--bms-surface);
  }
  .tile-title { display: flex; align-items: center; gap: 6px; font-weight: 500; margin-bottom: 6px; }
  .tile-title ha-icon { --mdc-icon-size: 18px; }
  .badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 10px;
    font-size: var(--ha-font-size-xs, 11px); font-weight: 500; background: var(--bms-surface-2);
  }
  .badge.ok { color: var(--bms-ok); background: color-mix(in srgb, var(--bms-ok) 14%, transparent); }
  .badge.warn { color: var(--bms-warn); background: color-mix(in srgb, var(--bms-warn) 14%, transparent); }
  .badge.night { color: var(--bms-night); background: color-mix(in srgb, var(--bms-night) 14%, transparent); }
  .badge.frost { color: var(--bms-frost); background: color-mix(in srgb, var(--bms-frost) 14%, transparent); }
  .badge.heat { color: var(--bms-heat); background: color-mix(in srgb, var(--bms-heat) 14%, transparent); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button.btn {
    font: inherit; font-size: var(--ha-font-size-s, 13px); font-weight: 500; cursor: pointer;
    padding: 0 16px; min-height: 40px; border-radius: 20px; border: none;
    background: var(--bms-surface-2); color: var(--primary-text-color); display: inline-flex; align-items: center; gap: 6px;
  }
  button.btn:hover:not(:disabled) { filter: brightness(0.96); background: color-mix(in srgb, var(--primary-text-color) 12%, transparent); }
  button.btn:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button.btn:disabled { opacity: 0.45; cursor: default; }
  button.btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.btn.text { background: none; color: var(--primary-color); padding: 0 10px; }
  button.btn.text:hover:not(:disabled) { background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
  button.btn.danger { color: var(--bms-err); }
  button.btn.active { background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: var(--primary-color); }
  button.btn ha-icon { --mdc-icon-size: 18px; }
  button.link {
    border: none; background: none; padding: 4px 2px; cursor: pointer; font: inherit; font-size: var(--ha-font-size-s, 13px);
    font-weight: 500; color: var(--primary-color); display: inline-flex; align-items: center; gap: 2px;
  }
  button.link:focus-visible { outline: 2px solid var(--primary-color); border-radius: 4px; }
  button.link ha-icon { --mdc-icon-size: 18px; }
  input, select {
    font: inherit; font-size: var(--ha-font-size-s, 13px); color: var(--primary-text-color);
    background: var(--bms-surface); border: 1px solid var(--bms-border);
    border-radius: 10px; padding: 6px 10px; min-height: 40px; box-sizing: border-box;
  }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  input[type="number"] { width: 88px; text-align: right; }
  .empty { padding: 8px 0; color: var(--bms-muted); font-size: var(--ha-font-size-s, 12px); }
  .alert {
    display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px;
    font-size: var(--ha-font-size-s, 13px); margin-bottom: 12px;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .alert > span { color: var(--primary-text-color); flex: 1; }
  .alert ha-icon { --mdc-icon-size: 20px; flex-shrink: 0; }
  .alert.info { color: var(--bms-info); } .alert.warning { color: var(--bms-warn); } .alert.error { color: var(--bms-err); }
  dialog {
    border: none; border-radius: 24px; padding: 22px 22px 14px; max-width: min(420px, 92vw);
    background: var(--card-background-color, #fff); color: var(--primary-text-color);
    box-shadow: var(--ha-box-shadow-l, 0 8px 32px rgba(0, 0, 0, 0.3));
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
  dialog h3 { margin: 0 0 12px; font-size: 20px; font-weight: 400; }
  dialog p { margin: 0 0 16px; color: var(--bms-muted); font-size: var(--ha-font-size-s, 13px); }
  dialog .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  dialog .field input, dialog .field select { width: 100%; }
  dialog .actions { justify-content: flex-end; margin-top: 16px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .icon-btn {
    border: none; background: none; cursor: pointer; color: var(--bms-muted); width: 40px; height: 40px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;
  }
  .icon-btn:hover:not(:disabled) { color: var(--primary-text-color); background: var(--bms-surface); }
  .icon-btn:focus-visible { outline: 2px solid var(--primary-color); }
  .icon-btn:disabled { opacity: 0.3; cursor: default; }
  .icon-btn ha-icon { --mdc-icon-size: 20px; }
  .seg { display: inline-flex; background: var(--bms-surface-2); border-radius: 20px; padding: 3px; gap: 2px; }
  .seg button {
    font: inherit; font-size: var(--ha-font-size-s, 13px); font-weight: 500; border: none; background: transparent; cursor: pointer;
    padding: 0 14px; min-height: 34px; border-radius: 17px; color: var(--bms-muted); display: inline-flex; align-items: center; gap: 6px;
  }
  .seg button[aria-pressed="true"], .seg button[aria-selected="true"] {
    background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  .seg button:disabled { opacity: 0.45; cursor: default; }
  .seg button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
  .seg ha-icon { --mdc-icon-size: 16px; }
  button.chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; min-height: 36px; border-radius: 18px;
    border: none; cursor: pointer; font: inherit; font-size: var(--ha-font-size-s, 13px); font-weight: 500;
    background: var(--bms-surface-2); color: var(--primary-text-color);
  }
  button.chip[aria-pressed="true"] { background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: var(--primary-color); }
  button.chip:disabled { opacity: 0.45; cursor: default; }
  button.chip:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button.chip ha-icon { --mdc-icon-size: 16px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .progress { height: 6px; border-radius: 3px; background: color-mix(in srgb, currentColor 20%, transparent); overflow: hidden; }
  .progress > div { height: 100%; background: currentColor; border-radius: 3px; transition: width 0.5s; }
  /* Řádek se stavovou ikonou, textem a ovládáním vpravo (automatiky, vlivy, plány). */
  .item { display: flex; gap: 12px; align-items: center; min-height: 52px; padding: 2px 0; }
  .item + .item, .item + .more, .more + .item { border-top: 1px solid var(--bms-border); }
  .item > .ico {
    width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
    background: var(--bms-surface-2); color: var(--bms-muted);
  }
  .item > .ico.on { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .item > .ico ha-icon { --mdc-icon-size: 20px; }
  .item .txt { flex: 1; min-width: 0; }
  .item .name { font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .item .desc { font-size: var(--ha-font-size-s, 12px); color: var(--bms-muted); }
  .item-details { padding: 0 0 10px 48px; }
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .spacer { flex: 1; }
`;
