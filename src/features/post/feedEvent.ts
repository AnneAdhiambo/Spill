import type { Event } from "nostr-tools"
import { MAX_EVENT_CONTENT } from "./config"

/** A post as the Communities feed shows it. Built only from real events or cache entries. */
export type FeedPost = {
  id: string
  pubkey: string
  createdAt: number
  text: string
  communityId: string | null
  /** NIP-92 photo: only the hash is kept; the URL is rebuilt from the viewer's own API base. */
  photoSha256: string | null
  /** NIP-36 content-warning reason, if the photo is marked sensitive. */
  sensitiveReason: string | null
  /** True when a relay delivered it, or the sync queue says a relay accepted it. */
  onRelay: boolean
}

const SCOPE_RE = /^[A-Za-z0-9_-]{1,64}$/
const SHA_RE = /^[0-9a-f]{64}$/

export const isValidContent = (c: unknown): c is string =>
  typeof c === "string" && c.trim().length > 0 && c.length <= MAX_EVENT_CONTENT

export function parsePostEvent(ev: Pick<Event, "id" | "pubkey" | "created_at" | "tags" | "content">, onRelay: boolean): FeedPost | null {
  if (!isValidContent(ev.content)) return null
  const tag = (name: string) => ev.tags.find((t) => t[0] === name)
  const h = tag("h")?.[1]
  const imeta = tag("imeta")
  const field = (k: string) => imeta?.slice(1).find((p) => p.startsWith(`${k} `))?.slice(k.length + 1) ?? null
  const url = field("url")
  const sha = field("x")
  let text = ev.content
  if (url && text.trimEnd().endsWith(url)) text = text.trimEnd().slice(0, -url.length).trimEnd()
  const cw = tag("content-warning")
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    createdAt: ev.created_at,
    text,
    communityId: h && SCOPE_RE.test(h) ? h : null,
    photoSha256: sha && SHA_RE.test(sha) ? sha : null,
    sensitiveReason: cw ? (cw[1]?.trim() || "sensitive material") : null,
    onRelay,
  }
}

/** Cache entries hold only {id, content, pubkey, createdAt}. Text only. */
export function parseCacheEntry(data: Record<string, unknown>, scope: string): FeedPost | null {
  const { id, content, pubkey, createdAt } = data
  if (typeof id !== "string" || typeof pubkey !== "string" || typeof createdAt !== "number") return null
  if (!isValidContent(content)) return null
  return { id, pubkey, createdAt, text: content, communityId: scope, photoSha256: null, sensitiveReason: null, onRelay: false }
}

/** Dedupe by event id. Earlier lists win, so pass the richest source first (relay, then queue, then cache). */
export function mergePosts(...lists: FeedPost[][]): FeedPost[] {
  const byId = new Map<string, FeedPost>()
  for (const list of lists) for (const p of list) if (!byId.has(p.id)) byId.set(p.id, p)
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}
