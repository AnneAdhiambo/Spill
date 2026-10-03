import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeOfflineDb, getCacheEntriesByScope } from "../db";
import { SyncEngine } from "../SyncEngine";
import { MAX_BUNDLE_OPERATIONS, NearbyShareTransport } from "../transports/NearbyShareTransport";
import { FakeConnectivity, FakeRelayTransport, signPost, wireOp } from "./helpers";

/** One simulated phone: its own IndexedDB, connectivity, engine and transports. */
class Device {
  readonly idb = new IDBFactory();
  connectivity = new FakeConnectivity();
  engine!: SyncEngine;
  nearby!: NearbyShareTransport;

  constructor(readonly relay: FakeRelayTransport) {
    this.connectivity.state = "offline";
    this.boot();
  }

  /** (Re)start the app: fresh engine, fresh DB connection, same storage. */
  boot() {
    this.engine = new SyncEngine({ connectivity: this.connectivity, random: () => 0.5 });
    this.engine.registerTransport(this.relay);
    this.nearby = new NearbyShareTransport(this.engine);
    this.engine.registerTransport(this.nearby);
  }
}

let current: Device | null = null;
/** Switch which device's storage the (singleton) DB layer talks to. */
async function on<T>(device: Device, work: () => Promise<T>): Promise<T> {
  if (current !== device) {
    await closeOfflineDb();
    globalThis.indexedDB = device.idb;
    current = device;
  }
  return work();
}

let relay: FakeRelayTransport;
let a: Device;
let b: Device;

beforeEach(async () => {
  relay = new FakeRelayTransport(); // the shared network of record
  a = new Device(relay);
  b = new Device(relay);
  current = null;
});

async function aCreatesOfflinePost(content = "from A") {
  const op = wireOp(signPost(content));
  await on(a, () => a.engine.enqueue(op));
  return op;
}

async function transfer(from: Device, to: Device) {
  const bundle = await on(from, () => from.nearby.createBundle());
  const text = JSON.stringify(bundle); // what travels over Bluetooth
  return on(to, () => to.nearby.importBundle(text));
}

describe("device-to-device transfer", () => {
  it("B receives A's operation into its own sync queue", async () => {
    const op = await aCreatesOfflinePost();
    const summary = await transfer(a, b);

    expect(summary).toEqual({ accepted: 1, duplicates: 0, rejected: 0, reasons: [] });
    const [received] = await on(b, () => b.engine.getAll());
    expect(received.operationId).toBe(op.operationId);
    expect(received.entityId).toBe(op.entityId);
    expect(received.status).toBe("pending");
    expect(received.origin).toBe("peer");
    // Visible in B's feed while still offline.
    const cached = await on(b, () => getCacheEntriesByScope("group-0"));
    expect(cached.map((e) => e.data.content)).toEqual(["from A"]);
  });

  it("sharing does not mark A's operation synced", async () => {
    const op = await aCreatesOfflinePost();
    await transfer(a, b);
    const [stillQueued] = await on(a, () => a.engine.getAll());
    expect(stillQueued.operationId).toBe(op.operationId);
    expect(stillQueued.status).toBe("pending");
  });

  it("bundles carry only wire fields, never local bookkeeping", async () => {
    await aCreatesOfflinePost();
    const bundle = await on(a, () => a.nearby.createBundle());
    expect(Object.keys(bundle.operations[0]).sort()).toEqual(
      ["createdAt", "entityId", "entityType", "operationId", "operationType", "payload", "scope"],
    );
  });

  it("only unsynced operations are shared", async () => {
    a.connectivity.state = "online";
    await aCreatesOfflinePost("already synced");
    await on(a, () => a.engine.flush());
    expect((await on(a, () => a.nearby.createBundle())).operations).toHaveLength(0);
  });
});

describe("Bluetooth → Internet", () => {
  it("B publishes A's original signed event once B is online", async () => {
    const op = await aCreatesOfflinePost();
    await transfer(a, b);

    b.connectivity.set("online");
    await on(b, () => b.engine.flush());

    const [synced] = await on(b, () => b.engine.getAll());
    expect(synced.status).toBe("synced");
    expect(JSON.parse(JSON.stringify(relay.stored.get(op.entityId)))).toEqual(
      JSON.parse(JSON.stringify(op.payload.event)),
    );
  });
});

