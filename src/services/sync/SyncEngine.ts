/**
 * Sync Engine
 *
 * The one synchronization coordinator. It works on generic SyncOperations
 * and does not care whether an operation was created by the user or handed
 * over by a nearby device, or which transport finally delivers it.
 *
 *   enqueue(op) ─► validate ─► dedupe (operationId + entityId) ─► persist
 *                                                                   │
 *   flush() ◄───────────── connectivity / timer / user ─────────────┘
 *     └─► upstream transport.send(op) ─► remote confirms ─► "synced"
 *                                     └► failure ─► "retrying" (backoff)
 *                                                └► "failed" (bounded)
 *
 *   pull(scope) ─► upstream transport.pull(scope, cursor) ─► local cache
 */

import {
  getAllOperations,
  getMeta,
  getOperation,
  getOperationsByStatus,
  insertOperationIfAbsent,
  pruneSyncedOperations,
  putCacheEntries,
  setMeta,
  trimCacheScope,
  updateOperation,
} from "./db";
import { validateOperation } from "./validation";
import {
  TransportError,
  type SyncEvent,
  type SyncEventListener,
  type SyncOperation,
  type SyncStatus,
  type Transport,
} from "./types";

// ---- Configuration --------------------------------------------------------

export interface ConnectivitySource {
  getState(): "online" | "offline" | "unknown";
  onChange(listener: (state: "online" | "offline" | "unknown") => void): () => void;
}

export interface SyncEngineOptions {
  connectivity: ConnectivitySource;
  /** Upstream attempts before an operation is marked failed. */
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  flushIntervalMs?: number;
  pullIntervalMs?: number;
  /** How long synced operations are kept (for status display and dedupe). */
  syncedRetentionMs?: number;
  /** Max cached entities per scope. */
  cacheLimitPerScope?: number;
  now?: () => number;
  random?: () => number;
}

export type EnqueueResult =
  | { accepted: true; operation: SyncOperation }
  | { accepted: false; duplicate: true }
  | { accepted: false; duplicate: false; reason: string };

/** Fields that travel between devices. Local bookkeeping is never shared. */
export type WireOperation = Pick<
  SyncOperation,
  "operationId" | "operationType" | "entityType" | "entityId" | "scope" | "payload" | "createdAt"
>;

const FLUSH_LOCK = "spill-sync-flush";

// ---- Sync Engine ----------------------------------------------------------

export class SyncEngine {
  private readonly connectivity: ConnectivitySource;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly flushIntervalMs: number;
  private readonly pullIntervalMs: number;
  private readonly syncedRetentionMs: number;
  private readonly cacheLimitPerScope: number;
  private readonly now: () => number;
  private readonly random: () => number;

  private transports: Transport[] = [];
  private listeners = new Set<SyncEventListener>();
  private watchedScopes = new Set<string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private unsubscribeConnectivity: (() => void) | null = null;
  private flushing: Promise<void> | null = null;
  private flushRequested = false;
  private started = false;

  constructor(options: SyncEngineOptions) {
    this.connectivity = options.connectivity;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseBackoffMs = options.baseBackoffMs ?? 5_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60_000;
    this.flushIntervalMs = options.flushIntervalMs ?? 20_000;
    this.pullIntervalMs = options.pullIntervalMs ?? 60_000;
    this.syncedRetentionMs = options.syncedRetentionMs ?? 7 * 24 * 60 * 60_000;
    this.cacheLimitPerScope = options.cacheLimitPerScope ?? 200;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  // ---- Transports ---------------------------------------------------------

  registerTransport(transport: Transport): void {
    if (!this.transports.some((t) => t.name === transport.name)) {
      this.transports.push(transport);
    }
  }

  unregisterTransport(name: string): void {
    this.transports = this.transports.filter((t) => t.name !== name);
  }

  private upstreamTransports(): Transport[] {
    return this.transports.filter((t) => t.role === "upstream" && t.isAvailable());
  }

  // ---- Lifecycle ----------------------------------------------------------

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.recoverInterrupted();
    await pruneSyncedOperations(new Date(this.now() - this.syncedRetentionMs).toISOString());

    this.unsubscribeConnectivity = this.connectivity.onChange((state) => {
      this.emit({ type: "connectivity:changed" });
      if (state === "online") {
        void this.flush();
        void this.pullWatched();
      }
    });

    this.timers.push(setInterval(() => void this.flush(), this.flushIntervalMs));
    this.timers.push(setInterval(() => void this.pullWatched(), this.pullIntervalMs));

    void this.flush();
  }

