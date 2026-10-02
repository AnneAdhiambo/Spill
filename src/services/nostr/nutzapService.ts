import {
  normalizeMintUrl,
  serializeSwapPreview,
  Wallet,
  type Proof,
} from "@cashu/cashu-ts";
import { finalizeEvent, SimplePool, type Event } from "nostr-tools";
import { getPublicKey } from "nostr-tools/pure";
import { unlockIdentity } from "../../features/identity/keys";

const RELAYS = ["wss://relay.damus.io", "wss://relay.nostr.band"];
const pool = new SimplePool();
const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? "http://localhost:3001/api/livekit/token";

const PENDING_SWAPS_KEY = "spill.nutzap.pending-swaps";
const PENDING_PUBLISHES_KEY = "spill.nutzap.pending-publishes";
const RECEIVED_EVENTS_KEY = "spill.nutzap.received-event-ids";
const RESERVED_PROOFS_KEY = "spill.nutzap.reserved-proofs";

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []);
}

export type RecipientNutzapInfo = {
  mint: string;
  unit: string;
  p2pkPubkey: string;
  relays: string[];
};

/** Publishes NIP-61 receiving information. Event signing remains on the Nostr key. */
export async function publishNutzapConfiguration(passcode: string): Promise<void> {
  const response = await fetch(new URL("/api/cashu/config", tokenEndpoint));
  const { mintUrl } = (await response.json()) as { mintUrl?: string };
  if (!response.ok || !mintUrl) throw new Error("Cashu mint is not configured.");
  const identity = await unlockIdentity(passcode);
  const event = finalizeEvent(
    {
      kind: 10019,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ...RELAYS.map((relay) => ["relay", relay]),
        ["mint", mintUrl, "sat"],
        ["pubkey", identity.nutzapPubkey],
      ],
      content: "",
    },
    hexToBytes(identity.privateKeyHex)
  );
  await Promise.any(pool.publish(RELAYS, event));
}

export async function fetchRecipientNutzapInfo(recipientNostrPubkey: string): Promise<RecipientNutzapInfo> {
  const events = await pool.querySync(RELAYS, {
    kinds: [10019],
    authors: [recipientNostrPubkey],
    limit: 1,
  });

  if (!events || events.length === 0) {
    throw new Error("Recipient has not configured Cashu nutzaps on Nostr.");
  }

  const event = events[0];
  const mintTag = event.tags.find((t) => t[0] === "mint");
  const pubkeyTag = event.tags.find((t) => t[0] === "pubkey");
  const relayTags = event.tags.filter((t) => t[0] === "relay").map((t) => t[1]);

  if (!mintTag || !mintTag[1] || !pubkeyTag || !pubkeyTag[1]) {
    throw new Error("Recipient nutzap configuration is incomplete.");
  }

  return {
    mint: mintTag[1],
    unit: mintTag[2] ?? "sat",
    p2pkPubkey: pubkeyTag[1],
    relays: relayTags.length > 0 ? relayTags : RELAYS,
  };
}

async function getWalletInstance() {
  const response = await fetch(new URL("/api/cashu/config", tokenEndpoint));
  const config = (await response.json()) as { mintUrl?: string };
  if (!response.ok || !config.mintUrl) throw new Error("Wallet funding is not configured.");
  const value = new Wallet(normalizeMintUrl(config.mintUrl), { unit: "sat" });
  await value.loadMint();
  return value;
}

// Helpers for pending storage
export function getPendingPublishes(): Event[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_PUBLISHES_KEY) ?? "[]") as Event[];
  } catch {
    return [];
  }
}

export function savePendingPublishes(events: Event[]) {
  localStorage.setItem(PENDING_PUBLISHES_KEY, JSON.stringify(events));
}

export function getReceivedEventIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECEIVED_EVENTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function saveReceivedEventId(id: string) {
  const current = getReceivedEventIds();
  if (!current.includes(id)) {
    localStorage.setItem(RECEIVED_EVENTS_KEY, JSON.stringify([...current, id]));
  }
}

export function getReservedProofs(): Proof[] {
  try {
    return JSON.parse(localStorage.getItem(RESERVED_PROOFS_KEY) ?? "[]") as Proof[];
  } catch {
    return [];
  }
}

// ---- Spending core ----------------------------------------------------

