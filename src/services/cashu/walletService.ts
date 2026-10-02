import { MintQuoteState, Wallet, getTokenMetadata, normalizeMintUrl, type Proof } from "@cashu/cashu-ts";
const storageKey = "spill.cashu.wallet.v1", iterations = 600_000, legacyIterations = 210_000, minimumPasscodeLength = 8;
const endpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? "http://localhost:3001/api/livekit/token";
type PendingQuote = { quote: string; amount: number; request: string; expiresAt?: number };
type WalletState = { proofs: Proof[]; pending: PendingQuote[]; history: Array<{ id: string; type: "funds" | "received" | "zap" | "premium"; amount: number; at: number }> };
type EncryptedState = { cipher: string; salt: string; iv: string; iterations?: number };
function b64(bytes: Uint8Array) { let raw = ""; bytes.forEach((byte) => raw += String.fromCharCode(byte)); return btoa(raw); }
function unb64(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
function arrayBuffer(bytes: Uint8Array) { return new Uint8Array(bytes); }
function assertPasscode(passcode: string) { if (passcode.length < minimumPasscodeLength) throw new Error(`Use at least ${minimumPasscodeLength} characters for your device passcode.`); }
async function derivedKey(passcode: string, salt: Uint8Array, workFactor = iterations) { const base = await crypto.subtle.importKey("raw", arrayBuffer(new TextEncoder().encode(passcode)), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt: arrayBuffer(salt), iterations: workFactor, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
export async function read(passcode: string): Promise<WalletState> { assertPasscode(passcode); const raw = localStorage.getItem(storageKey); if (!raw) return { proofs: [], pending: [], history: [] }; const record = JSON.parse(raw) as EncryptedState; try { const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: arrayBuffer(unb64(record.iv)) }, await derivedKey(passcode, unb64(record.salt), record.iterations ?? legacyIterations), arrayBuffer(unb64(record.cipher))); return JSON.parse(new TextDecoder().decode(plain)) as WalletState; } catch { throw new Error("Incorrect passcode or unreadable wallet."); } }
export async function save(passcode: string, state: WalletState) { assertPasscode(passcode); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: arrayBuffer(iv) }, await derivedKey(passcode, salt), arrayBuffer(new TextEncoder().encode(JSON.stringify(state)))); localStorage.setItem(storageKey, JSON.stringify({ cipher: b64(new Uint8Array(cipher)), salt: b64(salt), iv: b64(iv), iterations } satisfies EncryptedState)); }
export function validateReceiveMetadata(metadata: { mint: string; unit: string | undefined }, configuredMintUrl: string) {
  if (normalizeMintUrl(metadata.mint) !== normalizeMintUrl(configuredMintUrl)) throw new Error("This wallet only accepts sats from its configured payment provider.");
  if (metadata.unit !== "sat") throw new Error("This wallet only accepts sats from its configured payment provider.");
}
export function balanceAfterReceive(existing: Proof[], received: Proof[]) { return [...existing, ...received].reduce((sum, proof) => sum + Number(proof.amount), 0); }
async function wallet() { const response = await fetch(new URL("/api/cashu/config", endpoint)); const config = await response.json() as { mintUrl?: string }; if (!response.ok || !config.mintUrl) throw new Error("Wallet funding is not configured."); const value = new Wallet(normalizeMintUrl(config.mintUrl), { unit: "sat" }); await value.loadMint(); return value; }
export async function walletSnapshot(passcode: string) { const state = await read(passcode); return { ...state, balance: state.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0) }; }
export async function createFundingQuote(passcode: string, amount: number) { if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("Enter a whole number of sats."); const value = await wallet(), quote = await value.createMintQuoteBolt11(amount), state = await read(passcode); state.pending = [...state.pending.filter((item) => item.quote !== quote.quote), { quote: quote.quote, amount, request: quote.request, expiresAt: quote.expiry ?? undefined }]; await save(passcode, state); return { quoteId: quote.quote, invoice: quote.request, expiresAt: quote.expiry ?? undefined }; }
export async function claimFundingQuote(passcode: string, quoteId: string) { const state = await read(passcode), pending = state.pending.find((item) => item.quote === quoteId); if (!pending) throw new Error("Funding request was not found on this device."); const value = await wallet(), checked = await value.checkMintQuoteBolt11(quoteId); if (checked.state !== MintQuoteState.PAID) throw new Error(checked.state === MintQuoteState.UNPAID ? "Invoice is waiting for payment." : "Invoice expired or could not be paid. Create a new one."); const proofs = await value.mintProofsBolt11(pending.amount, quoteId); state.proofs.push(...proofs); state.pending = state.pending.filter((item) => item.quote !== quoteId); state.history.unshift({ id: quoteId, type: "funds", amount: pending.amount, at: Date.now() }); await save(passcode, state); return walletSnapshot(passcode); }
export async function receiveToken(passcode: string, token: string) { const meta = getTokenMetadata(token), value = await wallet(); validateReceiveMetadata(meta, value.mint.mintUrl); const state = await read(passcode), proofs = await value.receive(token, { requireDleq: true }), amount = proofs.reduce((sum, proof) => sum + Number(proof.amount), 0); state.proofs.push(...proofs); state.history.unshift({ id: crypto.randomUUID(), type: "received", amount, at: Date.now() }); await save(passcode, state); return walletSnapshot(passcode); }
export function hasWallet(): boolean { return Boolean(localStorage.getItem(storageKey)); }
export async function initializeWallet(passcode: string) { const state = await read(passcode); await save(passcode, state); return walletSnapshot(passcode); }
export async function resumePendingQuotes(passcode: string) {
  const state = await read(passcode);
  if (!state.pending || state.pending.length === 0) return walletSnapshot(passcode);
  let changed = false;
  let value: Wallet | null = null;
  const remainingPending: PendingQuote[] = [];
  for (const item of state.pending) {
    try {
      if (!value) value = await wallet();
      const checked = await value.checkMintQuoteBolt11(item.quote);
      if (checked.state === MintQuoteState.PAID) {
        const proofs = await value.mintProofsBolt11(item.amount, item.quote);
        state.proofs.push(...proofs);
        state.history.unshift({ id: item.quote, type: "funds", amount: item.amount, at: Date.now() });
        changed = true;
      } else if (item.expiresAt && Date.now() > item.expiresAt * 1000) {
        changed = true;
      } else {
        remainingPending.push(item);
      }
    } catch {
      remainingPending.push(item);
    }
  }
  if (changed) {
    state.pending = remainingPending;
    await save(passcode, state);
  }
  return walletSnapshot(passcode);
}
export async function exportWalletBackup(passcode: string) { return JSON.stringify(await read(passcode)); }
export async function restoreWalletBackup(passcode: string, backup: string) {
  let restored: WalletState; try { restored = JSON.parse(backup) as WalletState; } catch { throw new Error("That wallet backup is not valid."); }
  if (!Array.isArray(restored.proofs) || !Array.isArray(restored.pending) || !Array.isArray(restored.history)) throw new Error("That wallet backup is not valid.");
  const current = await read(passcode);
  const proofs = [...current.proofs, ...restored.proofs].filter((proof, index, all) => all.findIndex((item) => item.secret === proof.secret) === index);
  const pending = [...current.pending, ...restored.pending].filter((item, index, all) => all.findIndex((other) => other.quote === item.quote) === index);
  const history = [...current.history, ...restored.history].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).sort((a, b) => b.at - a.at);
  await save(passcode, { proofs, pending, history }); return walletSnapshot(passcode);
}
