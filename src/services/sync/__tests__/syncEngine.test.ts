import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeOfflineDb, getCacheEntriesByScope, getMeta, getOperation, resetOfflineDb } from "../db";
import { SyncEngine } from "../SyncEngine";
import type { SyncOperation } from "../types";
import { Clock, FakeConnectivity, FakeRelayTransport, signJoin, signPost, wireOp } from "./helpers";

let clock: Clock;
let connectivity: FakeConnectivity;
let relay: FakeRelayTransport;
let engine: SyncEngine;

function makeEngine() {
  const e = new SyncEngine({
    connectivity,
    now: clock.now,
    random: () => 0.5, // no jitter
    maxAttempts: 3,
    baseBackoffMs: 1_000,
    flushIntervalMs: 60_000_000,
    pullIntervalMs: 60_000_000,
  });
  e.registerTransport(relay);
  return e;
}

async function statusOf(operationId: string) {
  return (await getOperation(operationId))?.status;
}

beforeEach(async () => {
  await resetOfflineDb();
  clock = new Clock();
  connectivity = new FakeConnectivity();
  relay = new FakeRelayTransport();
  engine = makeEngine();
});

afterEach(() => engine.stop());

describe("offline creation", () => {
  it("persists the operation as pending without contacting the relay", async () => {
    connectivity.state = "offline";
    const op = wireOp(signPost("written offline"));

    const result = await engine.enqueue(op);
    await engine.flush();

    expect(result.accepted).toBe(true);
    expect(await statusOf(op.operationId)).toBe("pending");
    expect(relay.sendCalls).toBe(0);
    // Being offline must not burn the retry budget.
    expect((await getOperation(op.operationId))?.attempts).toBe(0);
  });

  it("syncNow reports pending, not synced, while offline", async () => {
    connectivity.state = "offline";
    const op = wireOp(signPost("hello"));
    await engine.enqueue(op);
    expect(await engine.syncNow(op.operationId)).toBe("pending");
  });
});

describe("reconnection", () => {
  it("syncs queued operations when connectivity returns and the relay confirms", async () => {
    connectivity.state = "offline";
    await engine.start();
    const op = wireOp(signPost("queued"));
    await engine.enqueue(op);
    expect(await statusOf(op.operationId)).toBe("pending");

    connectivity.set("online");
    await engine.flush();

    const stored = await getOperation(op.operationId);
    expect(stored?.status).toBe("synced");
    expect(stored?.syncedVia).toBe("fake-relay");
    expect(relay.stored.has(op.entityId)).toBe(true);
  });

  it("does not mark synced when the network flag says online but the relay is unreachable", async () => {
    relay.mode = "down";
    const op = wireOp(signPost("captive portal"));
    await engine.enqueue(op);
    await engine.flush();
    expect(await statusOf(op.operationId)).toBe("retrying");
  });

  it("publishes the original signed event unchanged", async () => {
    const event = signPost("signature must survive");
    await engine.enqueue(wireOp(event));
    await engine.flush();
    expect(JSON.parse(JSON.stringify(relay.stored.get(event.id)))).toEqual(JSON.parse(JSON.stringify(event)));
  });
});

describe("duplicate prevention", () => {
  it("retrying after a lost response does not create a second record", async () => {
    relay.mode = "lose-response";
    const op = wireOp(signPost("response lost"));
    await engine.enqueue(op);
    await engine.flush();

    expect(await statusOf(op.operationId)).toBe("retrying");
    expect(relay.stored.size).toBe(1); // the relay did process it

    clock.advance(10_000);
    await engine.flush();

    expect(await statusOf(op.operationId)).toBe("synced");
    expect(relay.sendCalls).toBe(2);
    expect(relay.stored.size).toBe(1); // same event id → same record
  });

  it("rejects the same operationId twice", async () => {
    connectivity.state = "offline";
    const op = wireOp(signPost("once"));
    expect((await engine.enqueue(op)).accepted).toBe(true);
    expect(await engine.enqueue(op)).toEqual({ accepted: false, duplicate: true });
    expect((await engine.getAll()).length).toBe(1);
  });

  it("rejects the same event under a different operationId", async () => {
    connectivity.state = "offline";
    const event = signPost("same event");
    await engine.enqueue(wireOp(event));
    expect((await engine.enqueue(wireOp(event))).accepted).toBe(false);
    expect((await engine.getAll()).length).toBe(1);
  });

  it("concurrent enqueues of one operation store it once", async () => {
    connectivity.state = "offline";
    const op = wireOp(signPost("race"));
    const results = await Promise.all([engine.enqueue(op), engine.enqueue(op), engine.enqueue(op)]);
    expect(results.filter((r) => r.accepted).length).toBe(1);
    expect((await engine.getAll()).length).toBe(1);
  });
});

