import { finalizeEvent } from "nostr-tools";
import type { Event, EventTemplate } from "nostr-tools";
import { createEphemeralIdentity, unlockIdentity } from "../identity/keys";

export interface Signer {
  sign(template: EventTemplate): Promise<Event>;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Signs with the session identity (the same pseudonym she uses for joining and zaps).
 * unlockIdentity() takes no argument and throws "Please sign in first." without a session.
 */
export class SessionSigner implements Signer {
  async sign(template: EventTemplate): Promise<Event> {
    const { privateKeyHex } = await unlockIdentity();
    return finalizeEvent(template, hexToBytes(privateKeyHex));
  }
}

/**
 * (Unused) A fresh random key for every post: sign, then discard. The key is never stored and never sent anywhere.
 * Uses the team's createEphemeralIdentity() from features/identity/keys.ts.
 * OPEN QUESTION: one-time keys vs a persistent pseudonymous identity; the team needs to decide.
 * Swap this class for another Signer (e.g. one that unlocks the stored identity) to change that.
 */
export class OneTimeKeySigner implements Signer {
  async sign(template: EventTemplate): Promise<Event> {
    const { privateKeyHex } = createEphemeralIdentity();
    return finalizeEvent(template, hexToBytes(privateKeyHex));
  }
}
