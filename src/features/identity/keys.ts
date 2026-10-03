// Nostr identity: a secp256k1 keypair for the current session.
// Seamless login: no passcode. The nsec is kept in sessionStorage only, so it
// is wiped when the tab closes or the user signs out.

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { sha256 } from "@noble/hashes/sha2.js";

const STORAGE_KEY = "spill.identity.v2";
const LEGACY_STORAGE_KEY = "spill.identity.v1"; // old passcode-encrypted format
const SESSION_KEY = "spill.identity.session.v1";
const SESSION_EVENT = "spill:identity-session-change";

export interface Identity {
  privateKeyHex: string;
  npub: string;
  nsec: string;
  /** Separate Cashu P2PK key; never use the Nostr event-signing key for nutzaps. */
  nutzapPrivateKeyHex: string;
  nutzapPubkey: string;
}

interface StoredIdentity {
  npub: string;
  nsec: string;
}

// ---- key generation / import ------------------------------------------

export function createIdentity(): Identity {
  return fromSecretKey(generateSecretKey());
}

/** Accepts an nsec1... key (or 64-character hex). */
export function importIdentity(input: string): Identity {
  const value = input.trim();

  if (value.startsWith("npub1")) {
    throw new Error(
      "That is a public key (npub). To sign in, paste your private key, which starts with nsec1."
    );
  }

  if (value.startsWith("nsec1")) {
    return fromSecretKey(decodeNsec(value));
  }

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return fromSecretKey(hexToBytes(value.toLowerCase()));
  }

  throw new Error("That doesn't look like a Nostr private key. It should start with nsec1.");
}

function decodeNsec(nsec: string): Uint8Array {
  try {
    const decoded = nip19.decode(nsec);
    if (decoded.type === "nsec") return decoded.data;
  } catch {
    // fall through to the error below
  }
  throw new Error("That nsec isn't valid. Check that you copied all of it.");
}

/**
 * The nutzap key is derived from the account key with a labelled hash, so the
 * same nsec always gets the same nutzap key. It is a different key from the
 * signing key, and nothing extra has to be stored between sessions.
 */
function deriveNutzapKey(sk: Uint8Array): Uint8Array {
  const label = new TextEncoder().encode("spill-nutzap-v1");
  const input = new Uint8Array(label.length + sk.length);
  input.set(label, 0);
  input.set(sk, label.length);
  return sha256(input);
}

function fromSecretKey(sk: Uint8Array): Identity {
  const nutzapSecretKey = deriveNutzapKey(sk);
  return {
    privateKeyHex: bytesToHex(sk),
    npub: nip19.npubEncode(getPublicKey(sk)),
    nsec: nip19.nsecEncode(sk),
    nutzapPrivateKeyHex: bytesToHex(nutzapSecretKey),
    nutzapPubkey: getPublicKey(nutzapSecretKey),
  };
}

// ---- storage -----------------------------------------------------------
// The key is kept in sessionStorage only: it lasts for this tab and is wiped
// when the tab closes or the user signs out. Nothing is persisted on the device.

function clearOldDeviceKeys(): void {
  // Remove keys saved by earlier versions, which used localStorage.
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

export function saveIdentity(identity: Pick<Identity, "npub" | "nsec"> & Partial<Identity>): void {
  const record: StoredIdentity = { npub: identity.npub, nsec: identity.nsec };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  clearOldDeviceKeys();
}

export function hasStoredIdentity(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) !== null;
}

export function getStoredNpub(): string | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as StoredIdentity).npub;
  } catch {
    return null;
  }
}

/**
 * Returns the keys for the current session. The passcode argument is ignored:
 * it only exists so existing callers keep working now that there is no passcode.
 */
export async function unlockIdentity(
  _passcode?: string
): Promise<{ privateKeyHex: string; npub: string; nutzapPrivateKeyHex: string; nutzapPubkey: string }> {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("Please sign in first.");
  const record = JSON.parse(raw) as StoredIdentity;
  const sk = decodeNsec(record.nsec);

  const nutzapSecretKey = deriveNutzapKey(sk);

  return {
    privateKeyHex: bytesToHex(sk),
    npub: record.npub,
    nutzapPrivateKeyHex: bytesToHex(nutzapSecretKey),
    nutzapPubkey: getPublicKey(nutzapSecretKey),
  };
}

/** Remove the key from this session (and any old copy on the device). */
export function clearStoredIdentity(): void {
  clearOldDeviceKeys();
  endIdentitySession();
}

// ---- session (used by useIdentitySession and the navbars) --------------

export function beginIdentitySession(): void {
  sessionStorage.setItem(SESSION_KEY, "active");
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** Sign out: ends the session and wipes the key from this tab. */
export function endIdentitySession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  // Wipe per-user app data so the next person on this device doesn't see it.
  for (const key of ["spill.joined", "spill.community-posts", "spill.private-credits.demo-balance"]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable
    }
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function hasActiveIdentitySession(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "active";
}

export const identitySessionEvent = SESSION_EVENT;

// Delete anything left on the device by older versions.
clearOldDeviceKeys();

// ---- ephemeral (pseudonym) keys ----------------------------------------

export function createEphemeralIdentity(): { privateKeyHex: string; npub: string } {
  const sk = generateSecretKey();
  return { privateKeyHex: bytesToHex(sk), npub: nip19.npubEncode(getPublicKey(sk)) };
}

// ---- helpers -----------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
