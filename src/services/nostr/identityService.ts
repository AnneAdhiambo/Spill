import { SimplePool, finalizeEvent } from "nostr-tools";
import { DEFAULT_RELAYS } from "./relays";

const pool = new SimplePool();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Relay timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Publishes a minimal kind:0 profile so a new account exists on the Nostr
 * network. Returns true if at least one relay accepted it.
 * Only call this for NEW identities, never for imports (it would overwrite
 * an existing profile).
 */
export async function publishProfile(privateKeyHex: string): Promise<boolean> {
  try {
    const event = finalizeEvent(
      {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: "{}",
      },
      hexToBytes(privateKeyHex)
    );
    await withTimeout(Promise.any(pool.publish(DEFAULT_RELAYS, event)), 8000);
    return true;
  } catch (error) {
    console.warn("Could not publish profile to any relay.", error);
    return false;
  }
}