export async function sendNutzap(
  passcode: string,
  recipientNostrPubkey: string,
  amount: number,
  memo?: string,
  eventId?: string,
  providedNutzapInfo?: RecipientNutzapInfo,
  publishOverride?: (event: Event) => Promise<void>
) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Enter a whole number of sats.");
  }

  // 1. Read current wallet state
  const { read, save, walletSnapshot } = await import("../cashu/walletService");
  const state = await read(passcode);

  const availableProofs = state.proofs;
  const currentBalance = availableProofs.reduce((sum: number, p: Proof) => sum + Number(p.amount), 0);
  if (currentBalance < amount) {
    throw new Error("Insufficient balance to send this Nutzap. Please add funds.");
  }

  // 2. Select & reserve proofs
  let accumulated = 0;
  const reservedProofs: Proof[] = [];
  const remainingProofs: Proof[] = [];

  for (const proof of availableProofs) {
    if (accumulated < amount) {
      accumulated += Number(proof.amount);
      reservedProofs.push(proof);
    } else {
      remainingProofs.push(proof);
    }
  }

  // Persist reserved proofs before swap
  localStorage.setItem(RESERVED_PROOFS_KEY, JSON.stringify(reservedProofs));

  // 3. Fetch recipient NIP-61 info
  const nutzapInfo = providedNutzapInfo ?? (await fetchRecipientNutzapInfo(recipientNostrPubkey));
  const cashuWallet = await getWalletInstance();

  if (normalizeMintUrl(nutzapInfo.mint) !== normalizeMintUrl(cashuWallet.mint.mintUrl)) {
    throw new Error("Recipient only accepts sats from a different payment provider.");
  }

  // 4. Prepare swap preview (P2PK output generation)
  const preview = await cashuWallet.ops.send(amount, reservedProofs).asP2PK({ pubkey: nutzapInfo.p2pkPubkey }).prepare();

  // 5. Persist swap preview BEFORE calling the mint (crash recovery requirement)
  const swapId = crypto.randomUUID();
  const serializedPreview = JSON.stringify(serializeSwapPreview(preview));
  const pendingSwaps = JSON.parse(localStorage.getItem(PENDING_SWAPS_KEY) ?? "{}");
  pendingSwaps[swapId] = serializedPreview;
  localStorage.setItem(PENDING_SWAPS_KEY, JSON.stringify(pendingSwaps));

  // 6. Complete swap at the mint
  const { keep, send: p2pkProofs } = await cashuWallet.completeSwap(preview);

  // 7. Update wallet state: replace spent proofs with keep change proofs
  state.proofs = [...remainingProofs, ...keep];
  state.history.unshift({
    id: swapId,
    type: "zap",
    amount,
    at: Date.now(),
  });
  await save(passcode, state);

  // Clear swap preview and reserved proofs from pending storage
  delete pendingSwaps[swapId];
  localStorage.setItem(PENDING_SWAPS_KEY, JSON.stringify(pendingSwaps));
  localStorage.removeItem(RESERVED_PROOFS_KEY);

  // 8. Construct NIP-61 kind:9321 Nutzap event
  const identity = await unlockIdentity(passcode);
  const nutzapEvent = finalizeEvent(
    {
      kind: 9321,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["amount", String(amount)],
        ["unit", nutzapInfo.unit || "sat"],
        ["mint", nutzapInfo.mint],
        ["p", recipientNostrPubkey],
        ...(eventId ? [["e", eventId]] : []),
        ...p2pkProofs.map((p) => ["proof", JSON.stringify(p)]),
      ],
      content: memo ?? "",
    },
    hexToBytes(identity.privateKeyHex)
  );

  // 9. Persist exact signed event BEFORE publishing
  const currentPendingPublishes = getPendingPublishes();
  savePendingPublishes([...currentPendingPublishes, nutzapEvent]);

  // 10. Attempt publish to Nostr relays
  try {
    if (publishOverride) {
      await publishOverride(nutzapEvent);
    } else {
      const targetRelays = nutzapInfo.relays.length > 0 ? nutzapInfo.relays : RELAYS;
      await Promise.any(pool.publish(targetRelays, nutzapEvent));
    }
    // Remove from pending publishes on successful delivery
    const updated = getPendingPublishes().filter((e) => e.id !== nutzapEvent.id);
    savePendingPublishes(updated);
  } catch {
    // If publish fails, the signed event remains persisted in pending-publishes.
    // Recipient-locked outputs are kept pending in the stored event.
  }

  return { nutzapEvent, snapshot: await walletSnapshot(passcode) };
}

// Retry publish for any stored signed events (republishes exact stored event, no new swap)
export async function retryPendingNutzapPublishes(publishOverride?: (event: Event) => Promise<void>): Promise<number> {
  const pending = getPendingPublishes();
  if (pending.length === 0) return 0;

  let publishedCount = 0;
  const remaining: Event[] = [];

  for (const event of pending) {
    try {
      if (publishOverride) {
        await publishOverride(event);
      } else {
        await Promise.any(pool.publish(RELAYS, event));
      }
      publishedCount++;
    } catch {
      remaining.push(event);
    }
  }

  savePendingPublishes(remaining);
  return publishedCount;
}

