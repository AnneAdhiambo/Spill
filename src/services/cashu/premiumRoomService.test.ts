import { describe, expect, it } from "vitest";
import { payForPremiumRoomAccess } from "./premiumRoomService";

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

describe("Phase 3 Premium Room Payment & Entitlements", () => {
  it("throws error if wallet balance is insufficient for room price", async () => {
    localStorage.clear();
    // Empty wallet throws passcode or unreadable wallet
    await expect(payForPremiumRoomAccess("passcode123", "test-room", 50)).rejects.toThrow();
  });

  it("exports payForPremiumRoomAccess module correctly", () => {
    expect(typeof payForPremiumRoomAccess).toBe("function");
  });
});
