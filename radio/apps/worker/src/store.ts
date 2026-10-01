import postgres from "postgres"
import { stat, readFile } from "node:fs/promises"
import { dirname, basename } from "node:path"
import type { BroadcastQueueItem } from "@blocktek/radio-core"
import validateNpub from "../../shared/src/npub.js"
import { transcribeFile, writeTranscript } from "../../shared/src/transcriber.js"

export class BroadcastStore {
  private readonly sql: postgres.Sql
  constructor(databaseUrl: string) { this.sql = postgres(databaseUrl, { max: 2, idle_timeout: 20 }) }

  async startSession(stationId: string, mount: string): Promise<string> {
    const id = `broadcast-${Date.now()}`
    await this.sql`UPDATE broadcast_sessions SET status = 'STOPPED', ended_at = now(), updated_at = now() WHERE status IN ('RUNNING', 'DEGRADED')`
    await this.sql`INSERT INTO broadcast_sessions (id, station_id, status, stream_mount, started_at) VALUES (${id}, ${stationId}, 'RUNNING', ${mount}, now())`
    await this.event(id, "broadcast_started", null)
    return id
  }

  async recoverAiQueue() {
    await this.sql`UPDATE ai_programming_queue SET status = 'PENDING' WHERE status = 'PLAYING'`
  }

  async syncMediaAssets(items: BroadcastQueueItem[]) {
    for (const item of items.filter((candidate) => !candidate.path.startsWith("tone://"))) {
      // Determine transcript and manifest presence so we can mark privacy_verified
      // according to the minimal eligibility rule: audio exists, transcript exists, npub valid.
      let transcriptExists = false
      let npubValid = false
      let transcriptContent: any = null
      try {
        const transcriptPath = `${item.path}.transcript.json`
        const s = await stat(transcriptPath)
        if (s.isFile()) {
          // validate transcript content: non-empty text and audioSha256 matches
          try {
            const raw = await readFile(transcriptPath, { encoding: "utf8" })
            transcriptContent = JSON.parse(raw)
            const text = transcriptContent?.transcript?.text || ""
            if (typeof text === "string" && text.trim()) {
              // compute sha256 of current audio file to detect staleness
              const computeSha256 = async (p: string) => {
                return await new Promise<string>((resolve, reject) => {
                  const hash = require("node:crypto").createHash("sha256")
                  const stream = require("node:fs").createReadStream(p)
                  stream.on("data", (chunk: any) => hash.update(chunk))
                  stream.on("end", () => resolve(hash.digest("hex")))
                  stream.on("error", reject)
                })
              }
              const currentSha = await computeSha256(item.path)
              if (transcriptContent.audioSha256 && transcriptContent.audioSha256 === currentSha) {
                transcriptExists = true
              } else {
                transcriptExists = false
              }
            } else {
              transcriptExists = false
            }
          } catch {
            transcriptExists = false
          }
        }
      } catch {
        transcriptExists = false
      }
      let manifestEntry: any = null
      try {
        const manifestPath = `${dirname(item.path)}/manifest.json`
        const contents = await readFile(manifestPath, { encoding: "utf8" })
        const manifest = JSON.parse(contents)
        const fileName = basename(item.path)
        manifestEntry = Array.isArray(manifest) ? manifest.find((e: any) => e.file === fileName || e.path === fileName || e.file === item.title) : null
        const npub = manifestEntry?.npub || null
        if (typeof npub === "string") npubValid = validateNpub(npub)
      } catch {
        npubValid = false
      }

      // If we have a manifest entry and an existing valid transcript, but the manifest
      // metadata changed (title/npub), write an updated transcript JSON without re-transcribing.
      if (transcriptExists && manifestEntry && transcriptContent) {
        const needsUpdate = (manifestEntry.title && manifestEntry.title !== transcriptContent.title) || (manifestEntry.npub && manifestEntry.npub !== transcriptContent.npub)
        if (needsUpdate) {
          try {
            // reuse existing transcript payload but update manifest metadata
            await writeTranscript(item.path, manifestEntry, { transcript: transcriptContent.transcript, audioSha256: transcriptContent.audioSha256, durationSec: transcriptContent.durationSec || null })
          } catch (err) {
            console.error({ service: "worker", message: "transcript_rewrite_failed", file: item.path, error: err instanceof Error ? err.message : String(err) })
          }
        }
      }

      // If no transcript yet (or stale), try to transcribe using configured transcriber.
      if (!transcriptExists) {
        // Retry up to 3 attempts with exponential backoff per file
        let attempts = 0
        let lastErr: any = null
        while (attempts < 3 && !transcriptExists) {
          attempts += 1
          try {
            const result = await transcribeFile(item.path)
            if (result) {
              await writeTranscript(item.path, manifestEntry, result)
              transcriptExists = true
              break
            }
          } catch (err) {
            lastErr = err
            // exponential backoff: 1s, 2s
            const backoff = attempts * 1000
            await new Promise((r) => setTimeout(r, backoff))
          }
        }
        if (!transcriptExists && lastErr) {
          // Log once: transcription failed after retries
          console.error({ service: "blocktek-worker", message: "transcription_failed", file: item.path, attempts, error: lastErr instanceof Error ? lastErr.message : String(lastErr), at: new Date().toISOString() })
        }
      }
      // OPEN QUESTION: replace with a proper eligible flag before Phase 7 drops the privacy tables.
      const privacyVerified = transcriptExists && npubValid
      await this.sql`INSERT INTO media_assets (id, title, artist, album, path, kind, duration_seconds, artwork_url, enabled, privacy_verified, editorial_approved)
        VALUES (${item.id}, ${item.title}, ${item.artist}, ${item.album}, ${item.path}, ${item.source}, ${item.durationSeconds ? Math.round(item.durationSeconds) : null}, ${item.artworkUrl}, true, ${privacyVerified}, true)
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, artist = EXCLUDED.artist, album = EXCLUDED.album, path = EXCLUDED.path, kind = EXCLUDED.kind, duration_seconds = EXCLUDED.duration_seconds, artwork_url = EXCLUDED.artwork_url, enabled = true, privacy_verified = EXCLUDED.privacy_verified, editorial_approved = EXCLUDED.editorial_approved, updated_at = now()`
    }
  }

