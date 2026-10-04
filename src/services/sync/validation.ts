/**
 * Operation validation.
 *
 * Every operation passes through `validateOperation` before it enters the
 * queue — whether the user just created it or a nearby device handed it
 * over. Input is treated as untrusted JSON: the result is a freshly built
 * object containing only known fields, never the input object itself.
 *
 * Authorization model: operations carry signed Nostr events, so they are
 * self-authorizing. A forwarding device cannot alter content or impersonate
 * the author without invalidating the signature.
 */

import { verifyEvent, type Event as NostrEvent } from "nostr-tools";
import type { EntityType, SyncOperation, SyncStatus } from "./types";

/** Nostr kind expected for each entity type. */
const KIND_FOR_ENTITY: Record<EntityType, number> = {
  community_post: 1,
  community_join: 9021,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/;
const HEX128_RE = /^[0-9a-f]{128}$/;
const SCOPE_RE = /^[A-Za-z0-9_-]{1,64}$/;

const MAX_CONTENT_LENGTH = 16_000;
const MAX_TAGS = 20;
const MAX_FUTURE_SKEW_S = 10 * 60;
/** Store-and-forward is for recent offline activity, not archive replay. */
const MAX_AGE_S = 30 * 24 * 60 * 60;

export type ValidationResult =
  | { ok: true; operation: SyncOperation }
  | { ok: false; reason: string };

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rebuild a Nostr event from untrusted input, keeping only NIP-01 fields. */
function sanitizeEvent(raw: unknown): NostrEvent | null {
  if (!isObject(raw)) return null;
  const { id, pubkey, sig, kind, created_at, content, tags } = raw;
  if (typeof id !== "string" || !HEX64_RE.test(id)) return null;
  if (typeof pubkey !== "string" || !HEX64_RE.test(pubkey)) return null;
  if (typeof sig !== "string" || !HEX128_RE.test(sig)) return null;
  if (typeof kind !== "number" || !Number.isInteger(kind)) return null;
  if (typeof created_at !== "number" || !Number.isInteger(created_at)) return null;
  if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) return null;
  if (!Array.isArray(tags) || tags.length > MAX_TAGS) return null;
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length > 8) return null;
    if (!tag.every((part) => typeof part === "string" && part.length <= 512)) return null;
  }
  return {
    id,
    pubkey,
    sig,
    kind,
    created_at,
    content,
    tags: (tags as string[][]).map((tag) => [...tag]),
  };
}

/**
 * Validate an operation and return a clean copy with local bookkeeping
 * reset. `nowMs` is injectable for tests.
 */
export function validateOperation(
  raw: unknown,
  origin: SyncOperation["origin"],
  nowMs: number = Date.now(),
): ValidationResult {
  if (!isObject(raw)) return fail("Operation must be an object.");

  const { operationId, operationType, entityType, entityId, scope, payload, createdAt } = raw;

  if (typeof operationId !== "string" || !UUID_RE.test(operationId)) {
    return fail("Invalid operation id.");
  }
  if (operationType !== "create") return fail("Unsupported operation type.");
  if (typeof entityType !== "string" || !(entityType in KIND_FOR_ENTITY)) {
    return fail("Unsupported entity type.");
  }
  if (typeof scope !== "string" || !SCOPE_RE.test(scope)) return fail("Invalid scope.");
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    return fail("Invalid creation time.");
  }
  if (!isObject(payload)) return fail("Missing payload.");

  const event = sanitizeEvent(payload.event);
  if (!event) return fail("Malformed Nostr event.");

  const type = entityType as EntityType;
  if (event.kind !== KIND_FOR_ENTITY[type]) return fail("Event kind does not match entity type.");
  if (entityId !== event.id) return fail("Entity id does not match event id.");

  const communityTag = event.tags.find((tag) => tag[0] === "h");
  if (communityTag?.[1] !== scope) return fail("Event is not tagged for this community.");

  const nowS = Math.floor(nowMs / 1000);
  if (event.created_at > nowS + MAX_FUTURE_SKEW_S) return fail("Event timestamp is in the future.");
  if (event.created_at < nowS - MAX_AGE_S) return fail("Event is too old to forward.");

  // Checks the id hash and the Schnorr signature. `event` is a fresh object,
  // so no verification result cached on the input can be reused.
  if (!verifyEvent(event)) return fail("Invalid event signature.");

  const status: SyncStatus = "pending";
  return {
    ok: true,
    operation: {
      operationId: operationId.toLowerCase(),
      operationType: "create",
      entityType: type,
      entityId: event.id,
      scope,
      payload: { event },
      createdAt: new Date(createdAt).toISOString(),
      status,
      attempts: 0,
      origin,
    },
  };
}
