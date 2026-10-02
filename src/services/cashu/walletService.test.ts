import { describe, expect, it } from "vitest";
import { balanceAfterReceive, validateReceiveMetadata } from "./walletService";

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    length: 0,
    key: () => null,
  };
})();

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: storageMock });
}

describe("wallet receive safeguards", () => {
  it("rejects a token from another provider", () => {
    expect(() => validateReceiveMetadata({ mint: "https://other.example", unit: "sat" }, "https://allowed.example")).toThrow(/configured payment provider/);
  });
  it("rejects a non-sat token", () => {
    expect(() => validateReceiveMetadata({ mint: "https://allowed.example", unit: "usd" }, "https://allowed.example")).toThrow(/configured payment provider/);
  });
  it("includes newly received proofs in the balance", () => {
    expect(balanceAfterReceive([{ amount: 21n } as never], [{ amount: 50n } as never])).toBe(71);
  });
});

describe("wallet backup restore merging and deduplication", () => {
  it("merges and dedupes proofs, pending quotes, and history on restore", async () => {
    const { restoreWalletBackup, exportWalletBackup, initializeWallet } = await import("./walletService");
    const passcode = "test-passcode-123";
    localStorage.clear();

    await initializeWallet(passcode);
    const exportedInitial = await exportWalletBackup(passcode);
    expect(typeof exportedInitial).toBe("string");

    const backupData = JSON.stringify({
      proofs: [
        { id: "001", amount: 10, secret: "sec-1", C: "c-1" },
        { id: "001", amount: 20, secret: "sec-2", C: "c-2" }
      ],
      pending: [
        { quote: "q-100", amount: 10, request: "lnbc100..." },
        { quote: "q-200", amount: 50, request: "lnbc500..." }
      ],
      history: [
        { id: "h-1", type: "funds", amount: 10, at: 1000 },
        { id: "h-2", type: "received", amount: 20, at: 2000 }
      ]
    });

    const restored = await restoreWalletBackup(passcode, backupData);
    expect(restored.balance).toBe(30);
    expect(restored.proofs.length).toBe(2);
    expect(restored.pending.length).toBe(2);
    expect(restored.history.length).toBe(2);

    // Now restore duplicate backup data (with one new proof, one duplicate proof)
    const backupData2 = JSON.stringify({
      proofs: [
        { id: "001", amount: 10, secret: "sec-1", C: "c-1" }, // duplicate
        { id: "001", amount: 5, secret: "sec-3", C: "c-3" }   // new
      ],
      pending: [
        { quote: "q-100", amount: 10, request: "lnbc100..." } // duplicate
      ],
      history: [
        { id: "h-1", type: "funds", amount: 10, at: 1000 },  // duplicate
        { id: "h-3", type: "funds", amount: 5, at: 3000 }    // new
      ]
    });

    const secondRestored = await restoreWalletBackup(passcode, backupData2);
    expect(secondRestored.balance).toBe(35); // 30 + 5
    expect(secondRestored.proofs.length).toBe(3);
    expect(secondRestored.pending.length).toBe(2);
    expect(secondRestored.history.length).toBe(3);
    expect(secondRestored.history[0].id).toBe("h-3"); // sorted newest first
  });
});

describe("resume pending quotes on load", () => {
  it("returns current snapshot when no pending quotes exist", async () => {
    const { resumePendingQuotes, initializeWallet } = await import("./walletService");
    const passcode = "test-passcode-456";
    localStorage.clear();

    await initializeWallet(passcode);
    const snapshot = await resumePendingQuotes(passcode);
    expect(snapshot.balance).toBe(0);
    expect(snapshot.pending.length).toBe(0);
  });
});
