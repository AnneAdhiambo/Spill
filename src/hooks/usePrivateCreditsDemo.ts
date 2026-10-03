import { useCallback, useState } from "react";

const demoBalanceKey = "spill.private-credits.demo-balance";

function readBalance(): number {
  const saved = Number.parseInt(localStorage.getItem(demoBalanceKey) ?? "0", 10);
  return Number.isFinite(saved) && saved > 0 ? saved : 0;
}

export function usePrivateCreditsDemo() {
  const [balance, setBalance] = useState(readBalance);

  const updateBalance = useCallback((nextBalance: number) => {
    const normalized = Math.max(0, nextBalance);
    localStorage.setItem(demoBalanceKey, String(normalized));
    setBalance(normalized);
  }, []);

  const addTestCredits = useCallback((amount: number) => {
    updateBalance(balance + amount);
  }, [balance, updateBalance]);

  const spendTestCredits = useCallback((amount: number) => {
    if (amount > balance) return false;
    updateBalance(balance - amount);
    return true;
  }, [balance, updateBalance]);

  return { balance, addTestCredits, spendTestCredits };
}
