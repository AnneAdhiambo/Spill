/**
 * Connectivity Monitor
 *
 * A best-effort hint for *when* the sync engine should try. It never decides
 * whether something synced — only a relay's OK response does that.
 *
 * `navigator.onLine === false` reliably means offline; `true` only means a
 * network interface is up (captive portals, dead relays, ...), so the engine
 * treats "online"/"unknown" as "worth an attempt".
 */

export type ConnectivityState = "online" | "offline" | "unknown";
type ConnectivityListener = (state: ConnectivityState) => void;

const PROBE_URL = "https://relay.damus.io";
const PROBE_INTERVAL_MS = 30_000;

class ConnectivityMonitor {
  private state: ConnectivityState = "unknown";
  private listeners = new Set<ConnectivityListener>();
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  /** Begin listening for browser events and probing. Idempotent. */
  start(): void {
    if (this.probeTimer || typeof window === "undefined") return;

    this.setState(navigator.onLine ? "online" : "offline");
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);

    void this.probe();
    this.probeTimer = setInterval(() => void this.probe(), PROBE_INTERVAL_MS);
  }

  stop(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.probeTimer = null;
  }

  getState(): ConnectivityState {
    return this.state;
  }

  onChange(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleOnline = () => {
    this.setState("online");
    void this.probe();
  };

  private handleOffline = () => this.setState("offline");

  private setState(next: ConnectivityState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch {
        // Listener errors must not break the monitor.
      }
    }
  }

  /** An opaque no-cors request that resolves only if the network path works. */
  private async probe(): Promise<void> {
    if (!navigator.onLine) {
      this.setState("offline");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(PROBE_URL, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller.signal });
      this.setState("online");
    } catch {
      // Interface up but nothing reachable: keep attempting, but say so.
      this.setState("unknown");
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Singleton connectivity monitor for the app. */
export const connectivityMonitor = new ConnectivityMonitor();