  stop(): void {
    this.started = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
  }

  /** An app closed mid-send leaves operations in "syncing"; requeue them. */
  private async recoverInterrupted(): Promise<void> {
    const stuck = await getOperationsByStatus("syncing");
    for (const op of stuck) {
      await updateOperation(op.operationId, (current) =>
        current.status === "syncing" ? { ...current, status: "retrying", nextAttemptAt: 0 } : null,
      );
    }
  }

  // ---- Enqueue ------------------------------------------------------------

  /**
   * The single entry point into the queue for every source. Validates,
   * deduplicates by operationId and entityId, persists, then kicks a flush.
   */
  async enqueue(raw: unknown, origin: SyncOperation["origin"] = "local"): Promise<EnqueueResult> {
    const validation = validateOperation(raw, origin, this.now());
    if (!validation.ok) {
      return { accepted: false, duplicate: false, reason: validation.reason };
    }

    const inserted = await insertOperationIfAbsent(validation.operation);
    if (!inserted) return { accepted: false, duplicate: true };
    await this.projectToCache(validation.operation);

    this.emit({ type: "operation:queued", operationId: validation.operation.operationId });
    void this.flush();
    return { accepted: true, operation: validation.operation };
  }

  /**
   * Make a post received from a nearby device visible in the feed before it
   * reaches a relay. (The user's own posts are already shown from local storage.)
   */
  private async projectToCache(op: SyncOperation): Promise<void> {
    if (op.origin !== "peer" || op.entityType !== "community_post") return;
    const { event } = op.payload;
    await putCacheEntries([
      {
        entityId: event.id,
        entityType: "community_post",
        data: { id: event.id, content: event.content, pubkey: event.pubkey, createdAt: event.created_at, likes: 0, comments: 0 },
        updatedAt: new Date(event.created_at * 1000).toISOString(),
        scope: op.scope,
      },
    ]);
  }

  // ---- Flush (push pending operations) ------------------------------------

