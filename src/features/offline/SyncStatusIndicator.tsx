/**
 * Navbar indicator: offline state and how many items are waiting to sync.
 * Hidden when online with nothing queued.
 */

import { useOffline } from "./OfflineProvider";

export default function SyncStatusIndicator() {
  const { connectivity, unsyncedCount, failedCount, flushNow } = useOffline();
  const isOffline = connectivity === "offline";

  if (!isOffline && unsyncedCount === 0) return null;

  const label = isOffline
    ? unsyncedCount > 0 ? `Offline · ${unsyncedCount} waiting` : "Offline"
    : failedCount > 0 ? `⚠ ${unsyncedCount} not synced` : `↻ ${unsyncedCount} syncing`;
  const items = unsyncedCount === 1 ? "1 item is" : `${unsyncedCount} items are`;

  return (
    <button
      type="button"
      className={`sync-status-indicator${isOffline ? " sync-status-indicator--offline" : ""}`}
      onClick={flushNow}
      disabled={isOffline}
      title={isOffline ? `You're offline. ${items} saved on this device and will sync when you're back online.` : `${items} waiting to sync. Click to sync now.`}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
