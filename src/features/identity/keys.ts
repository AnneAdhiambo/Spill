// Nostr identity: BIP-39 mnemonic -> keypair, encrypted at rest with a
// user passcode via the Web Crypto API (AES-GCM), stored in localStorage.
//
// This covers Module 1 of the TRD ("Primary Master Keypair"). Ephemeral
// pseudonym keys are a separate, simpler feature (generate a key, sign,
// discard) and are not part of this file.

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";

const STORAGE_KEY = "spill.identity.v1";
const SESSION_KEY = "spill.identity.session.v1";
const SESSION_EVENT = "spill:identity-session-change";
const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 minimum recommendation for PBKDF2-SHA256

export interface NewIdentity {
  mnemonic: string;      // 12 words - show once, user must confirm they saved it
  privateKeyHex: string; // raw private key, for immediate in-memory use only
  npub: string;
  nsec: string;
}

export interface StoredIdentity {
  npub: string;
  cipher: string; // base64 ciphertext of the private key
  salt: string;   // base64
  iv: string;     // base64
}

// ---- key generation ---------------------------------------------------

/** Generate a fresh 12-word mnemonic and derive a Nostr keypair from it. */
export function createIdentity(): NewIdentity {
  const mnemonic = bip39.generateMnemonic(128); // 128 bits -> 12 words
  const { privateKeyHex } = deriveFromMnemonic(mnemonic);
  return keypairFromPrivateKeyHex(privateKeyHex, mnemonic);
}

/** Re-derive the same keypair from a mnemonic the user is importing. */
export function importIdentity(mnemonic: string): NewIdentity {
  const normalized = mnemonic.trim().toLowerCase();
  if (!bip39.validateMnemonic(normalized)) {
    throw new Error("That 12-word phrase doesn't look right. Check the spelling and word order.");
  }
  const { privateKeyHex } = deriveFromMnemonic(normalized);
  return keypairFromPrivateKeyHex(privateKeyHex, normalized);
}

function deriveFromMnemonic(mnemonic: string) {
  // Standard Nostr derivation path (NIP-06): m/44'/1237'/0'/0/0
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/1237'/0'/0/0");
  if (!child.privateKey) throw new Error("Key derivation failed.");
  const privateKeyHex = bytesToHex(child.privateKey);
  return { privateKeyHex };
}

function keypairFromPrivateKeyHex(privateKeyHex: string, mnemonic: string): NewIdentity {
  const sk = hexToBytes(privateKeyHex);
  const pk = getPublicKey(sk);
  return {
    mnemonic,
    privateKeyHex,
    npub: nip19.npubEncode(pk),
    nsec: nip19.nsecEncode(sk),
  };
}

// ---- encrypt / store / unlock -----------------------------------------

/** Encrypt the private key with a passcode and save it to localStorage. */
export async function saveIdentity(identity: NewIdentity, passcode: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passcode, salt);

  const plaintext = new TextEncoder().encode(identity.privateKeyHex);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toWebCryptoBytes(iv) },
    key,
    toWebCryptoBytes(plaintext)
  );

  const record: StoredIdentity = {
    npub: identity.npub,
    cipher: toBase64(new Uint8Array(cipherBuf)),
    salt: toBase64(salt),
    iv: toBase64(iv),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

/** Whether an encrypted identity already exists on this device. */
export function hasStoredIdentity(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function getStoredNpub(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return (JSON.parse(raw) as StoredIdentity).npub;
}

/** Unlock the stored identity with a passcode. Throws on wrong passcode. */
export async function unlockIdentity(passcode: string): Promise<{ privateKeyHex: string; npub: string }> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("No saved identity on this device.");
  const record = JSON.parse(raw) as StoredIdentity;

  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const key = await deriveAesKey(passcode, salt);

  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toWebCryptoBytes(iv) },
      key,
      toWebCryptoBytes(fromBase64(record.cipher))
    );
    const privateKeyHex = new TextDecoder().decode(plainBuf);
    return { privateKeyHex, npub: record.npub };
  } catch {
    // AES-GCM authentication failure = wrong passcode (or corrupted data)
    throw new Error("Incorrect passcode.");
  }
}

export function clearStoredIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  endIdentitySession();
}

/** Mark the encrypted local identity as unlocked for this browser session. */
export function beginIdentitySession(): void {
  sessionStorage.setItem(SESSION_KEY, "active");
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** Lock the local identity without deleting its encrypted backup. */
export function endIdentitySession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function hasActiveIdentitySession(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "active";
}

export const identitySessionEvent = SESSION_EVENT;

// ---- ephemeral (pseudonym) keys ---------------------------------------

/** A one-off keypair for anonymous posting. Caller is responsible for
 *  discarding it (or keeping it in an isolated in-memory "drawer") -
 *  it is never written to localStorage. */
export function createEphemeralIdentity(): { privateKeyHex: string; npub: string } {
  const sk = generateSecretKey();
  return { privateKeyHex: bytesToHex(sk), npub: nip19.npubEncode(getPublicKey(sk)) };
}

// ---- helpers ------------------------------------------------------------

async function deriveAesKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toWebCryptoBytes(new TextEncoder().encode(passcode)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toWebCryptoBytes(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Web Crypto requires an ArrayBuffer-backed view, so copy generic byte arrays. */
function toWebCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
