import { useEffect, useMemo, useState } from "react";

type PriceResponse = { bitcoin?: { usd?: number } };

const cacheKey = "spill.bitcoin-usd-rate";
const cacheLifetimeMs = 5 * 60 * 1000;
const priceEndpoint = import.meta.env.VITE_BITCOIN_PRICE_ENDPOINT
  ?? "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

type CachedRate = { price: number; updatedAt: number };

function readCachedRate(): CachedRate | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as CachedRate | null;
    return cached && Number.isFinite(cached.price) && Date.now() - cached.updatedAt < cacheLifetimeMs ? cached : null;
  } catch {
    return null;
  }
}

export function useBitcoinUsdEstimate(sats: number) {
  const [bitcoinUsd, setBitcoinUsd] = useState<number | null>(() => readCachedRate()?.price ?? null);

  useEffect(() => {
    const cached = readCachedRate();
    if (cached) {
      setBitcoinUsd(cached.price);
      return;
    }

    const controller = new AbortController();

    void fetch(priceEndpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Price request failed");
        return response.json() as Promise<PriceResponse>;
      })
      .then((payload) => {
        const price = payload.bitcoin?.usd;
        if (!price || !Number.isFinite(price)) return;
        const rate = { price, updatedAt: Date.now() };
        localStorage.setItem(cacheKey, JSON.stringify(rate));
        setBitcoinUsd(price);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  return useMemo(() => {
    if (!bitcoinUsd) return null;
    return sats * bitcoinUsd / 100_000_000;
  }, [bitcoinUsd, sats]);
}
