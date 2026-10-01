import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { join, extname } from "node:path"
import { validateNpub } from "../../shared/src/npub.js"
import { probeDurationSec, sha256File, transcribeFile, TranscribeError, type Transcript } from "../../shared/src/transcriber.js"

export const RADIO_AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".ogg", ".webm", ".aac"])
const TEMPLATE = [{ file: "example.mp3", title: "Example title", npub: "npub1...", space: "optional" }]

export type Recording = { id: string; title: string; npub: string; space: string | null; path: string; durationSec: number | null; language: string | null; audioSha256: string }
type ManifestEntry = { file?: string; title?: string; npub?: string; space?: string }
type Log = (message: string, data?: Record<string, unknown>) => void

export class Ingester {
  private running = false
  private rerun = false
  private readonly warned = new Set<string>()
  private readonly failedSha = new Map<string, string>() // file -> sha that failed (retry only if file changes or on restart)
  private readonly shaCache = new Map<string, { key: string; sha: string }>()
  private ready: Recording[] = []

  constructor(readonly dir: string, private readonly log: Log, private readonly onChange?: (recs: Recording[]) => Promise<void> | void) {}

  recordings(): Recording[] { return this.ready }

  private warnOnce(key: string, message: string, data: Record<string, unknown>) {
    if (this.warned.has(key)) return
    this.warned.add(key)
    this.log(message, data)
  }

  private async sha(path: string, mtimeMs: number, size: number): Promise<string> {
    const key = `${mtimeMs}:${size}`
    const cached = this.shaCache.get(path)
    if (cached?.key === key) return cached.sha
    const sha = await sha256File(path)
    this.shaCache.set(path, { key, sha })
    return sha
  }

  /** One scan. Concurrent calls coalesce into a single follow-up scan. */
  async scan(): Promise<Recording[]> {
    if (this.running) { this.rerun = true; return this.ready }
    this.running = true
    try {
      do {
        this.rerun = false
        await this.scanOnce()
      } while (this.rerun)
    } catch (err) {
      this.log("ingest scan failed", { error: err instanceof Error ? err.message : String(err) })
    } finally { this.running = false }
    return this.ready
  }

  private async scanOnce() {
    const manifestPath = join(this.dir, "manifest.json")
    let manifest: ManifestEntry[] = []
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf8"))
      if (!Array.isArray(parsed)) throw new Error("manifest.json must be an array")
      manifest = parsed
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        await writeFile(manifestPath, JSON.stringify(TEMPLATE, null, 2) + "\n", { flag: "wx" }).catch(() => {})
        this.warnOnce("manifest-created", "ingest manifest template created", { manifestPath })
      } else this.warnOnce(`manifest-bad:${(err as Error).message}`, "ingest manifest unreadable", { manifestPath, error: (err as Error).message })
    }
    const entries = new Map<string, ManifestEntry>()
    for (const e of manifest) if (e?.file) entries.set(e.file, e)

    let names: string[] = []
    try { names = (await readdir(this.dir)).filter((n) => RADIO_AUDIO_EXTENSIONS.has(extname(n).toLowerCase())).sort() } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }

    const next: Recording[] = []
    let settling = false
    for (const name of names) {
      const path = join(this.dir, name)
      const st = await stat(path).catch(() => null)
      if (!st) continue
      if (Date.now() - st.mtimeMs < 2000) { settling = true; continue } // still being copied
      const entry = entries.get(name)
      if (!entry) { this.warnOnce(`${name}:no-entry`, "ingest file not eligible", { file: name, problem: "no manifest entry" }); continue }
      if (typeof entry.npub !== "string" || !validateNpub(entry.npub)) { this.warnOnce(`${name}:${entry.npub}:bad-npub`, "ingest file not eligible", { file: name, problem: "invalid npub" }); continue }
      const title = (entry.title || name).trim()
      const space = entry.space || null
      const sha = await this.sha(path, st.mtimeMs, st.size)
      const id = `rec-${sha.slice(0, 12)}`
      const transcriptPath = `${path}.transcript.json`
      let existing: any = null
      try { existing = JSON.parse(await readFile(transcriptPath, "utf8")) } catch {}
      const valid = existing?.audioSha256 === sha && existing?.transcript?.text?.trim() && Array.isArray(existing?.transcript?.words) && existing.transcript.words.length > 0

      if (valid) {
        if (existing.title !== title || existing.npub !== entry.npub || (existing.space ?? null) !== space || existing.id !== id) {
          await this.writeJson(transcriptPath, { ...existing, id, title, npub: entry.npub, space })
          this.log("ingest metadata updated", { file: name })
        }
        this.log("ingest file", { file: name, status: "ready", transcribed: false })
        next.push({ id, title, npub: entry.npub, space, path, durationSec: existing.durationSec ?? null, language: existing.language ?? null, audioSha256: sha })
        continue
      }
      if (this.failedSha.get(name) === sha) { this.log("ingest file", { file: name, status: "failed" }); continue }

      const result = await this.transcribeWithRetry(name, path)
      if (!result) { this.failedSha.set(name, sha); continue }
      const durationSec = result.durationSec ?? (await probeDurationSec(path))
      await this.writeJson(transcriptPath, { id, title, npub: entry.npub, space, language: result.transcript.language, durationSec, audioSha256: sha, transcript: result.transcript })
      this.failedSha.delete(name)
      this.log("ingest file", { file: name, status: "ready", transcribed: true })
      next.push({ id, title, npub: entry.npub, space, path, durationSec, language: result.transcript.language, audioSha256: sha })
    }
    this.ready = next
    await this.onChange?.(next)
    if (settling) setTimeout(() => void this.scan(), 3000).unref()
  }

  private async transcribeWithRetry(name: string, path: string): Promise<{ transcript: Transcript; durationSec: number | null } | null> {
    let lastError = ""
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.log("ingest transcribing", { file: name, attempt })
        return await transcribeFile(path)
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        const retryable = err instanceof TranscribeError ? err.retryable : false
        if (!retryable || attempt === 3) break
        await new Promise((r) => setTimeout(r, attempt * 2000))
      }
    }
    this.log("ingest file", { file: name, status: "failed", error: lastError.slice(0, 200) })
    return null
  }

  private async writeJson(path: string, data: unknown) {
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify(data, null, 2))
    await rename(tmp, path)
  }
}
