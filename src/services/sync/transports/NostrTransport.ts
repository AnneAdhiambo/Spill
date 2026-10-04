/**
 * Nostr Relay Transport (upstream)
 *
 * Publishes the pre-signed event stored in each operation — never re-signs —
 * and resolves only when at least one relay answers OK. Relays deduplicate by
 * event id (NIP-01), and an event id is the hash of its signed content, so a
 * retry after a lost response cannot create a second post: the relay answers
 * `OK true "duplicate: ..."`.
 *
 * Pull uses the same community filter as communityService. Nostr has no
 * server sequence numbers, so the cursor is the newest `created_at` seen,
 * re-queried with an overlap window; cache writes are keyed by event id, so
 * the overlap is harmless.
 */

import { SimplePool, type Event, type Filter } from "nostr-tools";
import { DEFAULT_RELAYS } from "../../nostr/relays";
import { communityAddress } from "../../nostr/communityTags";
import { TransportError, type CacheEntry, type PullResult, type SyncOperation, type Transport } from "../types";

const PUBLISH_TIMEOUT_MS = 8_000;
const QUERY_TIMEOUT_MS = 10_000;
const CURSOR_OVERLAP_S = 5 * 60;

/** Relay rejections that will not succeed on retry (NIP-01 OK prefixes). */
const PERMANENT_PREFIXES = ["invalid:", "blocked:", "pow:", "restricted:"];

export class NostrTransport implements Transport {
  readonly name = "nostr";
  readonly role = "upstream" as const;

  constructor(
    private readonly relays: string[] = DEFAULT_RELAYS,
    private readonly pool: Pick<SimplePool, "publish" | "querySync"> = new SimplePool(),
  ) {}

  isAvailable(): boolean {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  async send(operation: SyncOperation): Promise<void> {
    const event = operation.payload.event;
    try {
      await withTimeout(Promise.any(this.pool.publish(this.relays, event)), PUBLISH_TIMEOUT_MS);
    } catch (error) {
      const reasons = error instanceof AggregateError ? error.errors.map(describe) : [describe(error)];
      const permanent =
        reasons.length > 0 && reasons.every((r) => PERMANENT_PREFIXES.some((p) => r.startsWith(p)));
      throw new TransportError(
        permanent ? `Relays rejected the event: ${reasons[0]}` : "No relay confirmed the event.",
        permanent,
      );
    }
  }

  async pull(scope: string, cursor: string | null): Promise<PullResult> {
    const since = cursor ? Number(cursor) - CURSOR_OVERLAP_S : undefined;
    const filter: Filter = {
      kinds: [1],
      "#a": [communityAddress(scope)],
      limit: since ? 100 : 50,
      ...(since ? { since } : {}),
    };

    // Throws on timeout so the engine keeps the old cursor.
    const events = await withTimeout(this.pool.querySync(this.relays, filter), QUERY_TIMEOUT_MS);

    const entries: CacheEntry[] = events.map((ev: Event) => ({
      entityId: ev.id,
      entityType: "community_post",
      data: {
        id: ev.id,
        content: ev.content,
        pubkey: ev.pubkey,
        createdAt: ev.created_at,
        likes: 0,
        comments: 0,
      },
      updatedAt: new Date(ev.created_at * 1000).toISOString(),
      scope,
    }));

    const newest = events.reduce((max, ev) => Math.max(max, ev.created_at), cursor ? Number(cursor) : 0);
    return { entries, cursor: newest > 0 ? String(newest) : cursor };
  }
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Relay timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
