/** Minimální typy Home Assistantu a websocket snapshotu regulátoru. */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HassConnection {
  subscribeMessage<T>(callback: (msg: T) => void, message: Record<string, unknown>): Promise<() => void>;
  sendMessagePromise<T>(message: Record<string, unknown>): Promise<T>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, { entity_id: string; platform?: string }>;
  connection: HassConnection;
  language: string;
  locale?: { language: string };
  user?: { id?: string; is_admin: boolean };
  themes?: { darkMode?: boolean };
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

export interface LovelaceGridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface ScheduleRule {
  id: string;
  enabled: boolean;
  type: "date" | "temp";
  profile: string;
  date_from: string;
  date_to: string;
  temp_op: "<" | ">";
  temp_val: number;
  temp_days: number;
}

export interface CalcResult {
  curve_temp: number;
  corr_wind: number;
  corr_rain: number;
  corr_humidity: number;
  corr_clouds: number;
  corr_sun: number;
  night_offset: number;
  night_active: boolean;
  boost: number;
  total_correction: number;
  raw: number;
  t_min: number;
  t_max: number;
  frost_active: boolean;
  bypass_active: boolean;
  safe_mode: boolean;
  result: number;
  clamped: boolean;
}

export interface CalcLogEntry {
  time: string;
  ts?: number;
  event?: string;
  amount?: number;
  hours?: number;
  manual?: boolean;
  out?: number;
  curve?: number;
  corr_wind?: number;
  corr_rain?: number;
  corr_hum?: number;
  corr_clouds?: number;
  corr_sun?: number;
  night_offset?: number;
  boost?: number;
  total_corr?: number;
  raw?: number;
  result?: number;
  clamped?: boolean;
  frost?: boolean;
  night?: boolean;
  bypass?: boolean;
  safe?: boolean;
  thermostat?: string | null;
}

export interface ChartPoint {
  ts: number;
  out?: number | null;
  act_wind?: number | null;
  act_rain?: number | null;
  act_hum?: number | null;
  act_clouds?: number | null;
  result?: number | null;
  _fc?: boolean;
}

export interface ThermostatWrite {
  time?: string;
  ts?: number;
  target?: number;
  value?: number | null;
  status?: "ok" | "unchanged" | "off" | "unavailable" | "error";
  message?: string | null;
}

export type SettingValue = number | boolean | string;

export interface NextEvent {
  kind: "recalc" | "boost_end" | "day_start" | "night_start" | "schedule";
  ts: number;
  profile?: string;
}

export interface ThermostatInfo {
  entity_id: string;
  state: string;
  target: number | null;
  current: number | null;
}

export interface Snapshot {
  entry_id: string;
  inputs: { thermostat?: string; outdoor_sensor?: string; weather?: string };
  thermostat: ThermostatInfo | null;
  profile_modified: boolean;
  active_rule: string | null;
  next_events: NextEvent[];
  available: boolean;
  last_error: string | null;
  problems: Record<string, string>;
  settings: Record<string, SettingValue>;
  setting_meta: Record<string, { min: number; max: number; step: number; unit: string | null }>;
  entities: Record<string, string>;
  curve: CurvePoint[];
  storage_ok: boolean;
  profiles: string[];
  system_profiles: string[];
  active_profile: string;
  starred: string[];
  schedules: ScheduleRule[];
  boost: { active: boolean; amount?: number; until?: number; since?: number; hours?: number; effective: number };
  temp_source: "sensor" | "weather" | "safe_fallback";
  safe_since: number | null;
  result: CalcResult | null;
  values: Record<string, number | null>;
  last_write: ThermostatWrite;
  calc_log: CalcLogEntry[];
  clamp_log: { ts: number; raw: number; clamped: number }[];
  history: ChartPoint[];
  forecast: ChartPoint[];
  forecast_ok: boolean;
}
