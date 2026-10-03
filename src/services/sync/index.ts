/**
 * Offline sync: one engine, pluggable transports.
 *
 *   Local cache ─ Sync queue ─ Sync engine ─┬─ Nostr relays     (upstream)
 *                                           └─ Bluetooth share  (peer)
 */

import type { Event as NostrEvent } from "nostr-tools";
import { connectivityMonitor } from "./ConnectivityMonitor";
import { SyncEngine, type WireOperation } from "./SyncEngine";
import { NearbyShareTransport } from "./transports/NearbyShareTransport";
import { NostrTransport } from "./transports/NostrTransport";
import type { EntityType } from "./types";

export { connectivityMonitor } from "./ConnectivityMonitor";
export type { ConnectivityState } from "./ConnectivityMonitor";
export type { EnqueueResult, WireOperation } from "./SyncEngine";
export { getCacheEntriesByScope } from "./db";
export type * from "./types";
export type { ImportSummary, ShareOutcome } from "./transports/NearbyShareTransport";

/** The application's sync engine. */
export const syncEngine = new SyncEngine({ connectivity: connectivityMonitor });

/** Peer transport: exchange queued operations with a nearby device over Bluetooth/AirDrop. */
export const nearbyShare = new NearbyShareTransport(syncEngine);

let initialized = false;

/** Call once at app startup to wire up transports and start the engine. */
export function initSync(): void {
  if (initialized || typeof indexedDB === "undefined") return;
  initialized = true;
  connectivityMonitor.start();
  syncEngine.registerTransport(new NostrTransport());
  syncEngine.registerTransport(nearbyShare);
  void syncEngine.start().catch(() => {
    // Storage unavailable (e.g. private mode): the app still works online.
  });
}

/** Wrap a locally signed Nostr event as a create operation. */
export function createEventOperation(
  entityType: EntityType,
  scope: string,
  event: NostrEvent,
): WireOperation {
  return {
    operationId: crypto.randomUUID(),
    operationType: "create",
    entityType,
    entityId: event.id,
    scope,
    payload: { event },
    createdAt: new Date().toISOString(),
  };
}
