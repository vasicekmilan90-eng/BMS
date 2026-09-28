/** Sdílené spojení na websocket regulátoru — jedno předplatné pro všechny karty na stránce. */

import type { HomeAssistant, SettingValue, Snapshot } from "./types.js";

type Listener = (snapshot: Snapshot | undefined, error?: string) => void;

const DOMAIN = "heating_curve";

export class BmsStore {
  private static readonly stores = new Map<string, BmsStore>();

  snapshot?: Snapshot;
  error?: string;
  hass?: HomeAssistant;
  private readonly listeners = new Set<Listener>();
  private unsubscribe?: Promise<() => void>;

  private constructor(private readonly entryId?: string) {}

  static get(entryId?: string): BmsStore {
    const key = entryId ?? "";
    let store = BmsStore.stores.get(key);
    if (!store) {
      store = new BmsStore(entryId);
      BmsStore.stores.set(key, store);
    }
    return store;
  }

  private get base(): Record<string, unknown> {
    return this.entryId ? { entry_id: this.entryId } : {};
  }

  attach(hass: HomeAssistant, listener: Listener): () => void {
    this.hass = hass;
    this.listeners.add(listener);
    if (this.snapshot || this.error) listener(this.snapshot, this.error);
    if (!this.unsubscribe) this.subscribe();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  private subscribe(): void {
    const hass = this.hass;
    if (!hass) return;
    this.unsubscribe = hass.connection.subscribeMessage<Snapshot>(
      (snapshot) => {
        this.snapshot = snapshot;
        this.error = undefined;
        this.emit();
      },
      { type: `${DOMAIN}/subscribe`, ...this.base },
    );
    this.unsubscribe.catch((err: { message?: string }) => {
      this.error = err?.message ?? String(err);
      this.unsubscribe = undefined;
      this.emit();
    });
  }

  private close(): void {
    const pending = this.unsubscribe;
    this.unsubscribe = undefined;
    pending?.then((unsub) => unsub()).catch(() => undefined);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.snapshot, this.error);
  }

  // ── Akce ────────────────────────────────────────────────────────────────
  private requireHass(): HomeAssistant {
    if (!this.hass) throw new Error("Home Assistant není připojen");
    return this.hass;
  }

  setSetting(key: string, value: SettingValue): Promise<unknown> {
    return this.requireHass().connection.sendMessagePromise({
      type: `${DOMAIN}/set_setting`, key, value, ...this.base,
    });
  }

  callService(service: string, data: Record<string, unknown> = {}): Promise<unknown> {
    return this.requireHass().callService(DOMAIN, service, data);
  }

  exportData(): Promise<Record<string, unknown>> {
    return this.requireHass().connection.sendMessagePromise({ type: `${DOMAIN}/export`, ...this.base });
  }

  importData(data: Record<string, unknown>): Promise<{ profiles: string[] }> {
    return this.requireHass().connection.sendMessagePromise({ type: `${DOMAIN}/import`, data, ...this.base });
  }
}
