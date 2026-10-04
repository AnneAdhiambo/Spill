import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { validateOperation } from "../validation";
import { signJoin, signPost, wireOp } from "./helpers";

describe("validateOperation", () => {
  it("accepts a well-formed signed post and returns a clean copy", () => {
    const op = wireOp(signPost("hello"), { status: "synced", attempts: 99, injected: "x" });
    const result = validateOperation(op, "peer");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation.status).toBe("pending");
    expect(result.operation.attempts).toBe(0);
    expect(result.operation.origin).toBe("peer");
    expect("injected" in result.operation).toBe(false);
  });

  it("accepts a join", () => {
    expect(validateOperation(wireOp(signJoin()), "local").ok).toBe(true);
  });

  it("strips unknown fields from the event", () => {
    const event = { ...signPost("x"), extra: "<script>" };
    const result = validateOperation(wireOp(event), "peer");
    expect(result.ok && "extra" in result.operation.payload.event).toBe(false);
  });

  const reject = (raw: unknown) => {
    const result = validateOperation(raw, "peer");
    expect(result.ok).toBe(false);
    return result.ok ? "" : result.reason;
  };

  it("rejects tampered content (signature no longer matches)", () => {
    const event = signPost("original");
    expect(reject(wireOp({ ...event, content: "tampered" }))).toBe("Invalid event signature.");
  });

  it("rejects a forged signature", () => {
    const event = signPost("x");
    expect(reject(wireOp({ ...event, sig: "0".repeat(128) }))).toBe("Invalid event signature.");
  });

  it("rejects a mismatched entity id", () => {
    expect(reject(wireOp(signPost("x"), { entityId: "f".repeat(64) }))).toBe("Entity id does not match event id.");
  });

  it("rejects an event kind that does not match the entity type", () => {
    expect(reject(wireOp(signPost("x"), { entityType: "community_join" }))).toBe(
      "Event kind does not match entity type.",
    );
    const metadata = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [["h", "group-0"]], content: "{}" }, generateSecretKey());
    expect(reject(wireOp(metadata, { entityType: "community_post", scope: "group-0" }))).toBe(
      "Event kind does not match entity type.",
    );
  });

  it("rejects a scope that differs from the event's community tag", () => {
    expect(reject(wireOp(signPost("x", "group-0"), { scope: "group-1" }))).toBe(
      "Event is not tagged for this community.",
    );
  });

  it("rejects bad operation ids, types and shapes", () => {
    expect(reject(wireOp(signPost("x"), { operationId: "not-a-uuid" }))).toBe("Invalid operation id.");
    expect(reject(wireOp(signPost("x"), { operationType: "delete" }))).toBe("Unsupported operation type.");
    expect(reject(wireOp(signPost("x"), { entityType: "wallet" }))).toBe("Unsupported entity type.");
    expect(reject(wireOp(signPost("x"), { payload: { event: "{}" } }))).toBe("Malformed Nostr event.");
    expect(reject(null)).toBe("Operation must be an object.");
    expect(reject("rm -rf /")).toBe("Operation must be an object.");
  });

  it("rejects events from the future and stale events", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(reject(wireOp(signPost("x", "group-0", now + 3600)))).toBe("Event timestamp is in the future.");
    expect(reject(wireOp(signPost("x", "group-0", now - 60 * 24 * 3600)))).toBe("Event is too old to forward.");
  });
});
