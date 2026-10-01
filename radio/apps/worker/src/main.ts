import { spawn, type ChildProcess } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { watch } from "node:fs"
import { join } from "node:path"
import { selectBroadcastItem, type BroadcastQueueItem } from "@blocktek/radio-core"
import { discoverMedia } from "./media.js"
import { BroadcastStore } from "./store.js"
import { Ingester, type Recording } from "./ingest.js"
import { mediaRoot, resolveFromRoot } from "./paths.js"

const env = process.env
const bool = (value: string | undefined) => value?.toLowerCase() === "true"
const log = (message: string, data?: Record<string, unknown>) => console.log(JSON.stringify({ service: "blocktek-worker", message, ...data, at: new Date().toISOString() }))

async function runTrack(item: BroadcastQueueItem, sourceUrl: string): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const input = item.path.startsWith("tone://") ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"] : ["-i", item.path]
  const child: ChildProcess = spawn("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-re", ...input, "-vn", "-ac", "2", "-c:a", "libmp3lame", "-b:a", env.RADIO_AUDIO_BITRATE || "128k", "-content_type", "audio/mpeg", "-ice_name", env.RADIO_STATION_NAME || "Spill", "-f", "mp3", sourceUrl], { stdio: ["ignore", "ignore", "pipe"] })
  child.stderr?.on("data", (chunk: Buffer) => log("audio process", { output: chunk.toString().trim().slice(0, 500) }))
  return new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", (code, signal) => resolve({ code, signal })) })
}

async function run() {
  if (!bool(env.RADIO_BROADCAST_ENABLED)) { log("broadcast not configured", { reason: "RADIO_BROADCAST_ENABLED is false" }); return }
  if (!env.DATABASE_URL || !env.ICECAST_SOURCE_PASSWORD || !env.ICECAST_HOST) { log("broadcast not configured", { reason: "DATABASE_URL, ICECAST_SOURCE_PASSWORD, and ICECAST_HOST are required" }); return }
  const root = mediaRoot(env); await mkdir(root, { recursive: true })
  const radioDir = join(root, "radio"); await mkdir(radioDir, { recursive: true })
  const musicDir = join(root, "music"); await mkdir(musicDir, { recursive: true })
  const fallbackPath = env.FALLBACK_AUDIO_PATH ? resolveFromRoot(env.FALLBACK_AUDIO_PATH) : undefined
  log("media paths", { mediaRoot: root, dropFolder: radioDir, musicDir, fallbackPath })
  const store = new BroadcastStore(env.DATABASE_URL)
  // Rotation = ready recordings + music. Fallback/test tone only when nothing else is playable.
  let rotation: BroadcastQueueItem[] = []
  let fallbackItems: BroadcastQueueItem[] = []
  const rebuild = async (recs: Recording[]) => {
    const recItems: BroadcastQueueItem[] = recs.map((r) => ({ id: r.id, title: r.title, artist: r.npub, album: r.space, artworkUrl: null, programme: null, startedAt: new Date().toISOString(), source: "music", path: r.path, durationSeconds: r.durationSec ?? undefined }))
    const music = (await discoverMedia(musicDir, undefined, false)).map((m) => ({ ...m, id: `music-${m.id}` }))
    fallbackItems = await discoverMedia(fallbackPath ?? join(root, "fallback"), undefined, bool(env.RADIO_TEST_TONE_ENABLED))
    rotation = [...recItems, ...music]
    await store.syncMediaAssets([...rotation, ...fallbackItems])
    log("rotation updated", { recordings: recItems.length, music: music.length, fallback: fallbackItems.length })
  }
  const ingester = new Ingester(radioDir, log, rebuild)
  await ingester.scan() // initial scan (transcribes anything new) before the session starts
  await rebuild(ingester.recordings())
  await store.recoverAiQueue(); const mount = env.ICECAST_MOUNT || "/live"; const sessionId = await store.startSession(env.RADIO_STATION_ID || "spill-main", mount)
  const sourceUrl = `icecast://${encodeURIComponent(env.ICECAST_SOURCE_USER || "source")}:${encodeURIComponent(env.ICECAST_SOURCE_PASSWORD)}@${env.ICECAST_HOST}:${env.ICECAST_PORT || "8000"}${mount}`
  let stopping = false; let lastId: string | null = null
  // Background ingest: file watcher (debounced) plus polling fallback. Never blocks playback.
  let debounce: NodeJS.Timeout | undefined
  const trigger = () => { clearTimeout(debounce); debounce = setTimeout(() => void ingester.scan(), 1000) }
  try { watch(radioDir, (_event, name) => { if (name && !String(name).endsWith(".transcript.json") && !String(name).endsWith(".tmp")) trigger() }) } catch (err) { log("file watcher unavailable, polling only", { error: String(err) }) }
  setInterval(() => void ingester.scan(), Number(env.RADIO_INGEST_POLL_MS || 30000))
  const nextItem = async (): Promise<BroadcastQueueItem | null> => {
    const aiItem = await store.claimNextAiItem(); if (aiItem) return aiItem
    const pool = rotation.length ? rotation : fallbackItems
    if (!pool.length) return null
    const at = pool.findIndex((i) => i.id === lastId)
    const item = pool[(at + 1) % pool.length]; lastId = item.id
    const programmeTitle = await store.currentProgrammeTitle()
    return selectBroadcastItem(programmeTitle ? { startTime: "", endTime: "", title: programmeTitle } : null, item, null)
  }
  const shutdown = async (signal: string) => { if (stopping) return; stopping = true; log("broadcast stopping", { signal }); await store.stopSession(sessionId); await store.close() }
  process.once("SIGTERM", () => void shutdown("SIGTERM")); process.once("SIGINT", () => void shutdown("SIGINT"))
  try {
    while (!stopping) { const item = await nextItem(); if (!item) throw new Error("no playable broadcast item"); item.startedAt = new Date().toISOString(); await store.event(sessionId, "track_started", item); log("track started", { id: item.id, title: item.title, source: item.source, programme: item.programme }); const result = await runTrack(item, sourceUrl); if (item.programme) await store.completeAiItem(item); if (stopping) break; if (result.code !== 0) throw new Error(`audio process exited (${result.code ?? result.signal ?? "unknown"})`) }
  } catch (error) { const message = error instanceof Error ? error.message : String(error); log("broadcast worker failed", { error: message }); await store.stopSession(sessionId, message); await store.close(); process.exitCode = 1 }
}
void run().catch((error) => { log("broadcast worker failed", { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1 })
