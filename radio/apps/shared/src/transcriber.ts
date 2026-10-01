import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, stat, unlink } from "node:fs/promises"
import { spawn } from "node:child_process"
import os from "node:os"
import { join } from "node:path"

export type TranscriptWord = { start: number; end: number; word: string }
export type TranscriptSegment = { start: number; end: number; text: string; uncertain: boolean }
export type Transcript = { text: string; language: string | null; segments: TranscriptSegment[]; words: TranscriptWord[] }

/** Error with a retry hint. 4xx (except 408/429) and config errors are not retryable. */
export class TranscribeError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) { super(message); this.name = "TranscribeError" }
}

// Groq's upload limit is 25 MB (free tier); 16 kHz mono WAV is ~32 KB/s.
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(path)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest("hex")))
    stream.on("error", reject)
  })
}

function run(cmd: string, args: string[]): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] })
    let stdout = ""
    child.stdout.on("data", (d) => { stdout += d.toString() })
    child.on("error", reject)
    child.on("exit", (code) => resolve({ code, stdout }))
  })
}

export async function probeDurationSec(path: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path])
    const n = Number(stdout.trim())
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}

async function toWav(src: string, dest: string, maxSeconds?: number): Promise<void> {
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", ...(maxSeconds ? ["-t", String(maxSeconds)] : []), "-f", "wav", dest]
  const { code } = await run("ffmpeg", args).catch(() => ({ code: -1, stdout: "" }))
  if (code !== 0) throw new TranscribeError("ffmpeg could not decode the audio", "FFMPEG_FAILED", false)
}

async function callGroq(wavPath: string): Promise<Transcript> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new TranscribeError("GROQ_API_KEY is not set", "MISSING_KEY", false)
  const base = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "")
  const model = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3"
  const buffer = await readFile(wavPath)
  if (buffer.length > MAX_UPLOAD_BYTES) throw new TranscribeError("audio too large for transcription", "TOO_LARGE", false)
  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "audio/wav" }), "audio.wav")
  form.append("model", model)
  form.append("response_format", "verbose_json")
  form.append("timestamp_granularities[]", "word")
  form.append("timestamp_granularities[]", "segment")
  // No language is forced by default (speech mixes English and Swahili). Optional ISO-639-1 hint, e.g. "sw".
  if (process.env.GROQ_WHISPER_LANGUAGE) form.append("language", process.env.GROQ_WHISPER_LANGUAGE)
  let resp: Response
  try {
    resp = await fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(120_000) })
  } catch (err) {
    throw new TranscribeError(`groq request failed: ${err instanceof Error ? err.message : String(err)}`, "NETWORK", true)
  }
  if (!resp.ok) {
    const body = (await resp.text().catch(() => "")).slice(0, 200)
    const retryable = resp.status >= 500 || resp.status === 408 || resp.status === 429
    throw new TranscribeError(`groq ${resp.status}: ${body}`, `HTTP_${resp.status}`, retryable)
  }
  const json: any = await resp.json().catch(() => null)
  const text = typeof json?.text === "string" ? json.text.trim() : ""
  const words: TranscriptWord[] = Array.isArray(json?.words) ? json.words.map((w: any) => ({ start: Number(w.start), end: Number(w.end), word: String(w.word) })) : []
  if (!text) throw new TranscribeError("transcription returned no text", "EMPTY", false)
  if (!words.length) throw new TranscribeError("transcription returned no word timestamps", "NO_WORDS", false)
  const segments: TranscriptSegment[] = (Array.isArray(json?.segments) ? json.segments : []).map((s: any) => ({
    start: Number(s.start), end: Number(s.end), text: String(s.text ?? "").trim(),
    uncertain: (typeof s.avg_logprob === "number" && s.avg_logprob < -1) || (typeof s.no_speech_prob === "number" && s.no_speech_prob > 0.6),
  }))
  return { text, language: typeof json.language === "string" ? json.language : null, segments, words }
}

async function callMicrosoft(_wavPath: string): Promise<Transcript> {
  // OPEN QUESTION: MAI-Transcribe availability on the team's Foundry account is unverified.
  throw new TranscribeError("microsoft provider is not available: MAI-Transcribe access not verified", "UNAVAILABLE", false)
}

/** Transcribe one audio file. The temporary WAV is always deleted. Throws TranscribeError on failure. */
export async function transcribeFile(path: string, opts: { maxSeconds?: number } = {}): Promise<{ transcript: Transcript; durationSec: number | null }> {
  const provider = (process.env.TRANSCRIBER_PROVIDER || "groq-whisper").toLowerCase()
  await stat(path)
  const tmp = join(os.tmpdir(), `spill-${randomUUID()}.wav`)
  try {
    await toWav(path, tmp, opts.maxSeconds)
    const durationSec = await probeDurationSec(path)
    let transcript: Transcript
    if (provider === "groq-whisper") transcript = await callGroq(tmp)
    else if (provider === "microsoft") transcript = await callMicrosoft(tmp)
    else throw new TranscribeError(`unknown TRANSCRIBER_PROVIDER ${provider}`, "BAD_PROVIDER", false)
    return { transcript, durationSec }
  } finally {
    await unlink(tmp).catch(() => {})
  }
}
