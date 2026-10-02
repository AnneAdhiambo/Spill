import { useCallback, useEffect, useState } from "react";
import {
  claimFundingQuote,
  createFundingQuote,
  exportWalletBackup,
  hasWallet,
  initializeWallet,
  receiveToken,
  restoreWalletBackup,
  resumePendingQuotes,
  walletSnapshot,
} from "../services/cashu/walletService";

const sessionPasscodeKey = "spill.wallet.session.passcode";

export type WalletHistoryItem = {
  id: string;
  type: "funds" | "received" | "zap" | "premium";
  amount: number;
  at: number;
};

export type PendingQuoteItem = {
  quote: string;
  amount: number;
  request: string;
  expiresAt?: number;
};

export function useWallet() {
  const [walletExists, setWalletExists] = useState<boolean>(hasWallet);
  const [passcode, setPasscode] = useState<string | null>(() => {
    return sessionStorage.getItem(sessionPasscodeKey);
  });
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [balance, setBalance] = useState<number>(0);
  const [pending, setPending] = useState<PendingQuoteItem[]>([]);
  const [history, setHistory] = useState<WalletHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isCheckingPending, setIsCheckingPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const syncStateFromSnapshot = useCallback((snapshot: { balance: number; pending: PendingQuoteItem[]; history: WalletHistoryItem[] }) => {
    setBalance(snapshot.balance);
    setPending(snapshot.pending);
    setHistory(snapshot.history);
  }, []);

  const refreshState = useCallback(async (activePasscode?: string) => {
    const currentPasscode = activePasscode ?? passcode;
    if (!currentPasscode) return;
    try {
      const snapshot = await resumePendingQuotes(currentPasscode);
      syncStateFromSnapshot(snapshot);
    } catch {
      // Ignore background sync errors silently
    }
  }, [passcode, syncStateFromSnapshot]);

  // Try resuming session on mount if passcode exists in sessionStorage
  useEffect(() => {
    const savedPasscode = sessionStorage.getItem(sessionPasscodeKey);
    if (savedPasscode && hasWallet()) {
      setLoading(true);
      setIsCheckingPending(true);
      resumePendingQuotes(savedPasscode)
        .then((snapshot) => {
          setPasscode(savedPasscode);
          setIsUnlocked(true);
          syncStateFromSnapshot(snapshot);
        })
        .catch(() => {
          sessionStorage.removeItem(sessionPasscodeKey);
          setPasscode(null);
          setIsUnlocked(false);
        })
        .finally(() => {
          setLoading(false);
          setIsCheckingPending(false);
        });
    }
  }, [syncStateFromSnapshot]);

  const unlock = useCallback(async (inputPasscode: string) => {
    setError(null);
    setLoading(true);
    setIsCheckingPending(true);
    try {
      const snapshot = await resumePendingQuotes(inputPasscode);
      sessionStorage.setItem(sessionPasscodeKey, inputPasscode);
      setPasscode(inputPasscode);
      setIsUnlocked(true);
      setWalletExists(true);
      syncStateFromSnapshot(snapshot);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Incorrect passcode. Please try again.";
      setError(msg);
      return false;
    } finally {
      setLoading(false);
      setIsCheckingPending(false);
    }
  }, [syncStateFromSnapshot]);

  const createPasscode = useCallback(async (newPasscode: string) => {
    setError(null);
    setLoading(true);
    try {
      const snapshot = await initializeWallet(newPasscode);
      sessionStorage.setItem(sessionPasscodeKey, newPasscode);
      setPasscode(newPasscode);
      setIsUnlocked(true);
      setWalletExists(true);
      syncStateFromSnapshot(snapshot);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to create device passcode.";
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [syncStateFromSnapshot]);

  const lock = useCallback(() => {
    sessionStorage.removeItem(sessionPasscodeKey);
    setPasscode(null);
    setIsUnlocked(false);
    setBalance(0);
    setPending([]);
    setHistory([]);
    setError(null);
  }, []);

  const addFundsQuote = useCallback(async (amount: number) => {
    if (!passcode) throw new Error("Wallet is locked.");
    setError(null);
    try {
      const result = await createFundingQuote(passcode, amount);
      const snapshot = await walletSnapshot(passcode);
      syncStateFromSnapshot(snapshot);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create Lightning invoice.";
      setError(msg);
      throw new Error(msg);
    }
  }, [passcode, syncStateFromSnapshot]);

  const claimQuote = useCallback(async (quoteId: string) => {
    if (!passcode) throw new Error("Wallet is locked.");
    setError(null);
    try {
      const snapshot = await claimFundingQuote(passcode, quoteId);
      syncStateFromSnapshot(snapshot);
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invoice payment not confirmed yet.";
      throw new Error(msg);
    }
  }, [passcode, syncStateFromSnapshot]);

  const receiveCashuToken = useCallback(async (token: string) => {
    if (!passcode) throw new Error("Wallet is locked.");
    setError(null);
    try {
      const snapshot = await receiveToken(passcode, token);
      syncStateFromSnapshot(snapshot);
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to receive token.";
      setError(msg);
      throw new Error(msg);
    }
  }, [passcode, syncStateFromSnapshot]);

  const exportBackup = useCallback(async () => {
    if (!passcode) throw new Error("Wallet is locked.");
    setError(null);
    try {
      return await exportWalletBackup(passcode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to export wallet backup.";
      setError(msg);
      throw new Error(msg);
    }
  }, [passcode]);

  const restoreBackup = useCallback(async (backupJson: string) => {
    if (!passcode) throw new Error("Wallet is locked.");
    setError(null);
    try {
      const snapshot = await restoreWalletBackup(passcode, backupJson);
      syncStateFromSnapshot(snapshot);
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "That wallet backup is not valid.";
      setError(msg);
      throw new Error(msg);
    }
  }, [passcode, syncStateFromSnapshot]);

  return {
    walletExists,
    isUnlocked,
    balance,
    pending,
    history,
    loading,
    isCheckingPending,
    error,
    setError,
    unlock,
    createPasscode,
    lock,
    addFundsQuote,
    claimQuote,
    receiveCashuToken,
    exportBackup,
    restoreBackup,
    refreshState,
  };
}