// ---- Receiving core ---------------------------------------------------

export async function receiveNutzap(passcode: string, nutzapEvent: Event) {
  if (nutzapEvent.kind !== 9321) {
    throw new Error("Invalid Nutzap event kind.");
  }

  const { read, save, walletSnapshot, validateReceiveMetadata } = await import("../cashu/walletService");
  const identity = await unlockIdentity(passcode);

  // Check if deduplicated by event ID
  const receivedIds = getReceivedEventIds();
  if (receivedIds.includes(nutzapEvent.id)) {
    return walletSnapshot(passcode);
  }

  const mintTag = nutzapEvent.tags.find((t) => t[0] === "mint");
  const unitTag = nutzapEvent.tags.find((t) => t[0] === "unit");
  const proofTags = nutzapEvent.tags.filter((t) => t[0] === "proof");

  if (!mintTag || !mintTag[1] || proofTags.length === 0) {
    throw new Error("Invalid Nutzap payload.");
  }

  const cashuWallet = await getWalletInstance();
  validateReceiveMetadata({ mint: mintTag[1], unit: unitTag ? unitTag[1] : "sat" }, cashuWallet.mint.mintUrl);

  const proofsToReceive: Proof[] = proofTags.map((t) => JSON.parse(t[1]) as Proof);

  // Redeem P2PK locked proofs using identity.nutzapPrivateKeyHex
  const redeemedProofs = await cashuWallet.receive(
    { mint: cashuWallet.mint.mintUrl, proofs: proofsToReceive },
    { privkey: identity.nutzapPrivateKeyHex }
  );
  const amount = redeemedProofs.reduce((sum, p) => sum + Number(p.amount), 0);

  const state = await read(passcode);
  state.proofs.push(...redeemedProofs);
  state.history.unshift({
    id: nutzapEvent.id,
    type: "received",
    amount,
    at: Date.now(),
  });

  saveReceivedEventId(nutzapEvent.id);
  await save(passcode, state);

  return walletSnapshot(passcode);
}

/** Polls/subscribes for incoming kind:9321 zaps for my pubkey, redeems P2PK proofs, and notifies. */
export async function pollIncomingNutzaps(
  passcode: string,
  onReceivedNotice?: (noticeMessage: string) => void
): Promise<number> {
  const identity = await unlockIdentity(passcode);
  const hexPubkey = getPublicKey(hexToBytes(identity.privateKeyHex));

  let events: Event[] = [];
  try {
    events = await pool.querySync(RELAYS, {
      kinds: [9321],
      "#p": [hexPubkey],
      limit: 50,
    });
  } catch (err) {
    console.warn("Relay query for incoming zaps failed", err);
    return 0;
  }

  let totalReceivedSats = 0;
  for (const event of events) {
    const receivedIds = getReceivedEventIds();
    if (receivedIds.includes(event.id)) continue;

    try {
      await receiveNutzap(passcode, event);
      const amountTag = event.tags.find((t) => t[0] === "amount");
      const amount = amountTag ? Number(amountTag[1]) : 0;
      totalReceivedSats += amount;
    } catch (err) {
      console.warn("Failed to redeem incoming zap event", event.id, err);
    }
  }

  if (totalReceivedSats > 0 && onReceivedNotice) {
    onReceivedNotice(`You received ${totalReceivedSats} sats!`);
  }

  return totalReceivedSats;
}

/** Self-check tool to verify if stored identity has a kind:10019 configuration event on Nostr relays. */
export async function checkMy10019(recipientNostrPubkey?: string): Promise<{ success: boolean; info?: RecipientNutzapInfo; error?: string }> {
  try {
    let targetPubkey = recipientNostrPubkey;
    if (!targetPubkey) {
      const storedNpub = localStorage.getItem("spill.identity.v1");
      if (!storedNpub) return { success: false, error: "No identity found on this device." };
      const parsed = JSON.parse(storedNpub) as { npub: string };
      targetPubkey = parsed.npub;
    }
    const info = await fetchRecipientNutzapInfo(targetPubkey);
    console.log("✅ 10019 Nutzap configuration event found on relays:", info);
    return { success: true, info };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Not found on relays.";
    console.warn("❌ 10019 Nutzap configuration event check failed:", error);
    return { success: false, error };
  }
}

if (typeof window !== "undefined") {
  (window as any).checkMy10019 = checkMy10019;
}
