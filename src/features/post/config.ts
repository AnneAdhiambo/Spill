import { RADIO_API_URL } from "../radio/useRadioNow"

export const API_URL = RADIO_API_URL
// Relays for posts. Dev default is the local Docker relay (see README). Comma-separated override: VITE_NOSTR_RELAYS.
// OPEN QUESTION: reading from public relays will bring spam; we may need to read from our own relay only.
export const NOSTR_RELAYS: string[] = ((import.meta.env.VITE_NOSTR_RELAYS as string | undefined) ?? "ws://localhost:7777")
  .split(",").map((r) => r.trim()).filter(Boolean)
export const MAX_POST_CHARS = 1000
export const MAX_DICTATION_SEC = 120
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/** Relays the feed READS from. The demo laptop is not the machine that created the posts, so the public relays are included. Override: VITE_NOSTR_READ_RELAYS (comma-separated). */
export const NOSTR_READ_RELAYS: string[] = ((import.meta.env.VITE_NOSTR_READ_RELAYS as string | undefined) ?? "ws://localhost:7777,wss://relay.damus.io,wss://relay.nostr.band")
  .split(",").map((r) => r.trim()).filter(Boolean)
export const MAX_EVENT_CONTENT = 16_000
export const FEED_LIMIT = 100
