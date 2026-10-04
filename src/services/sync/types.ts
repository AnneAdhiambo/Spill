/**
 * Sync Engine Types
 *
 * Transport-agnostic types for the store-and-forward synchronization system.
 * These types are shared across all transports (Nostr relays, Bluetooth, ...).
 */

import type { Event as NostrEvent } from "nostr-tools";

// ---- Sync Operation Status ------------------------------------------------

/**
 *   pending  — saved locally, not yet attempted (or waiting for a transport)
 *   syncing  — an upstream transport is sending it right now
 *   retrying — the last attempt failed; another attempt is scheduled
 *   synced   — an upstream transport confirmed delivery
 *   failed   — gave up (permanent rejection or retry budget used up).
 *              Kept in the queue until the user retries it.
 */
export type SyncStatus = "pending" | "syncing" | "retrying" | "synced" | "failed";

// ---- Entity Types ---------------------------------------------------------

/** The types of entities the app can create/sync offline. */
export type EntityType = "community_post" | "community_join";

/** The types of operations that can be queued. All current entities are create-only. */
export type OperationType = "create";

/** Where an operation entered this device's queue. */
export type OperationOrigin = "local" | "peer";

// ---- Sync Operation -------------------------------------------------------

/**
 * The payload of every current operation is a signed Nostr event. It is
 * signed once, on the author's device, and forwarded byte-for-byte by every
 * transport. Never re-sign during sync; never store private keys here.
 */
export interface NostrEventPayload {
  event: NostrEvent;
}

/**
 * A single queued operation.
 *
 * `operationId` is a UUID generated on the author's device. Together with
 * `entityId` (the Nostr event id) it makes the queue idempotent: the same
 * operation arriving through several transports is stored only once.
 */
export interface SyncOperation {
  operationId: string;
  operationType: OperationType;
  entityType: EntityType;
  /** For Nostr-backed entities, the event id. */
  entityId: string;
  /** Community the entity belongs to (also present in the event's `h` tag). */
  scope: string;
  payload: NostrEventPayload;
  /** ISO-8601, when the operation was created on the author's device. */
  createdAt: string;
  status: SyncStatus;
  /** Upstream send attempts made by this device. */
  attempts: number;
  origin: OperationOrigin;
  lastAttemptAt?: string;
  /** Earliest time (epoch ms) the next attempt may run. */
  nextAttemptAt?: number;
  /** Short, non-sensitive description of the last failure. */
  lastError?: string;
  /** Upstream transport that confirmed delivery. */
  syncedVia?: string;
  syncedAt?: string;
}

// ---- Local Cache ----------------------------------------------------------

/**
 * A cached entity for offline display.
 * Only content appropriate for offline use is cached (community posts the
 * user has viewed) — never keys, tokens or wallet data.
 */
export interface CacheEntry {
  entityId: string;
  entityType: EntityType;
  data: Record<string, unknown>;
  /** ISO-8601 */
  updatedAt: string;
  /** Scope key (communityId) for filtered retrieval. */
  scope: string;
}

// ---- Transport Interface --------------------------------------------------

/**
 * A transport moves SyncOperations off this device. The sync engine never
 * cares *how*.
 *
 *   upstream — delivers to the network of record (Nostr relays). A successful
 *              send means the operation is synced.
 *   peer     — hands copies to a nearby device (Bluetooth). It never marks
 *              anything synced: the receiving device puts the copy into its
 *              own queue and syncs it upstream later.
 */
export interface Transport {
  readonly name: string;
  readonly role: "upstream" | "peer";

  /** True if this transport can currently attempt delivery. */
  isAvailable(): boolean;

  /** Upstream transports: deliver one operation; resolve only when the remote confirms. */
  send?(operation: SyncOperation): Promise<void>;

  /**
   * Upstream transports: fetch remote changes for a scope since `cursor`.
   * The cursor is opaque to the engine.
   */
  pull?(scope: string, cursor: string | null): Promise<PullResult>;
}

export interface PullResult {
  entries: CacheEntry[];
  cursor: string | null;
}

/** Thrown by transports. `permanent` failures are not retried automatically. */
export class TransportError extends Error {
  readonly permanent: boolean;

  constructor(message: string, permanent = false) {
    super(message);
    this.name = "TransportError";
    this.permanent = permanent;
  }
}

// ---- Sync Engine Events ---------------------------------------------------

export type SyncEventType =
  | "operation:queued"
  | "operation:syncing"
  | "operation:synced"
  | "operation:retrying"
  | "operation:failed"
  | "connectivity:changed"
  | "pull:complete";

export interface SyncEvent {
  type: SyncEventType;
  operationId?: string;
  scope?: string;
}

export type SyncEventListener = (event: SyncEvent) => void;