  async event(sessionId: string, eventType: string, item: BroadcastQueueItem | null, error?: string) {
    const id = `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const metadata = item ? { id: item.id, title: item.title, artist: item.artist, album: item.album, artworkUrl: item.artworkUrl, programme: item.programme, source: item.source } : {}
    await this.sql`INSERT INTO broadcast_events (id, session_id, media_asset_id, event_type, metadata, started_at) VALUES (${id}, ${sessionId}, ${item?.path.startsWith("tone://") ? null : item?.id || null}, ${eventType}, ${this.sql.json(metadata)}, now())`
    if (error) await this.sql`UPDATE broadcast_sessions SET status = 'DEGRADED', last_error = ${error.slice(0, 500)}, updated_at = now() WHERE id = ${sessionId}`
  }

  async currentProgrammeTitle(): Promise<string | null> {
    const [row] = await this.sql<{ title: string }[]>`SELECT p.title FROM schedules s JOIN programmes p ON p.id = s.programme_id WHERE s.start_time <= now() AND s.end_time > now() ORDER BY s.start_time DESC LIMIT 1`
    return row?.title || null
  }

  async claimNextAiItem(): Promise<BroadcastQueueItem | null> {
    const [row] = await this.sql<{ media_id: string; title: string; artist: string; album: string | null; path: string; duration_seconds: number | null; artwork_url: string | null; programme_title: string; queue_id: string }[]>`SELECT q.media_asset_id AS media_id, m.title, m.artist, m.album, m.path, m.duration_seconds, m.artwork_url, q.programme_title, q.decision_id || ':' || q.position AS queue_id FROM ai_programming_queue q JOIN media_assets m ON m.id = q.media_asset_id WHERE q.status = 'PENDING' AND m.enabled = true ORDER BY q.created_at, q.position LIMIT 1`
    if (!row) return null
    const updated = await this.sql`UPDATE ai_programming_queue SET status = 'PLAYING' WHERE decision_id || ':' || position = ${row.queue_id} AND status = 'PENDING' RETURNING decision_id`
    if (!updated.length) return this.claimNextAiItem()
    return { id: row.media_id, title: row.title, artist: row.artist, album: row.album, artworkUrl: row.artwork_url, programme: row.programme_title, startedAt: new Date().toISOString(), source: "music", path: row.path, durationSeconds: row.duration_seconds || undefined }
  }

  async completeAiItem(item: BroadcastQueueItem) {
    await this.sql`UPDATE ai_programming_queue SET status = 'PLAYED', played_at = now() WHERE media_asset_id = ${item.id} AND status = 'PLAYING'`
  }

  async stopSession(sessionId: string, error?: string) {
    await this.event(sessionId, "broadcast_stopped", null, error)
    await this.sql`UPDATE broadcast_sessions SET status = 'STOPPED', ended_at = now(), last_error = ${error?.slice(0, 500) || null}, updated_at = now() WHERE id = ${sessionId}`
  }

  async close() { await this.sql.end({ timeout: 5 }) }
}
