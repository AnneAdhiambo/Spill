import type { Event } from "nostr-tools"
import { pool } from "./publish"
import { NOSTR_RELAYS } from "./config"

/**
 * Her NostrTransport only writes to relays.ts DEFAULT_RELAYS (damus, nostr.band), not to our local
 * relay (relays.ts is not ours to edit). So the same signed event is ALSO sent straight to
 * VITE_NOSTR_RELAYS. Set false to stop.
 */
export const PUBLISH_DIRECT_TO_LOCAL = true

export type RelayResult = { relay: string; accepted: boolean; message: string }

const TIMEOUT_MS = 8000

export async function publishToRelays(event: Event, relays: string[] = NOSTR_RELAYS): Promise<RelayResult[]> {
  return Promise.all(
    pool.publish(relays, event).map(async (p, i): Promise<RelayResult> => {
      const relay = relays[i]
      try {
        const message = await Promise.race([
          p,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no answer (timeout)")), TIMEOUT_MS)),
        ])
        return { relay, accepted: true, message: message || "OK" }
      } catch (err) {
        return { relay, accepted: false, message: err instanceof Error ? err.message : String(err) }
      }
    }),
  )
}

// ---- small outbox in IndexedDB: signed events waiting for a relay -----------

const DB_NAME = "spill_publish"
const STORE = "outbox"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally { db.close() }
}

export type OutboxEntry = { id: string; event: Event }
export const outboxAdd = (event: Event) => tx("readwrite", (s) => s.put({ id: event.id, event } satisfies OutboxEntry))
export const outboxRemove = (id: string) => tx("readwrite", (s) => s.delete(id))
export const outboxAll = () => tx<OutboxEntry[]>("readonly", (s) => s.getAll())

let flushing = false
/** Sends every waiting event; removes an entry only after a relay accepted it. */
export async function flushOutbox(): Promise<void> {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const entry of await outboxAll()) {
      const results = await publishToRelays(entry.event)
      if (results.some((r) => r.accepted)) await outboxRemove(entry.id)
    }
  } catch (err) {
    console.warn("Outbox flush failed", err)
  } finally { flushing = false }
}

let started = false
/** Call once at startup: flush on load, on `online`, and when the tab becomes visible. */
export function startOutbox(): void {
  if (started || typeof indexedDB === "undefined") return
  started = true
  const run = () => { void flushOutbox() }
  window.addEventListener("online", run)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") run() })
  run()
}
