import { useEffect, useState } from "react"
import type { Event } from "nostr-tools"
import { NOSTR_RELAYS } from "./config"
import { pool } from "./publish"

export type SpillPost = { id: string; createdAt: number; text: string; area: string | null; photo: { url: string; sha256: string } | null; community: string | null }

function toPost(ev: Event): SpillPost {
  const tag = (name: string) => ev.tags.find((t) => t[0] === name)?.[1] ?? null
  const imeta = ev.tags.find((t) => t[0] === "imeta")
  const field = (k: string) => imeta?.slice(1).find((p) => p.startsWith(`${k} `))?.slice(k.length + 1) ?? null
  const url = field("url"), sha = field("x")
  let text = ev.content
  if (url && text.trimEnd().endsWith(url)) text = text.trimEnd().slice(0, -url.length).trimEnd() // photo URL is shown as an image instead
  return { id: ev.id, createdAt: ev.created_at, text, area: tag("area"), community: tag("community"), photo: url && sha ? { url, sha256: sha } : null }
}

/** Live kind 1 events tagged t=spill, newest first. Real posts only; nothing is invented. */
export function useSpillPosts() {
  const [posts, setPosts] = useState<SpillPost[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    const seen = new Map<string, SpillPost>()
    let gotEose = false
    const sub = pool.subscribeMany(NOSTR_RELAYS, { kinds: [1], "#t": ["spill"], limit: 50 }, {
      onevent(ev) {
        if (seen.has(ev.id)) return
        seen.set(ev.id, toPost(ev))
        setPosts([...seen.values()].sort((a, b) => b.createdAt - a.createdAt))
      },
      oneose() { gotEose = true; setState("ready") },
      onclose() { if (!gotEose) setState("error") }, // every relay failed before answering
      maxWait: 8000,
    })
    const t = window.setTimeout(() => setState((s) => (s === "loading" ? "error" : s)), 9000)
    return () => { window.clearTimeout(t); sub.close() }
  }, [])

  return { posts, state }
}
