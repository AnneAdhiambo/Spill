/**
 * Nearby sync: hand queued posts to someone close by (Bluetooth, Quick Share,
 * AirDrop) and receive theirs. Whoever gets online first publishes them.
 */

import { Bluetooth, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { nearbyShare, type ImportSummary } from "../../services/sync";
import { useOffline } from "./OfflineProvider";

const SHARE_CACHE = "spill-share-target";
const SHARED_BUNDLE_URL = "/__shared-sync-bundle";

type NearbySyncCardProps = {
  onReceived: () => void;
};

function describeImport({ accepted, duplicates, rejected, reasons }: ImportSummary): string {
  const parts: string[] = [];
  if (accepted > 0) {
    parts.push(`Received ${accepted} ${accepted === 1 ? "item" : "items"}. ${accepted === 1 ? "It" : "They"} will sync when this device is online.`);
  }
  if (duplicates > 0) parts.push(`${duplicates} already on this device.`);
  if (rejected > 0) parts.push(`${rejected} rejected (${reasons.join(" ")})`);
  return parts.join(" ") || "Nothing to import.";
}

export default function NearbySyncCard({ onReceived }: NearbySyncCardProps) {
  const { unsyncedCount } = useOffline();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finishImport = (summary: ImportSummary) => {
    setMessage(describeImport(summary));
    if (summary.accepted > 0) onReceived();
  };

  // A file shared to Spill from another app arrives via the service worker.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("received") || typeof caches === "undefined") return;
    window.history.replaceState(null, "", window.location.pathname);

    (async () => {
      const cache = await caches.open(SHARE_CACHE);
      const response = await cache.match(SHARED_BUNDLE_URL);
      await cache.delete(SHARED_BUNDLE_URL);
      if (!response) return setMessage("No sync file was received.");
      finishImport(await nearbyShare.importFile(await response.blob()));
    })().catch(() => setMessage("The shared file could not be read."));
  }, []);

  const handleShare = async () => {
    setBusy(true);
    try {
      const { outcome, count } = await nearbyShare.share();
      const items = `${count} ${count === 1 ? "item" : "items"}`;
      setMessage(
        outcome === "shared" ? `Shared ${items}. They also stay queued here until this device syncs.`
        : outcome === "downloaded" ? `Saved ${items} as a file. Send it by Bluetooth, then open it in Spill on the other device.`
        : outcome === "nothing-to-share" ? "Nothing is waiting to sync."
        : null,
      );
    } catch {
      setMessage("Could not prepare the items to share.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      finishImport(await nearbyShare.importFile(file));
    } catch {
      setMessage("The file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="nearby-sync-card" aria-label="Nearby sync">
      <div className="nearby-sync-copy">
        <strong>No internet? Pass posts to someone nearby.</strong>
        <span>Share over Bluetooth. Whoever gets online first publishes them.</span>
      </div>
      <div className="nearby-sync-actions">
        <button type="button" className="composer-attach-button" onClick={handleShare} disabled={busy || unsyncedCount === 0}>
          <Bluetooth size={16} />
          {unsyncedCount > 0 ? `Share ${unsyncedCount} waiting` : "Nothing to share"}
        </button>
        <label className="composer-attach-button">
          <Download size={16} />
          <span>Receive file</span>
          <input type="file" accept=".txt,.json,text/plain,application/json" onChange={handleFile} disabled={busy} />
        </label>
      </div>
      {message && <p className="composer-notice" role="status">{message}</p>}
    </section>
  );
}
