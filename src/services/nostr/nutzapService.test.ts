import { describe, expect, it, vi } from "vitest";
import {
  getPendingPublishes,
  getReceivedEventIds,
  retryPendingNutzapPublishes,
  savePendingPublishes,
  saveReceivedEventId,
} from "./nutzapService";
import { validateReceiveMetadata } from "../cashu/walletService";
import type { Event } from "nostr-tools";

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    length: 0,
    key: () => null,
  };
})();

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: storageMock });
}

describe("Nutzap publishing retry and deduplication safeguards", () => {
  it("persists pending published signed events on failure and retries exact same event without starting a new swap", async () => {
    localStorage.clear();

    const mockSignedEvent: Event = {
      id: "event-id-999",
      pubkey: "sender-nostr-pubkey",
      created_at: 1000,
      kind: 9321,
      tags: [
        ["amount", "21"],
        ["unit", "sat"],
        ["mint", "https://allowed.example"],
        ["p", "recipient-nostr-pubkey"],
        ["proof", JSON.stringify({ id: "p1", amount: 21, secret: "sec-p1", C: "c-p1" })],
      ],
      content: "Great post!",
      sig: "mock-sig",
    };

    savePendingPublishes([mockSignedEvent]);
    expect(getPendingPublishes().length).toBe(1);
    expect(getPendingPublishes()[0].id).toBe("event-id-999");

    // Simulate failed publish attempt during retry
    const failingPublish = vi.fn().mockRejectedValue(new Error("Relay network timeout"));
    const retriedFailed = await retryPendingNutzapPublishes(failingPublish);

    expect(retriedFailed).toBe(0);
    expect(failingPublish).toHaveBeenCalledTimes(1);
    // Event remains in storage
    expect(getPendingPublishes().length).toBe(1);

    // Simulate successful publish on second retry
    const successfulPublish = vi.fn().mockResolvedValue(undefined);
    const retriedSuccess = await retryPendingNutzapPublishes(successfulPublish);

    expect(retriedSuccess).toBe(1);
    expect(successfulPublish).toHaveBeenCalledWith(expect.objectContaining({ id: "event-id-999" }));
    // Cleared from pending publishes after successful retry
    expect(getPendingPublishes().length).toBe(0);
  });

  it("deduplicates received Nutzap events by event ID", async () => {
    localStorage.clear();

    const eventId = "nutzap-event-abc";
    expect(getReceivedEventIds().includes(eventId)).toBe(false);

    saveReceivedEventId(eventId);
    expect(getReceivedEventIds().includes(eventId)).toBe(true);

    // Duplicate save should not add duplicate ID
    saveReceivedEventId(eventId);
    expect(getReceivedEventIds().filter((id) => id === eventId).length).toBe(1);
  });

  it("rejects Nutzap event from wrong/unallowed mint", () => {
    expect(() =>
      validateReceiveMetadata(
        { mint: "https://disallowed.mint.space", unit: "sat" },
        "https://allowed.mint.space"
      )
    ).toThrow(/configured payment provider/);
  });
});
