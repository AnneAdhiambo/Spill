/**
 * Inline sync state for a post the user created: shown while it is queued,
 * syncing, failing, and briefly after it is confirmed.
 */

import { useOffline } from "./OfflineProvider";
import { useSyncStatus } from "./useSyncStatus";

type PostSyncBadgeProps = {
  entityId: string;
};

export default function PostSyncBadge({ entityId }: PostSyncBadgeProps) {
  const { retry } = useOffline();
  const { status, operation, label, icon } = useSyncStatus(entityId);

  if (!status || !operation) return null;

  return (
    <span className={`post-sync-badge post-sync-badge--${status}`} role="status">
      <span aria-hidden="true">{icon}</span> {label}
      {status === "failed" && (
        <button type="button" className="post-sync-retry" onClick={() => retry(operation.operationId)}>
          Retry
        </button>
      )}
    </span>
  );
}
