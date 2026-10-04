/**
 * IndexedDB storage for the offline sync system (no external dependency).
 *
 *   sync_queue  — SyncOperations (the outbox). Keyed by operationId, with a
 *                 UNIQUE index on entityId, so duplicates are rejected
 *                 atomically by the database itself.
 *   local_cache — cached entities for offline display.
 *   sync_meta   — pull cursors.
 *
 * Treat everything here as sensitive: never log records from these stores.
 */

import type { CacheEntry, SyncOperation, SyncStatus } from "./types";

const DB_NAME = "spill_offline";
const DB_VERSION = 1;
const QUEUE_STORE = "sync_queue";
const CACHE_STORE = "local_cache";
const META_STORE = "sync_meta";

let dbPromise: Promise<IDBDatabase> | null = null;

// ---- Database Lifecycle ---------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: "operationId" });
        queue.createIndex("status", "status", { unique: false });
        queue.createIndex("entityId", "entityId", { unique: true });
      }

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const cache = db.createObjectStore(CACHE_STORE, { keyPath: "entityId" });
        cache.createIndex("scope", "scope", { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the schema: let it proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(new Error("Could not open offline database."));
    };
  });

  return dbPromise;
}

/** Close and delete the database. Used by tests. */
export async function resetOfflineDb(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/**
 * Run `work` inside one transaction and resolve with its result once the
 * transaction has committed. Reads and writes in `work` are atomic.
 */
async function inTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted."));
    tx.onerror = (event) => {
      // Let onabort report the error; prevent it bubbling to window.onerror.
      event.preventDefault();
    };
    Promise.resolve(work(tx.objectStore(storeName))).then(
      (value) => {
        result = value;
      },
      (error) => {
        try {
          tx.abort();
        } catch {
          // already finished
        }
        reject(error);
      },
    );
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Sync Queue (Outbox) --------------------------------------------------

/**
 * Insert an operation unless one with the same operationId OR entityId is
 * already queued. Returns false for duplicates. Atomic.
 */
export async function insertOperationIfAbsent(op: SyncOperation): Promise<boolean> {
  try {
    await inTransaction(QUEUE_STORE, "readwrite", (store) => request(store.add(op)));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "ConstraintError") return false;
    throw error;
  }
}

export async function getOperation(operationId: string): Promise<SyncOperation | undefined> {
  return inTransaction(QUEUE_STORE, "readonly", (store) => request(store.get(operationId)));
}

export async function getOperationByEntityId(entityId: string): Promise<SyncOperation | undefined> {
  return inTransaction(QUEUE_STORE, "readonly", (store) =>
    request(store.index("entityId").get(entityId)),
  );
}

export async function getOperationsByStatus(...statuses: SyncStatus[]): Promise<SyncOperation[]> {
  return inTransaction(QUEUE_STORE, "readonly", async (store) => {
    const index = store.index("status");
    const groups = await Promise.all(statuses.map((s) => request(index.getAll(s))));
    return groups.flat();
  });
}

export async function getAllOperations(): Promise<SyncOperation[]> {
  return inTransaction(QUEUE_STORE, "readonly", (store) => request(store.getAll()));
}

/**
 * Atomically read-modify-write one operation. `mutate` returns the new record
 * or null to leave it untouched. Resolves with the stored record.
 */
export async function updateOperation(
  operationId: string,
  mutate: (op: SyncOperation) => SyncOperation | null,
): Promise<SyncOperation | undefined> {
  return inTransaction(QUEUE_STORE, "readwrite", async (store) => {
    const current = await request<SyncOperation | undefined>(store.get(operationId));
    if (!current) return undefined;
    const next = mutate(current);
    if (!next) return current;
    await request(store.put(next));
    return next;
  });
}

/** Delete synced operations whose syncedAt is older than `cutoffIso`. */
export async function pruneSyncedOperations(cutoffIso: string): Promise<number> {
  return inTransaction(QUEUE_STORE, "readwrite", async (store) => {
    const synced = await request<SyncOperation[]>(store.index("status").getAll("synced"));
    const stale = synced.filter((op) => (op.syncedAt ?? op.createdAt) < cutoffIso);
    await Promise.all(stale.map((op) => request(store.delete(op.operationId))));
    return stale.length;
  });
}

// ---- Local Cache ----------------------------------------------------------

export async function putCacheEntries(entries: CacheEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await inTransaction(CACHE_STORE, "readwrite", async (store) => {
    await Promise.all(entries.map((entry) => request(store.put(entry))));
  });
}

export async function getCacheEntriesByScope(scope: string): Promise<CacheEntry[]> {
  return inTransaction(CACHE_STORE, "readonly", (store) =>
    request(store.index("scope").getAll(scope)),
  );
}

/** Keep only the newest `keep` entries for a scope. */
export async function trimCacheScope(scope: string, keep: number): Promise<void> {
  await inTransaction(CACHE_STORE, "readwrite", async (store) => {
    const entries = await request<CacheEntry[]>(store.index("scope").getAll(scope));
    if (entries.length <= keep) return;
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await Promise.all(entries.slice(keep).map((e) => request(store.delete(e.entityId))));
  });
}

// ---- Sync Metadata --------------------------------------------------------

export async function getMeta(key: string): Promise<string | null> {
  const record = await inTransaction(META_STORE, "readonly", (store) =>
    request<{ key: string; value: string } | undefined>(store.get(key)),
  );
  return record?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await inTransaction(META_STORE, "readwrite", (store) => request(store.put({ key, value })));
}

/** Close the connection without deleting data (simulates an app restart in tests). */
export async function closeOfflineDb(): Promise<void> {
  if (!dbPromise) return;
  (await dbPromise).close();
  dbPromise = null;
}
