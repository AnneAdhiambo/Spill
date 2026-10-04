import { finalizeEvent, generateSecretKey, type Event } from "nostr-tools";
import { communityTags } from "../../nostr/communityTags";
import type { ConnectivitySource } from "../SyncEngine";
import { TransportError, type PullResult, type SyncOperation, type Transport } from "../types";

export const SECRET_KEY = generateSecretKey();

export function signPost(content: string, communityId = "group-0", createdAt = Math.floor(Date.now() / 1000)): Event {
  return finalizeEvent({ kind: 1, created_at: createdAt, tags: communityTags(communityId), content }, SECRET_KEY);
}

export function signJoin(communityId = "group-0"): Event {
  return finalizeEvent(
    { kind: 9021, created_at: Math.floor(Date.now() / 1000), tags: communityTags(communityId), content: "" },
    SECRET_KEY,
  );
}

export function wireOp(event: Event, overrides: Record<string, unknown> = {}) {
  return {
    operationId: crypto.randomUUID(),
    operationType: "create",
    entityType: event.kind === 9021 ? "community_join" : "community_post",
    entityId: event.id,
    scope: event.tags.find((t) => t[0] === "h")![1],
    payload: { event },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export class FakeConnectivity implements ConnectivitySource {
  state: "online" | "offline" | "unknown" = "online";
  private listeners = new Set<(s: "online" | "offline" | "unknown") => void>();
  getState() {
    return this.state;
  }
  onChange(listener: (s: "online" | "offline" | "unknown") => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  set(state: "online" | "offline") {
    this.state = state;
    this.listeners.forEach((l) => l(state));
  }
}

/**
 * Behaves like a Nostr relay: stores events keyed by id, so publishing the
 * same event twice stores it once (NIP-01). `mode` simulates failures.
 */
export class FakeRelayTransport implements Transport {
  readonly name = "fake-relay";
  readonly role = "upstream" as const;
  readonly stored = new Map<string, Event>();
  sendCalls = 0;
  available = true;
  mode: "ok" | "down" | "reject" | "lose-response" = "ok";
  pull?: (scope: string, cursor: string | null) => Promise<PullResult>;

  isAvailable() {
    return this.available;
  }

  async send(op: SyncOperation) {
    this.sendCalls += 1;
    if (this.mode === "down") throw new TransportError("No relay confirmed the event.");
    if (this.mode === "reject") throw new TransportError("invalid: bad event", true);
    this.stored.set(op.payload.event.id, op.payload.event);
    if (this.mode === "lose-response") {
      this.mode = "ok"; // connection drops once, after the relay stored the event
      throw new TransportError("Relay timeout");
    }
  }
}

export class Clock {
  t = Date.now();
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}
