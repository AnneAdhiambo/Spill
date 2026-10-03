/**
 * Nearby Share Transport (peer)
 *
 * Moves queued operations between nearby devices without internet, using
 * the operating system's share sheet — Bluetooth, Quick Share/Nearby Share
 * (Android) or AirDrop (iOS). Browsers cannot act as a Bluetooth peripheral,
 * so two PWAs cannot open a direct Web Bluetooth link; the share sheet is the
 * Bluetooth path the web platform actually offers.
 *
 *   Device A: getShareableOperations ─► bundle file ─► share sheet ─► Bluetooth
 *   Device B: open file ─► importBundle ─► syncEngine.enqueue(op, "peer")
 *             ─► same validation, dedupe, queue and upstream sync as any op
 *
 * This is only a transport. It keeps no state of its own and never marks an
 * operation synced: A's copy stays queued until A reaches a relay itself.
 * Whichever device gets online first publishes; relays dedupe by event id.
 */

import type { EnqueueResult, SyncEngine, WireOperation } from "../SyncEngine";
import type { Transport } from "../types";

export const BUNDLE_FORMAT = "spill-sync-bundle";
export const BUNDLE_VERSION = 1;
export const MAX_BUNDLE_BYTES = 2_000_000;
export const MAX_BUNDLE_OPERATIONS = 200;

export interface SyncBundle {
  format: typeof BUNDLE_FORMAT;
  version: typeof BUNDLE_VERSION;
  createdAt: string;
  operations: WireOperation[];
}

export interface ImportSummary {
  accepted: number;
  duplicates: number;
  rejected: number;
  /** Distinct rejection reasons (validation messages, never payload data). */
  reasons: string[];
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "nothing-to-share";

type EngineApi = Pick<SyncEngine, "getShareableOperations" | "toWire" | "enqueue">;

export class NearbyShareTransport implements Transport {
  readonly name = "bluetooth";
  readonly role = "peer" as const;

  constructor(private readonly engine: EngineApi) {}

  /** A file can always be produced; how it travels is up to the OS. */
  isAvailable(): boolean {
    return true;
  }

  // ---- Sending ------------------------------------------------------------

  async createBundle(): Promise<SyncBundle> {
    const operations = (await this.engine.getShareableOperations())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, MAX_BUNDLE_OPERATIONS)
      .map((op) => this.engine.toWire(op));
    return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, createdAt: new Date().toISOString(), operations };
  }

  /** Open the share sheet with the bundle, or download it if sharing files is unsupported. */
  async share(): Promise<{ outcome: ShareOutcome; count: number }> {
    const bundle = await this.createBundle();
    const count = bundle.operations.length;
    if (count === 0) return { outcome: "nothing-to-share", count };

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    // text/plain: the file type browsers reliably allow in navigator.share.
    const file = new File([JSON.stringify(bundle)], `spill-sync-${stamp}.txt`, { type: "text/plain" });

    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Spill posts to sync" });
        return { outcome: "shared", count };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return { outcome: "cancelled", count };
        // Fall through to download.
      }
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    return { outcome: "downloaded", count };
  }

  // ---- Receiving ----------------------------------------------------------

  async importFile(file: Blob): Promise<ImportSummary> {
    if (file.size > MAX_BUNDLE_BYTES) return rejectAll("File is too large.");
    return this.importBundle(await file.text());
  }

  /**
   * Parse untrusted bundle text from a nearby device and hand each operation
   * to the sync engine. Nothing here touches storage directly: validation,
   * deduplication and persistence all happen in `syncEngine.enqueue`.
   */
  async importBundle(text: string): Promise<ImportSummary> {
    if (text.length > MAX_BUNDLE_BYTES) return rejectAll("File is too large.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return rejectAll("Not a Spill sync file.");
    }

    if (
      typeof parsed !== "object" || parsed === null ||
      (parsed as { format?: unknown }).format !== BUNDLE_FORMAT ||
      (parsed as { version?: unknown }).version !== BUNDLE_VERSION ||
      !Array.isArray((parsed as { operations?: unknown }).operations)
    ) {
      return rejectAll("Not a Spill sync file.");
    }

    const operations = (parsed as { operations: unknown[] }).operations;
    if (operations.length > MAX_BUNDLE_OPERATIONS) return rejectAll("File contains too many items.");

    const summary: ImportSummary = { accepted: 0, duplicates: 0, rejected: 0, reasons: [] };
    for (const raw of operations) {
      let result: EnqueueResult;
      try {
        result = await this.engine.enqueue(raw, "peer");
      } catch {
        result = { accepted: false, duplicate: false, reason: "Could not store item." };
      }
      if (result.accepted) summary.accepted += 1;
      else if (result.duplicate) summary.duplicates += 1;
      else {
        summary.rejected += 1;
        if (!summary.reasons.includes(result.reason)) summary.reasons.push(result.reason);
      }
    }
    return summary;
  }
}

function rejectAll(reason: string): ImportSummary {
  return { accepted: 0, duplicates: 0, rejected: 1, reasons: [reason] };
}