  /**
   * Send every due operation through upstream transports. Concurrent calls
   * coalesce; a call made during a flush schedules one more pass.
   */
  flush(): Promise<void> {
    if (this.flushing) {
      this.flushRequested = true;
      return this.flushing;
    }

    this.flushing = (async () => {
      try {
        do {
          this.flushRequested = false;
          await this.withFlushLock(() => this.flushOnce());
        } while (this.flushRequested);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  private async flushOnce(): Promise<void> {
    if (this.connectivity.getState() === "offline") return;
    if (this.upstreamTransports().length === 0) return;

    const due = (await getOperationsByStatus("pending", "retrying"))
      .filter((op) => (op.nextAttemptAt ?? 0) <= this.now())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const op of due) {
      await this.attempt(op.operationId);
    }
  }

  /** Across tabs, only one flushes at a time (the relay would dedupe anyway). */
  private async withFlushLock(work: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return work();
    await locks.request(FLUSH_LOCK, { ifAvailable: true }, async (lock) => {
      if (lock) await work();
    });
  }

  /**
   * Try one operation right now, ignoring backoff. Returns its resulting
   * status so callers can tell the user the truth ("posted" vs "saved").
   */
  async syncNow(operationId: string): Promise<SyncStatus | undefined> {
    if (this.flushing) await this.flushing;
    const op = await getOperation(operationId);
    if (!op || op.status === "synced") return op?.status;
    if (this.connectivity.getState() !== "offline") {
      await this.withFlushLock(() => this.attempt(operationId));
    }
    return (await getOperation(operationId))?.status;
  }

  /** User-initiated retry of a failed operation: grants a fresh retry budget. */
  async retry(operationId: string): Promise<void> {
    await updateOperation(operationId, (op) =>
      op.status === "failed"
        ? { ...op, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: undefined }
        : null,
    );
    this.emit({ type: "operation:queued", operationId });
    await this.flush();
  }

  private async attempt(operationId: string): Promise<void> {
    const transports = this.upstreamTransports();
    if (transports.length === 0) return;

    // Claim the operation; skip it if another pass already did.
    const claimed = await updateOperation(operationId, (op) =>
      op.status === "pending" || op.status === "retrying"
        ? { ...op, status: "syncing", lastAttemptAt: new Date(this.now()).toISOString() }
        : null,
    );
    if (!claimed || claimed.status !== "syncing") return;
    this.emit({ type: "operation:syncing", operationId });

    let permanentFailures = 0;
    let lastError = "Unknown error";

    for (const transport of transports) {
      try {
        await transport.send!(claimed);
        await updateOperation(operationId, (op) => ({
          ...op,
          status: "synced",
          attempts: op.attempts + 1,
          lastError: undefined,
          nextAttemptAt: undefined,
          syncedVia: transport.name,
          syncedAt: new Date(this.now()).toISOString(),
        }));
        this.emit({ type: "operation:synced", operationId });
        return;
      } catch (error) {
        // Only the message is kept — never the payload.
        lastError = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        if (error instanceof TransportError && error.permanent) permanentFailures += 1;
      }
    }

    const attempts = claimed.attempts + 1;
    const giveUp = permanentFailures === transports.length || attempts >= this.maxAttempts;
    await updateOperation(operationId, (op) => ({
      ...op,
      status: giveUp ? "failed" : "retrying",
      attempts,
      lastError,
      nextAttemptAt: giveUp ? undefined : this.now() + this.backoffMs(attempts),
    }));
    this.emit({ type: giveUp ? "operation:failed" : "operation:retrying", operationId });
  }

  /** Exponential backoff with ±20% jitter, capped. */
  backoffMs(attempts: number): number {
    const exp = Math.min(this.baseBackoffMs * 2 ** (attempts - 1), this.maxBackoffMs);
    return Math.round(exp * (0.8 + this.random() * 0.4));
  }

  // ---- Pull (fetch remote changes) ----------------------------------------

  /** Keep a scope (community) fresh in the background. */
  watchScope(scope: string): void {
    this.watchedScopes.add(scope);
  }

  private async pullWatched(): Promise<void> {
    for (const scope of this.watchedScopes) {
      await this.pull(scope);
    }
  }

  /**
   * Fetch changes for a scope since the last successful pull and store them
   * in the local cache. Returns true if at least one transport succeeded.
   */
  async pull(scope: string): Promise<boolean> {
    if (this.connectivity.getState() === "offline") return false;

    let succeeded = false;
    for (const transport of this.upstreamTransports()) {
      if (!transport.pull) continue;
      const cursorKey = `pull:${transport.name}:${scope}`;
      try {
        const { entries, cursor } = await transport.pull(scope, await getMeta(cursorKey));
        await putCacheEntries(entries);
        await trimCacheScope(scope, this.cacheLimitPerScope);
        if (cursor) await setMeta(cursorKey, cursor);
        succeeded = true;
      } catch {
        // Non-critical: the cache keeps serving; next pull retries.
      }
    }

    if (succeeded) this.emit({ type: "pull:complete", scope });
    return succeeded;
  }

  // ---- Peer exchange helpers (used by peer transports) --------------------

  /** Operations worth handing to a nearby device: everything not yet synced. */
  async getShareableOperations(): Promise<SyncOperation[]> {
    return getOperationsByStatus("pending", "retrying", "syncing", "failed");
  }

  toWire(op: SyncOperation): WireOperation {
    const { operationId, operationType, entityType, entityId, scope, payload, createdAt } = op;
    return { operationId, operationType, entityType, entityId, scope, payload, createdAt };
  }

  // ---- Queries (for UI) ---------------------------------------------------

  getAll(): Promise<SyncOperation[]> {
    return getAllOperations();
  }

  // ---- Events -------------------------------------------------------------

  on(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the engine.
      }
    }
  }
}
