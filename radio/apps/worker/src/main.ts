import { spawn, type ChildProcess } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { watch } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { Redis } from "ioredis"
import type { BroadcastQueueItem } from "@blocktek/radio-core"
import { discoverMedia } from "./media.js"
import { BroadcastStore } from "./store.js"
import { Ingester, type Recording } from "./ingest.js"
import { mediaRoot, resolveFromRoot } from "./paths.js"
import { planBlock, type Candidate } from "./dj.js"

const env = process.env
const bool = (value: string | undefined) => value?.toLowerCase() === "true"
const log = (message: string, data?: Record<string, unknown>) => console.log(JSON.stringify({ service: "blocktek-worker", message, ...data, at: new Date().toISOString() }))

type Kind = "recording" | "music" | "fallback"
type CatalogEntry = { item: BroadcastQueueItem; kind: Kind; npub: string | null; space: string | null; language: string | null; excerpt: string; transcriptPath: string | null }
type QueueEntry = { id: string; reason: string | null }

const SAMPLE_RATE = 44100
const NOW_KEY = "radio:now"

/** One long-lived encoder feeds Icecast; each track is decoded to raw PCM and piped in, so listeners never see a reconnect. */
function startEncoder(sourceUrl: string): ChildProcess {
  const enc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "2", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", env.RADIO_AUDIO_BITRATE || "128k", "-content_type", "audio/mpeg", "-ice_name", env.RADIO_STATION_NAME || "Spill", "-f", "mp3", sourceUrl], { stdio: ["pipe", "ignore", "pipe"] })
  enc.stderr?.on("data", (chunk: Buffer) => log("audio process", { output: chunk.toString().trim().slice(0, 500) }))
  enc.stdin?.on("error", () => {})
  return enc
}

function playInto(enc: ChildProcess, item: BroadcastQueueItem): Promise<number | null> {
  const input = item.path.startsWith("tone://") ? ["-f", "lavfi", "-t", "30", "-i", `sine=frequency=440:sample_rate=${SAMPLE_RATE}`] : ["-i", item.path]
  const dec = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-re", ...input, "-vn", "-ac", "2", "-ar", String(SAMPLE_RATE), "-f", "s16le", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] })
  dec.stderr?.on("data", (chunk: Buffer) => log("decoder", { id: item.id, output: chunk.toString().trim().slice(0, 300) }))
  dec.stdout?.pipe(enc.stdin!, { end: false })
  return new Promise((resolve, reject) => { dec.on("error", reject); dec.on("exit", (code) => resolve(code)) })
}