describe("duplicates", () => {
  it("A → B twice stores the operation once", async () => {
    await aCreatesOfflinePost();
    await transfer(a, b);
    const second = await transfer(a, b);
    expect(second).toEqual({ accepted: 0, duplicates: 1, rejected: 0, reasons: [] });
    expect(await on(b, () => b.engine.getAll())).toHaveLength(1);
  });

  it("the same operation reaching the relay via A and via B is stored once", async () => {
    const op = await aCreatesOfflinePost();
    await transfer(a, b);

    a.connectivity.set("online");
    await on(a, () => a.engine.flush());
    b.connectivity.set("online");
    await on(b, () => b.engine.flush());

    expect(relay.sendCalls).toBe(2);
    expect(relay.stored.size).toBe(1);
    expect(relay.stored.has(op.entityId)).toBe(true);
    expect((await on(a, () => a.engine.getAll()))[0].status).toBe("synced");
    expect((await on(b, () => b.engine.getAll()))[0].status).toBe("synced");
  });

  it("an operation that comes back to its author is not duplicated", async () => {
    await aCreatesOfflinePost();
    await transfer(a, b);
    const back = await transfer(b, a);
    expect(back.duplicates).toBe(1);
    expect(await on(a, () => a.engine.getAll())).toHaveLength(1);
  });
});

describe("device restart", () => {
  it("a received operation survives B restarting", async () => {
    const op = await aCreatesOfflinePost();
    await transfer(a, b);

    await on(b, async () => {
      b.engine.stop();
      await closeOfflineDb();
      b.boot();
      await b.engine.start();
    });

    const [kept] = await on(b, () => b.engine.getAll());
    expect(kept.operationId).toBe(op.operationId);
    expect(kept.status).toBe("pending");
  });
});

describe("invalid operations", () => {
  async function importText(text: string) {
    const summary = await on(b, () => b.nearby.importBundle(text));
    expect(await on(b, () => b.engine.getAll())).toHaveLength(0);
    return summary;
  }

  const bundleOf = (operations: unknown[]) =>
    JSON.stringify({ format: "spill-sync-bundle", version: 1, createdAt: new Date().toISOString(), operations });

  it("rejects an operation whose content was altered in transit", async () => {
    const event = signPost("original");
    const summary = await importText(bundleOf([wireOp({ ...event, content: "altered by a nearby device" })]));
    expect(summary.rejected).toBe(1);
    expect(summary.reasons).toEqual(["Invalid event signature."]);
  });

  it("rejects malformed and unsupported operations but keeps valid ones", async () => {
    const good = wireOp(signPost("good"));
    const summary = await on(b, () =>
      b.nearby.importBundle(
        bundleOf([
          good,
          { operationId: "x" },
          wireOp(signPost("y"), { entityType: "wallet_transfer" }),
          wireOp(signPost("z"), { payload: { event: { kind: 1 } } }),
          "DROP TABLE sync_queue",
          null,
        ]),
      ),
    );
    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(5);
    expect((await on(b, () => b.engine.getAll())).map((op) => op.operationId)).toEqual([good.operationId]);
  });

  it("rejects files that are not Spill sync bundles", async () => {
    expect((await importText("not json")).reasons).toEqual(["Not a Spill sync file."]);
    expect((await importText(JSON.stringify({ format: "other", version: 1, operations: [] }))).reasons).toEqual([
      "Not a Spill sync file.",
    ]);
    expect((await importText(JSON.stringify({ format: "spill-sync-bundle", version: 99, operations: [] }))).rejected).toBe(1);
    expect((await importText(JSON.stringify({ format: "spill-sync-bundle", version: 1, operations: {} }))).rejected).toBe(1);
  });

  it("rejects oversized bundles", async () => {
    const tooMany = Array.from({ length: MAX_BUNDLE_OPERATIONS + 1 }, () => ({}));
    expect((await importText(bundleOf(tooMany))).reasons).toEqual(["File contains too many items."]);
    expect((await importText("x".repeat(2_000_001))).reasons).toEqual(["File is too large."]);
    expect((await on(b, () => b.nearby.importFile(new Blob(["x".repeat(2_000_001)])))).reasons).toEqual([
      "File is too large.",
    ]);
  });
});
