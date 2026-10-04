import { useCallback, useEffect, useMemo, useState } from "react"
import { FEED_LIMIT, NOSTR_READ_RELAYS } from "./config"
import { DEMO_COMMUNITY_ID, DEMO_POSTS } from "./demoPosts"
import { mergePosts, parseCacheEntry, parsePostEvent, type FeedPost } from "./feedEvent"
import { pool } from "./publish"
import { communityAddress } from "../../services/nostr/communityTags"
import { getCacheEntriesByScope, syncEngine } from "../../services/sync"

export type FeedState = "loading" | "ready" | "error"

/**
 * Community feed: live relay posts (strict filter) merged with her sync queue and cache.
 * Relay copies win, then queue copies (full event, so photos work), then cache (text only).
 */
export function useCommunityPosts(activeCommunityId: string | null, communityIds: string[]) {
  const [relayPosts, setRelayPosts] = useState<FeedPost[]>([])
  const [localPosts, setLocalPosts] = useState<FeedPost[]>([])
  const [state, setState] = useState<FeedState>("loading")
  const [reconnect, setReconnect] = useState(0)
  const idsKey = communityIds.join(",")

  useEffect(() => {
    const bump = () => setReconnect((n) => n + 1)
    window.addEventListener("online", bump)
    return () => window.removeEventListener("online", bump)
  }, [])

  useEffect(() => {
    setRelayPosts([])
    setState("loading")
    const seen = new Map<string, FeedPost>()
    let gotEose = false
    const filter: Record<string, unknown> = { kinds: [1], "#t": ["spill"], limit: FEED_LIMIT }
    if (activeCommunityId) filter["#a"] = [communityAddress(activeCommunityId)]
    const sub = pool.subscribeMany(NOSTR_READ_RELAYS, filter as never, {
      onevent(ev) {
        if (seen.has(ev.id)) return
        const post = parsePostEvent(ev, true)
        if (!post) return
        seen.set(ev.id, post)
        setRelayPosts([...seen.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, FEED_LIMIT))
      },
      oneose() { gotEose = true; setState("ready") },
      onclose() { if (!gotEose) setState("error") },
      maxWait: 8000,
    })
    const t = window.setTimeout(() => setState((s) => (s === "loading" ? "error" : s)), 9000)
    return () => { window.clearTimeout(t); sub.close() }
  }, [activeCommunityId, reconnect])

  const refreshLocal = useCallback(async () => {
    try {
      const scopes = activeCommunityId ? [activeCommunityId] : idsKey.split(",").filter(Boolean)
      const ops = (await syncEngine.getAll()).filter(
        (op) => op.entityType === "community_post" && (!activeCommunityId || op.scope === activeCommunityId),
      )
      const queued = ops.flatMap((op) => {
        const p = op.payload?.event ? parsePostEvent(op.payload.event, false) : null
        return p ? [{ ...p, onRelay: op.status === "synced" }] : []
      })
      const cached = (await Promise.all(scopes.map((s) => getCacheEntriesByScope(s))))
        .flat()
        .filter((e) => e.entityType === "community_post")
        .flatMap((e) => { const p = parseCacheEntry(e.data, e.scope); return p ? [p] : [] })
      setLocalPosts(mergePosts(queued, cached))
    } catch (err) {
      console.warn("Offline queue/cache unavailable", err)
    }
  }, [activeCommunityId, idsKey])

  useEffect(() => {
    void refreshLocal()
    if (activeCommunityId && navigator.onLine) {
      // Same cache fill as her old feed: pull this community into the offline cache.
      void syncEngine.pull(activeCommunityId).then(refreshLocal).catch(() => {})
    }
    const off = syncEngine.on(() => void refreshLocal())
    const iv = window.setInterval(() => void refreshLocal(), 10_000)
    return () => { off(); window.clearInterval(iv) }
  }, [activeCommunityId, refreshLocal])

  // Demo posts are display-only: merged here, never signed, queued or published.
  const posts = useMemo(() => {
    const demo = !activeCommunityId || activeCommunityId === DEMO_COMMUNITY_ID ? DEMO_POSTS : []
    return mergePosts(relayPosts, localPosts, demo)
  }, [relayPosts, localPosts, activeCommunityId])
  return { posts, state, refreshLocal }
}
