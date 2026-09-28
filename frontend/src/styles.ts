import { css } from "lit";

/** Barvy výhradně přes proměnné HA (motivy, tmavý režim) s rozumnými výchozími hodnotami. */
export const baseStyles = css`
  :host {
    --bms-ok: var(--success-color, #43a047);
    --bms-info: var(--info-color, #039be5);
    --bms-warn: var(--warning-color, #ffa600);
    --bms-err: var(--error-color, #db4437);
    --bms-heat: var(--state-climate-heat-color, #ff8100);
    --bms-night: var(--purple-color, #7e57c2);
    --bms-frost: var(--cyan-color, #00bcd4);
    --bms-muted: var(--secondary-text-color);
    --bms-border: var(--divider-color, rgba(127, 127, 127, 0.25));
    --bms-surface: rgba(var(--rgb-primary-text-color, 127, 127, 127), 0.04);
    --bms-radius: var(--ha-card-border-radius, 12px);
    --bms-gap: 12px;
    display: block;
    color: var(--primary-text-color);
    font-family: var(--ha-font-family-body, Roboto, sans-serif);
  }
  .section { padding: 12px 16px; }
  .section + .section { border-top: 1px solid var(--bms-border); }
  .section-header {
    display: flex; align-items: center; gap: 8px; margin: 0 0 10px;
    font-size: var(--ha-font-size-m, 14px); font-weight: var(--ha-font-weight-medium, 500);
  }
  .section-header ha-icon { --mdc-icon-size: 20px; color: var(--bms-muted); }
  .section-header .spacer { flex: 1; }
  details > summary { cursor: pointer; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary .chevron { transition: transform 0.2s; }
  details[open] > summary .chevron { transform: rotate(90deg); }
  .muted { color: var(--bms-muted); }
  .small { font-size: var(--ha-font-size-s, 12px); }
  .row { display: flex; align-items: center; gap: 8px; min-height: 40px; }
  .row .label { flex: 1; min-width: 0; }
  .grid { display: grid; gap: var(--bms-gap); grid-template-columns: repeat(auto-fill, minmax(var(--bms-col, 200px), 1fr)); }
  .tile {
    border: 1px solid var(--bms-border); border-radius: calc(var(--bms-radius) - 4px);
    padding: 10px 12px; background: var(--bms-surface);
  }
  .tile-title { display: flex; align-items: center; gap: 6px; font-weight: 500; margin-bottom: 6px; }
  .tile-title ha-icon { --mdc-icon-size: 18px; }
  .chip {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px;
    font-size: var(--ha-font-size-xs, 11px); font-weight: 500; background: var(--bms-surface);
    border: 1px solid var(--bms-border);
  }
  .chip.ok { color: var(--bms-ok); } .chip.info { color: var(--bms-info); }
  .chip.warn { color: var(--bms-warn); } .chip.err { color: var(--bms-err); }
  .chip.night { color: var(--bms-night); } .chip.frost { color: var(--bms-frost); }
  .chip.boost { color: var(--bms-heat); } .chip.reduction { color: var(--bms-info); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button.btn {
    font: inherit; font-size: var(--ha-font-size-s, 13px); cursor: pointer;
    padding: 6px 12px; border-radius: 18px; border: 1px solid var(--bms-border);
    background: transparent; color: var(--primary-text-color); display: inline-flex; align-items: center; gap: 4px;
  }
  button.btn:hover:not(:disabled) { background: var(--bms-surface); }
  button.btn:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button.btn:disabled { opacity: 0.45; cursor: default; }
  button.btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: transparent; }
  button.btn.danger { color: var(--bms-err); border-color: color-mix(in srgb, var(--bms-err) 40%, transparent); }
  button.btn.active { border-color: var(--primary-color); color: var(--primary-color); }
  button.btn ha-icon { --mdc-icon-size: 18px; }
  input, select {
    font: inherit; font-size: var(--ha-font-size-s, 13px); color: var(--primary-text-color);
    background: var(--card-background-color, transparent); border: 1px solid var(--bms-border);
    border-radius: 8px; padding: 6px 8px; min-height: 32px; box-sizing: border-box;
  }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  input[type="number"] { width: 84px; text-align: right; }
  .empty { padding: 8px 0; color: var(--bms-muted); font-size: var(--ha-font-size-s, 12px); }
  .alert {
    display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 8px;
    font-size: var(--ha-font-size-s, 13px); border: 1px solid var(--bms-border); margin-bottom: 8px;
  }
  .alert ha-icon { --mdc-icon-size: 18px; flex-shrink: 0; }
  .alert.info { color: var(--bms-info); } .alert.warning { color: var(--bms-warn); } .alert.error { color: var(--bms-err); }
  dialog {
    border: none; border-radius: var(--bms-radius); padding: 20px; max-width: min(420px, 92vw);
    background: var(--card-background-color, #fff); color: var(--primary-text-color);
    box-shadow: var(--ha-box-shadow-l, 0 8px 32px rgba(0, 0, 0, 0.3));
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
  dialog h3 { margin: 0 0 12px; font-size: var(--ha-font-size-l, 16px); }
  dialog .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  dialog .field input, dialog .field select { width: 100%; }
  dialog .actions { justify-content: flex-end; margin-top: 16px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`;
