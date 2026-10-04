import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { basename, extname, isAbsolute, join } from "node:path"
import { sha256File } from "../../shared/src/transcriber.js"
import { validateNpub } from "../../shared/src/npub.js"

const audioTypes: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mpeg": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
}

type ManifestEntry = { file?: unknown; title?: unknown; npub?: unknown; space?: unknown }
type TranscriptFile = {
  audioSha256?: unknown
  durationSec?: unknown
  transcript?: { text?: unknown; words?: unknown }
}

export type AvailableRecording = {
  id: string
  title: string
  space: string | null
  durationSec: number | null
  path: string
  size: number
  contentType: string
}

/** Only return files the radio worker considers ready to broadcast. */
export async function availableRecordings(mediaRoot: string): Promise<AvailableRecording[]> {
  const dir = join(mediaRoot, "radio")
  let manifest: ManifestEntry[]
  try {
    const parsed = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))
    manifest = Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }

  const recordings: AvailableRecording[] = []
  for (const entry of manifest) {
    if (!entry || typeof entry.file !== "string" || basename(entry.file) !== entry.file || /[\\/]/.test(entry.file)) continue
    if (typeof entry.npub !== "string" || !validateNpub(entry.npub)) continue
    const contentType = audioTypes[extname(entry.file).toLowerCase()]
    if (!contentType) continue
    const path = join(dir, entry.file)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile() || info.size === 0) continue

    let transcript: TranscriptFile
    try {
      transcript = JSON.parse(await readFile(`${path}.transcript.json`, "utf8"))
    } catch {
      continue
    }
    if (typeof transcript?.audioSha256 !== "string" ||
        typeof transcript.transcript?.text !== "string" ||
        !transcript.transcript.text.trim() ||
        !Array.isArray(transcript.transcript.words) ||
        transcript.transcript.words.length === 0) continue
    if (await sha256File(path) !== transcript.audioSha256) continue

    recordings.push({
      id: `rec-${transcript.audioSha256.slice(0, 12)}`,
      title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : entry.file,
      space: typeof entry.space === "string" && entry.space.trim() ? entry.space.trim() : null,
      durationSec: typeof transcript.durationSec === "number" && Number.isFinite(transcript.durationSec) ? transcript.durationSec : null,
      path,
      size: info.size,
      contentType,
    })
  }
  return recordings
}

export function recordingMediaRoot(root: string, radioRoot: string): string {
  return isAbsolute(root) ? root : join(radioRoot, root)
}

export function audioStream(recording: AvailableRecording, range: string | undefined) {
  let start = 0
  let end = recording.size - 1
  let partial = false
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2])) return null
    if (!match[1]) {
      const suffix = Number(match[2])
      if (!Number.isSafeInteger(suffix) || suffix < 1) return null
      start = Math.max(0, recording.size - suffix)
    } else {
      start = Number(match[1])
      if (match[2]) end = Number(match[2])
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 0 || start >= recording.size || end < start) return null
    end = Math.min(end, recording.size - 1)
    partial = true
  }
  return {
    stream: createReadStream(recording.path, { start, end }),
    headers: {
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      ...(partial ? { "content-range": `bytes ${start}-${end}/${recording.size}` } : {}),
    },
    status: partial ? 206 : 200,
  }
}