describe("app restart", () => {
  it("pending operations survive closing and reopening the app", async () => {
    connectivity.state = "offline";
    const op = wireOp(signPost("survives restart"));
    await engine.enqueue(op);
    engine.stop();
    await closeOfflineDb();

    // "Reopen": fresh engine, fresh DB connection.
    connectivity = new FakeConnectivity();
    engine = makeEngine();
    await engine.start();
    await engine.flush();

    expect(await statusOf(op.operationId)).toBe("synced");
    expect(relay.stored.has(op.entityId)).toBe(true);
  });

  it("an operation interrupted mid-send is retried after restart", async () => {
    connectivity.state = "offline";
    const op = wireOp(signPost("interrupted"));
    await engine.enqueue(op);
    const { updateOperation } = await import("../db");
    await updateOperation(op.operationId, (o) => ({ ...o, status: "syncing" }));
    engine.stop();
    await closeOfflineDb();

    connectivity = new FakeConnectivity();
    engine = makeEngine();
    await engine.start();
    await engine.flush();

    expect(await statusOf(op.operationId)).toBe("synced");
  });
});

describe("multiple operations", () => {
  it("syncs A, B and C in creation order", async () => {
    connectivity.state = "offline";
    const order: string[] = [];
    const originalSend = relay.send.bind(relay);
    relay.send = async (op: SyncOperation) => {
      order.push(op.payload.event.content);
      return originalSend(op);
    };

    for (const [i, content] of ["A", "B", "C"].entries()) {
      await engine.enqueue(wireOp(signPost(content), { createdAt: new Date(clock.t + i).toISOString() }));
    }
    connectivity.set("online");
    await engine.flush();

    expect(order).toEqual(["A", "B", "C"]);
    expect((await engine.getAll()).every((op) => op.status === "synced")).toBe(true);
  });

  it("handles posts and joins in one queue", async () => {
    await engine.enqueue(wireOp(signJoin()));
    await engine.enqueue(wireOp(signPost("after joining")));
    await engine.flush();
    expect((await engine.getAll()).map((op) => op.status)).toEqual(["synced", "synced"]);
  });
});

describe("failure and retry", () => {
  it("keeps failed operations queued and retries after backoff", async () => {
    relay.mode = "down";
    const op = wireOp(signPost("flaky"));
    await engine.enqueue(op);
    await engine.flush();

    let stored = await getOperation(op.operationId);
    expect(stored?.status).toBe("retrying");
    expect(stored?.attempts).toBe(1);
    expect(stored?.lastError).toBe("No relay confirmed the event.");

    // Before the backoff elapses: no new attempt.
    clock.advance(500);
    await engine.flush();
    expect(relay.sendCalls).toBe(1);

    relay.mode = "ok";
    clock.advance(1_000);
    await engine.flush();
    stored = await getOperation(op.operationId);
    expect(stored?.status).toBe("synced");
    expect(stored?.lastError).toBeUndefined();
  });

  it("backoff grows exponentially and is capped", () => {
    expect([1, 2, 3, 4].map((a) => engine.backoffMs(a))).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(engine.backoffMs(30)).toBe(5 * 60_000);
  });

  it("stops after maxAttempts, keeps the operation, and lets the user retry", async () => {
    relay.mode = "down";
    const op = wireOp(signPost("gives up"));
    await engine.enqueue(op);
    for (let i = 0; i < 6; i++) {
      await engine.flush();
      clock.advance(60_000);
    }

    expect(relay.sendCalls).toBe(3);
    expect(await statusOf(op.operationId)).toBe("failed");

    await engine.flush();
    expect(relay.sendCalls).toBe(3); // no automatic retry forever

    relay.mode = "ok";
    await engine.retry(op.operationId);
    expect(await statusOf(op.operationId)).toBe("synced");
  });

  it("marks permanent relay rejections failed immediately", async () => {
    relay.mode = "reject";
    const op = wireOp(signPost("rejected"));
    await engine.enqueue(op);
    await engine.flush();
    expect(await statusOf(op.operationId)).toBe("failed");
    expect(relay.sendCalls).toBe(1);
  });
});

describe("pull", () => {
  it("stores remote changes in the cache and advances the cursor", async () => {
    const cursors: (string | null)[] = [];
    relay.pull = async (scope, cursor) => {
      cursors.push(cursor);
      return {
        entries: [{ entityId: "e1", entityType: "community_post", data: { id: "e1" }, updatedAt: new Date().toISOString(), scope }],
        cursor: "1700000000",
      };
    };

    expect(await engine.pull("group-0")).toBe(true);
    await engine.pull("group-0");

    expect(cursors).toEqual([null, "1700000000"]);
    expect((await getCacheEntriesByScope("group-0")).map((e) => e.entityId)).toEqual(["e1"]);
  });

  it("keeps serving the cache and the old cursor when a pull fails", async () => {
    relay.pull = async (scope) => ({
      entries: [{ entityId: "e1", entityType: "community_post", data: {}, updatedAt: new Date().toISOString(), scope }],
      cursor: "100",
    });
    await engine.pull("group-0");

    relay.pull = async () => {
      throw new Error("Relay timeout");
    };
    expect(await engine.pull("group-0")).toBe(false);
    expect((await getCacheEntriesByScope("group-0")).length).toBe(1);
    expect(await getMeta("pull:fake-relay:group-0")).toBe("100");
  });

  it("does not pull while offline", async () => {
    connectivity.state = "offline";
    let called = false;
    relay.pull = async () => {
      called = true;
      return { entries: [], cursor: null };
    };
    expect(await engine.pull("group-0")).toBe(false);
    expect(called).toBe(false);
  });
});