async function run() {
  if (!bool(env.RADIO_BROADCAST_ENABLED)) { log("broadcast not configured", { reason: "RADIO_BROADCAST_ENABLED is false" }); return }
  if (!env.DATABASE_URL || !env.ICECAST_SOURCE_PASSWORD || !env.ICECAST_HOST) { log("broadcast not configured", { reason: "DATABASE_URL, ICECAST_SOURCE_PASSWORD, and ICECAST_HOST are required" }); return }
  const root = mediaRoot(env); await mkdir(root, { recursive: true })
  const radioDir = join(root, "radio"); await mkdir(radioDir, { recursive: true })
  const musicDir = join(root, "music"); await mkdir(musicDir, { recursive: true })
  const fallbackPath = env.FALLBACK_AUDIO_PATH ? resolveFromRoot(env.FALLBACK_AUDIO_PATH) : join(root, "fallback")
  log("media paths", { mediaRoot: root, dropFolder: radioDir, musicDir, fallbackPath })
  const store = new BroadcastStore(env.DATABASE_URL)

  let redis: Redis | null = null
  if (env.REDIS_URL) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    let warned = false
    redis.on("error", (e) => { if (!warned) { warned = true; log("redis unavailable, now-playing state not published", { error: e.message }) } })
    redis.on("ready", () => { warned = false })
  } else log("REDIS_URL not set; now-playing state is not published")

  // Catalogue: ready recordings + music. Fallback audio is only used when nothing else is playable.
  let catalog = new Map<string, CatalogEntry>()
  let fallbackItems: BroadcastQueueItem[] = []
  const rebuild = async (recs: Recording[]) => {
    const next = new Map<string, CatalogEntry>()
    for (const r of recs) next.set(r.id, { item: { id: r.id, title: r.title, artist: r.npub, album: r.space, artworkUrl: null, programme: null, startedAt: new Date().toISOString(), source: "music", path: r.path, durationSeconds: r.durationSec ?? undefined }, kind: "recording", npub: r.npub, space: r.space, language: r.language, excerpt: r.excerpt, transcriptPath: `${r.path}.transcript.json` })
    const music = await discoverMedia(musicDir, undefined, false)
    for (const m of music) next.set(`music-${m.id}`, { item: { ...m, id: `music-${m.id}` }, kind: "music", npub: null, space: null, language: null, excerpt: "", transcriptPath: null })
    fallbackItems = (await discoverMedia(fallbackPath, undefined, bool(env.RADIO_TEST_TONE_ENABLED))).map((f) => ({ ...f, id: `fallback-${f.id}` }))
    catalog = next
    await store.syncMediaAssets([...[...next.values()].map((e) => e.item), ...fallbackItems])
    log("rotation updated", { recordings: recs.length, music: music.length, fallback: fallbackItems.length })
  }
  const ingester = new Ingester(radioDir, log, rebuild)
  await ingester.scan() // transcribe anything new before going on air; later scans run in the background
  await rebuild(ingester.recordings())

  const mount = env.ICECAST_MOUNT || "/live"
  await store.recoverAiQueue()
  const sessionId = await store.startSession(env.RADIO_STATION_ID || "spill-main", mount)
  const sourceUrl = `icecast://${encodeURIComponent(env.ICECAST_SOURCE_USER || "source")}:${encodeURIComponent(env.ICECAST_SOURCE_PASSWORD)}@${env.ICECAST_HOST}:${env.ICECAST_PORT || "8000"}${mount}`
  let stopping = false

  // Background ingest: debounced file watcher plus polling fallback. Never blocks playback.
  let debounce: NodeJS.Timeout | undefined
  const trigger = () => { clearTimeout(debounce); debounce = setTimeout(() => void ingester.scan(), 1000) }
  try { watch(radioDir, (_e, name) => { const n = String(name || ""); if (n && !n.endsWith(".transcript.json") && !n.endsWith(".tmp")) trigger() }) } catch (err) { log("file watcher unavailable, polling only", { error: String(err) }) }
  setInterval(() => void ingester.scan(), Number(env.RADIO_INGEST_POLL_MS || 30000))

  // ---- AI DJ queue ----
  const queue: QueueEntry[] = []
  const history: string[] = []
  const lastPlayedAt = new Map<string, number>()
  let current: { id: string; entry: CatalogEntry | null; item: BroadcastQueueItem; startedAtMs: number } | null = null
  let planning: Promise<void> | null = null
  let pendingId: string | null = null // dequeued but not yet started; counts as current for planning
  const maxItemSec = Number(env.RADIO_MAX_ITEM_SECONDS || 1800)
  const cooldownItems = Number(env.RADIO_REPEAT_COOLDOWN_ITEMS || 3)

  const publish = async () => {
    if (!redis) return
    const upNext = queue.flatMap((q) => { const e = catalog.get(q.id); return e ? [{ id: q.id, title: e.item.title, kind: e.kind, durationSec: e.item.durationSeconds ? Math.round(e.item.durationSeconds) : null, reason: q.reason }] : [] })
    const state = current ? { id: current.id, title: current.item.title, kind: current.entry?.kind ?? "fallback", npub: current.entry?.npub ?? null, space: current.entry?.space ?? null, startedAt: new Date(current.startedAtMs).toISOString(), startedAtMs: current.startedAtMs, durationSec: current.item.durationSeconds ? Math.round(current.item.durationSeconds * 10) / 10 : null, transcriptPath: current.entry?.transcriptPath ?? null, upNext, updatedAt: Date.now() } : null
    try { if (state) await redis.set(NOW_KEY, JSON.stringify(state), "EX", 20); else await redis.del(NOW_KEY) } catch { /* logged once by the error handler */ }
  }
  setInterval(() => void publish(), 5000)

  const plan = (): Promise<void> => {
    if (planning) return planning
    planning = (async () => {
      const pool = [...catalog.entries()].filter(([, e]) => !e.item.durationSeconds || e.item.durationSeconds <= maxItemSec)
      const k = Math.max(1, Math.min(cooldownItems, pool.length - 1))
      // Sequence as the listener will hear it: played history, the current item, then the queue.
      const seq = [...history, ...(pendingId ? [pendingId] : []), ...queue.map((q) => q.id)]
      const lastIndex = (id: string) => seq.lastIndexOf(id)
      const recent = new Set(seq.slice(-k))
      let eligible = pool.filter(([id]) => id !== current?.id && id !== pendingId && !recent.has(id))
      let relaxed = false
      if (!eligible.length) { // cooldown cannot be met: never the current or the immediately preceding item
        eligible = pool.filter(([id]) => id !== current?.id && id !== pendingId && id !== seq[seq.length - 1]); relaxed = true
      }
      eligible.sort((a, b) => lastIndex(a[0]) - lastIndex(b[0])) // least recently played first
      if (!eligible.length) return
      eligible.sort((a, b) => (lastPlayedAt.get(a[0]) ?? 0) - (lastPlayedAt.get(b[0]) ?? 0))
      const candidates: Candidate[] = eligible.map(([id, e]) => ({ id, title: e.item.title, kind: e.kind as "recording" | "music", language: e.language, durationSec: e.item.durationSeconds ?? null, excerpt: e.excerpt }))
      const lastId = queue.length ? queue[queue.length - 1].id : current?.id
      const result = await planBlock({ candidates, blockSize: 4 + Math.floor(Math.random() * 3), lastWasMusic: lastId ? catalog.get(lastId)?.kind === "music" : false, env })
      if (!result.items.length) return
      queue.push(...result.items)
      const decisionId = randomUUID()
      await store.saveDecision({ id: decisionId, provider: result.provider, model: result.model, order: result.items.map((i) => i.id), status: result.status, error: result.error, latencyMs: result.latencyMs }).catch((e) => log("decision save failed", { error: String(e).slice(0, 200) }))
      log(result.status === "FALLBACK" ? "dj decision: fallback" : "dj decision: ai", { decisionId, items: result.items.length, cooldownRelaxed: relaxed, error: result.error, latencyMs: result.latencyMs })
      await publish()
    })().catch((e) => log("dj planning failed", { error: String(e).slice(0, 200) })).finally(() => { planning = null })
    return planning
  }

  let fallbackIndex = -1
  const nextItem = async (): Promise<{ item: BroadcastQueueItem; entry: CatalogEntry | null } | null> => {
    if (!queue.length) await plan()
    while (queue.length) {
      const q = queue.shift()!
      const entry = catalog.get(q.id)
      if (entry) { pendingId = q.id; if (queue.length < 3) void plan(); return { item: entry.item, entry } } // deleted files are skipped
    }
    if (!fallbackItems.length) return null
    fallbackIndex = (fallbackIndex + 1) % fallbackItems.length
    return { item: fallbackItems[fallbackIndex], entry: null }
  }

  // The encoder is respawned if Icecast drops it (restart, network), so the worker never needs a manual restart.
  let encoder!: ChildProcess
  let encoderUp = false
  const spawnEncoder = () => {
    encoder = startEncoder(sourceUrl); encoderUp = true
    const me = encoder
    me.on("exit", (code, signal) => { if (me === encoder) { encoderUp = false; if (!stopping) log("encoder exited, will reconnect", { code, signal }) } })
  }
  spawnEncoder()
  const shutdown = async (signal: string) => { if (stopping) return; stopping = true; log("broadcast stopping", { signal }); encoder.kill("SIGTERM"); await redis?.del(NOW_KEY).catch(() => {}); await store.stopSession(sessionId); await store.close(); redis?.disconnect() }
  process.once("SIGTERM", () => void shutdown("SIGTERM")); process.once("SIGINT", () => void shutdown("SIGINT"))
  try {
    while (!stopping) {
      if (!encoderUp) { await new Promise((r) => setTimeout(r, 2000)); if (!stopping) spawnEncoder(); continue }
      const next = await nextItem()
      if (!next) throw new Error("no playable broadcast item")
      const { item, entry } = next
      current = { id: item.id, entry, item, startedAtMs: Date.now() }
      lastPlayedAt.set(item.id, current.startedAtMs); history.push(item.id); pendingId = null; if (history.length > 100) history.shift()
      void store.event(sessionId, "track_started", item).catch(() => {})
      log("track started", { id: item.id, title: item.title, kind: entry?.kind ?? "fallback", queued: queue.length })
      await publish()
      const code = await playInto(encoder, item)
      if (code !== 0 && !stopping) { log("decoder failed, skipping item", { id: item.id, code }); await new Promise((r) => setTimeout(r, 1000)) }
    }
  } catch (error) { const message = error instanceof Error ? error.message : String(error); log("broadcast worker failed", { error: message }); encoder.kill("SIGTERM"); await redis?.del(NOW_KEY).catch(() => {}); await store.stopSession(sessionId, message); await store.close(); redis?.disconnect(); process.exitCode = 1 }
}
void run().catch((error) => { log("broadcast worker failed", { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1 })
