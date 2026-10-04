/**
 * Offline Provider
 *
 * Exposes sync engine state (connectivity + queued operations) to the UI and
 * starts the engine once at app startup.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { connectivityMonitor, initSync, syncEngine } from "../../services/sync";
import type { ConnectivityState, SyncOperation } from "../../services/sync";

interface OfflineContextValue {
  connectivity: ConnectivityState;
  /** Operations not yet confirmed by a relay (pending, syncing, retrying, failed). */
  unsyncedCount: number;
  failedCount: number;
  /** Latest operation for an entity (e.g. a post id), if it is in the queue. */
  getOperation: (entityId: string) => SyncOperation | undefined;
  flushNow: () => void;
  retry: (operationId: string) => void;
}

const OfflineContext = createContext<OfflineContextValue>({
  connectivity: "unknown",
  unsyncedCount: 0,
  failedCount: 0,
  getOperation: () => undefined,
  flushNow: () => {},
  retry: () => {},
});

/** Cross-tab changes don't emit events here, so re-read occasionally. */
const REFRESH_INTERVAL_MS = 10_000;

export function OfflineProvider({ children }: PropsWithChildren) {
  const [connectivity, setConnectivity] = useState<ConnectivityState>(connectivityMonitor.getState());
  const [operations, setOperations] = useState<SyncOperation[]>([]);

  useEffect(() => {
    initSync();
    setConnectivity(connectivityMonitor.getState());
    const unsubscribeConnectivity = connectivityMonitor.onChange(setConnectivity);

    const refresh = () => {
      syncEngine.getAll().then(setOperations).catch(() => {});
    };
    refresh();
    const unsubscribeEngine = syncEngine.on(refresh);
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      unsubscribeConnectivity();
      unsubscribeEngine();
      clearInterval(interval);
    };
  }, []);

  const value = useMemo<OfflineContextValue>(() => {
    const byEntity = new Map(operations.map((op) => [op.entityId, op]));
    return {
      connectivity,
      unsyncedCount: operations.filter((op) => op.status !== "synced").length,
      failedCount: operations.filter((op) => op.status === "failed").length,
      getOperation: (entityId) => byEntity.get(entityId),
      flushNow: () => void syncEngine.flush(),
      retry: (operationId) => void syncEngine.retry(operationId),
    };
  }, [connectivity, operations]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext);
}

/** Re-render periodically while `active` (used to expire the "Synced" badge). */
export function useTick(active: boolean, intervalMs: number): void {
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(bump, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, bump]);
}
