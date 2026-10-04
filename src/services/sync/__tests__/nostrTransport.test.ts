import { describe, expect, it } from "vitest";
import type { Event, Filter } from "nostr-tools";
import { NostrTransport } from "../transports/NostrTransport";
import { TransportError, type SyncOperation } from "../types";
import { signPost } from "./helpers";

function opFor(event: Event): SyncOperation {
  return {
    operationId: crypto.randomUUID(),
    operationType: "create",
    entityType: "community_post",
    entityId: event.id,
    scope: "group-0",
    payload: { event },
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    origin: "local",
  };
}

/** Per relay: resolve with an OK reason, or reject with an error. */
function fakePool(outcomes: Array<() => Promise<string>>, events: Event[] = []) {
  const published: Event[] = [];
  const filters: Filter[] = [];
  return {
    published,
    filters,
    publish: (_relays: string[], event: Event) => {
      published.push(event);
      return outcomes.map((o) => o());
    },
    querySync: async (_relays: string[], filter: Filter) => {
      filters.push(filter);
      return events;
    },
  };
}

describe("NostrTransport", () => {
  it("treats a relay's 'duplicate:' OK as success (idempotent republish)", async () => {
    const pool = fakePool([() => Promise.resolve("duplicate: already have this event")]);
    const transport = new NostrTransport(["wss://a"], pool as never);
    const event = signPost("x");
    await expect(transport.send(opFor(event))).resolves.toBeUndefined();
    expect(pool.published[0]).toBe(event); // same signed object, not re-signed
  });

  it("succeeds if any one relay confirms", async () => {
    const pool = fakePool([() => Promise.reject(new Error("publish timed out")), () => Promise.resolve("")]);
    await expect(new NostrTransport(["wss://a", "wss://b"], pool as never).send(opFor(signPost("x")))).resolves.toBeUndefined();
  });

  it("reports transient failures as retryable", async () => {
    const pool = fakePool([() => Promise.reject("connection failure: offline")]);
    const error = await new NostrTransport(["wss://a"], pool as never).send(opFor(signPost("x"))).catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.permanent).toBe(false);
  });

  it("reports unanimous protocol rejections as permanent", async () => {
    const pool = fakePool([
      () => Promise.reject(new Error("invalid: bad signature")),
      () => Promise.reject(new Error("blocked: not allowed")),
    ]);
    const error = await new NostrTransport(["wss://a", "wss://b"], pool as never).send(opFor(signPost("x"))).catch((e) => e);
    expect(error.permanent).toBe(true);
  });

  it("pulls with the community filter and advances the cursor", async () => {
    const events = [signPost("a", "group-0", 1_700_000_100), signPost("b", "group-0", 1_700_000_200)];
    const pool = fakePool([], events);
    const transport = new NostrTransport(["wss://a"], pool as never);

    const first = await transport.pull("group-0", null);
    expect(pool.filters[0]["#a"]).toEqual([`39000:${"0".repeat(64)}:group-0`]);
    expect(pool.filters[0].since).toBeUndefined();
    expect(first.cursor).toBe("1700000200");
    expect(first.entries.map((e) => e.scope)).toEqual(["group-0", "group-0"]);

    await transport.pull("group-0", first.cursor);
    expect(pool.filters[1].since).toBe(1_700_000_200 - 300); // overlap window
  });
});
