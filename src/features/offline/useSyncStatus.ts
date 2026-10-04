/**
 * Sync status of one entity, phrased for people.
 */

import { useOffline, useTick } from "./OfflineProvider";
import type { SyncOperation, SyncStatus } from "../../services/sync";

/** How long "✓ Synced" stays visible after confirmation. */
const SYNCED_BADGE_MS = 60_000;

export interface SyncStatusInfo {
  status: SyncStatus | null;
  operation?: SyncOperation;
  label: string;
  icon: string;
}

const LABELS: Record<SyncStatus, { label: string; icon: string }> = {
  pending: { label: "Waiting for connection", icon: "○" },
  syncing: { label: "Syncing…", icon: "↻" },
  retrying: { label: "Couldn't sync — we'll retry", icon: "⚠" },
  failed: { label: "Couldn't sync", icon: "⚠" },
  synced: { label: "Synced", icon: "✓" },
};

export function useSyncStatus(entityId: string | undefined): SyncStatusInfo {
  const { getOperation } = useOffline();
  const operation = entityId ? getOperation(entityId) : undefined;
  const recentlySynced =
    operation?.status === "synced" &&
    Date.now() - Date.parse(operation.syncedAt ?? "") < SYNCED_BADGE_MS;
  useTick(recentlySynced, 10_000);

  if (!operation || (operation.status === "synced" && !recentlySynced)) {
    return { status: null, label: "", icon: "" };
  }
  return { status: operation.status, operation, ...LABELS[operation.status] };
}
