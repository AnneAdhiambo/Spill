import { describe, expect, it } from "vitest";
import { balanceAfterReceive, validateReceiveMetadata } from "./walletService";

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
