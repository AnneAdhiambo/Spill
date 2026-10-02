import { useCallback, useState } from "react";
import { cashuTestWallet, type CashuTopUpQuote } from "../services/cashu/testWallet";

export function useCashuTestWallet() {
  const [balance, setBalance] = useState(() => cashuTestWallet.getBalance());
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiveToken = useCallback(async (token: string) => {
    setIsWorking(true);
    setError(null);
    try {
      setBalance(await cashuTestWallet.receiveToken(token));
      return true;
    } catch (receiveError) {
      setError(receiveError instanceof Error ? receiveError.message : "Could not receive the Cashu token.");
      return false;
    } finally {
      setIsWorking(false);
    }
  }, []);

  const createTopUpQuote = useCallback(async (amount: number): Promise<CashuTopUpQuote | null> => {
    setIsWorking(true);
    setError(null);
    try {
      return await cashuTestWallet.createTopUpQuote(amount);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : "Could not create a test-mint invoice.");
      return null;
    } finally {
      setIsWorking(false);
    }
  }, []);

  const claimTopUpQuote = useCallback(async (quote: CashuTopUpQuote) => {
    setIsWorking(true);
    setError(null);
    try {
      const result = await cashuTestWallet.claimTopUpQuote(quote);
      setBalance(result.balance);
      return result.paid;
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not check the test-mint invoice.");
      return false;
    } finally {
      setIsWorking(false);
    }
  }, []);

  const createSupportToken = useCallback(async (amount: number) => {
    setIsWorking(true);
    setError(null);
    try {
      const result = await cashuTestWallet.createSupportToken(amount);
      setBalance(result.balance);
      return result.token;
    } catch (spendError) {
      setError(spendError instanceof Error ? spendError.message : "Could not prepare the private support token.");
      return null;
    } finally {
      setIsWorking(false);
    }
  }, []);

  return {
    balance,
    error,
    isWorking,
    mintUrl: cashuTestWallet.mintUrl,
    receiveToken,
    createTopUpQuote,
    claimTopUpQuote,
    createSupportToken,
  };
}
