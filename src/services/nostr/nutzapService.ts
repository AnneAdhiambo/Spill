import { finalizeEvent, SimplePool } from "nostr-tools";
import { unlockIdentity } from "../../features/identity/keys";

const RELAYS = ["wss://relay.damus.io", "wss://relay.nostr.band"];
const pool = new SimplePool();
const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? "http://localhost:3001/api/livekit/token";

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []);
}

/** Publishes NIP-61 receiving information. Event signing remains on the Nostr key. */
export async function publishNutzapConfiguration(passcode?: string): Promise<void> {
  const response = await fetch(new URL("/api/cashu/config", tokenEndpoint));
  const { mintUrl } = await response.json() as { mintUrl?: string };
  if (!response.ok || !mintUrl) throw new Error("Cashu mint is not configured.");
  const identity = await unlockIdentity(passcode);
  const event = finalizeEvent({
    kind: 10019,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ...RELAYS.map((relay) => ["relay", relay]),
      ["mint", mintUrl, "sat"],
      ["pubkey", identity.nutzapPubkey],
    ],
    content: "",
  }, hexToBytes(identity.privateKeyHex));
  await Promise.any(pool.publish(RELAYS, event));
}
