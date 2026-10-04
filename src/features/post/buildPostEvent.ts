import type { EventTemplate } from "nostr-tools"
import { communityTags } from "../../services/nostr/communityTags"
import { roundedNow } from "./publish"

// Mirrors the limits in src/services/sync/validation.ts (hers). Checked BEFORE signing.
const SCOPE_RE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_TAGS = 20
const MAX_TAG_PART = 512
const MAX_TAG_ELEMENTS = 8
const MAX_CONTENT = 16_000

export class PostLimitError extends Error {}

export type PostPhotoInfo = { url: string; sha256: string; mime: string; sensitiveReason?: string | null }
export type PostDraft = { text: string; communityId: string; area?: string; photo?: PostPhotoInfo | null }

/** kind 1 template: her community tags, t=spill, area, NIP-36 content-warning, NIP-92 imeta. Throws PostLimitError. */
export function buildPostTemplate(draft: PostDraft, now: number = roundedNow()): EventTemplate {
  if (!SCOPE_RE.test(draft.communityId)) throw new PostLimitError("Choose a community before posting.")
  const tags: string[][] = [...communityTags(draft.communityId), ["t", "spill"]]
  const area = draft.area?.trim()
  if (area) tags.push(["area", area])
  let content = draft.text.trim()
  if (draft.photo) {
    const { url, mime, sha256, sensitiveReason } = draft.photo
    if (sensitiveReason) tags.push(["content-warning", sensitiveReason])
    tags.push(["imeta", `url ${url}`, `m ${mime}`, `x ${sha256}`])
    content = `${content}\n\n${url}`.trim()
  }
  if (content.length > MAX_CONTENT) throw new PostLimitError(`This post is too long (${content.length} of ${MAX_CONTENT} characters).`)
  if (tags.length > MAX_TAGS) throw new PostLimitError(`Too many tags (${tags.length} of ${MAX_TAGS}).`)
  for (const tag of tags) {
    if (tag.length > MAX_TAG_ELEMENTS) throw new PostLimitError("A tag has too many parts.")
    if (tag.some((part) => part.length > MAX_TAG_PART)) throw new PostLimitError(`A tag value is too long (over ${MAX_TAG_PART} characters), for example the area or photo link.`)
  }
  return { kind: 1, created_at: now, tags, content }
}
