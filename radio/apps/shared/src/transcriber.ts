import { createHash } from "node:crypto"
import { createReadStream, writeFile, unlink } from "node:fs"
import { stat } from "node:fs/promises"
import { basename } from "node:path"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import os from "node:os"

type Transcript = { text: string; language?: string | null; segments: any[]; words: any[] }

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(path)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest("hex")))
    stream.on("error", reject)
  })
}

function ffmpegToWav(src: string, dest: string, maxSeconds = 120): void {
  // Convert input to 16kHz mono WAV capped to maxSeconds using ffmpeg CLI.
  // Synchronous call is acceptable here since worker runs in background tasks.
  const args = ["-y", "-i", src, "-ac", "1", "-ar", "16000", "-t", String(maxSeconds), "-f", "wav", dest]
  const res = spawnSync("ffmpeg", args, { stdio: "ignore" })
  if (res.status !== 0) throw new Error(`ffmpeg conversion failed for ${src}`)
}

async function callGroqWhisper(wavPath: string): Promise<{ text: string; language?: string | null; segments: any[]; words: any[] } | null> {
  const apiKey = process.env.GROQ_API_KEY
  const base = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
  if (!apiKey) {
    console.error({ service: "transcriber", provider: "groq-whisper", message: "GROQ_API_KEY missing; skipping transcription" })
    return null
  }
  const model = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3"
  const url = `${base.replace(/\/$/, "")}/audio/transcriptions`
  try {
    const buffer = await import("node:fs/promises").then((m) => m.readFile(wavPath))
    // Build multipart using Blob/FormData so Node's fetch will set the Content-Type boundary
    const blob = new Blob([buffer], { type: "audio/wav" })
    const form = new FormData()
    form.append("file", blob, "audio.wav")
    form.append("model", model)
    form.append("response_format", "verbose_json")
    // request both word and segment-level timestamps
    form.append("timestamp_granularities[]", "word")
    form.append("timestamp_granularities[]", "segment")
    const resp = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form as any })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "")
      // Treat 400 as non-retryable (bad request / missing file)
      if (resp.status === 400) {
        const e = new Error(`groq 400: ${txt.slice(0, 500)}`)
        ;(e as any).name = "NonRetryableError"
        throw e
      }
      console.error({ service: "transcriber", provider: "groq-whisper", status: resp.status, message: txt.slice(0, 500) })
      return null
    }
    const json = await resp.json().catch(() => null)
    if (!json) return null
    // Expected Groq verbose_json shape: { task, language, duration, text, words: [], segments: [] }
    const text = json.text || json.transcript || json.data?.text || ""
    const language = json.language || json.detected_language || null
    const segments = json.segments || json.data?.segments || []
    const words = json.words || json.data?.words || []
    return { text, language, segments, words }
  } catch (err) {
    if ((err as any)?.name === "NonRetryableError") throw err
    console.error({ service: "transcriber", provider: "groq-whisper", message: err instanceof Error ? err.message : String(err) })
    return null
  }
}

async function callMicrosoft(wavPath: string): Promise<{ text: string; language?: string | null; segments: any[]; words: any[] } | null> {
  const key = process.env.MS_SPEECH_KEY
  const region = process.env.MS_SPEECH_REGION
  if (!key || !region) {
    console.error({ service: "transcriber", provider: "microsoft", message: "MS_SPEECH_KEY or MS_SPEECH_REGION missing; skipping transcription" })
    return null
  }
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`
  try {
    const wav = createReadStream(wavPath)
    const resp = await fetch(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000" }, body: wav as any })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "")
      console.error({ service: "transcriber", provider: "microsoft", status: resp.status, message: txt.slice(0, 500) })
      return null
    }
    const json = await resp.json().catch(() => null)
    if (!json) return null
    const text = json.DisplayText || json.displayText || ""
    // Microsoft detailed timestamps require additional params; leave segments/words empty
    return { text, language: null, segments: [], words: [] }
  } catch (err) {
    console.error({ service: "transcriber", provider: "microsoft", message: err instanceof Error ? err.message : String(err) })
    return null
  }
}

export async function transcribeFile(path: string): Promise<{ transcript: Transcript; audioSha256: string; durationSec: number | null } | null> {
  // Only support configured providers: groq-whisper (default) and microsoft.
  const provider = (process.env.TRANSCRIBER_PROVIDER || "groq-whisper").toLowerCase()
  try {
    await stat(path)
  } catch {
    return null
  }
  // Compute sha256 for the source audio (used to detect stale transcripts)
  const audioSha256 = await sha256File(path)
  // Convert to 16k mono wav capped at 120s in /tmp
  const tmp = `${os.tmpdir()}/${randomUUID()}.wav`
  try {
    ffmpegToWav(path, tmp, 120)
  } catch (err) {
    console.error({ service: "transcriber", message: "ffmpeg_failed", file: path, error: err instanceof Error ? err.message : String(err) })
    try { await unlink(tmp) } catch {}
    return null
  }
  let result: { text: string; language?: string | null; segments: any[]; words: any[] } | null = null
  if (provider === "groq-whisper") result = await callGroqWhisper(tmp)
  else if (provider === "microsoft" || provider === "ms") result = await callMicrosoft(tmp)
  else {
    console.error({ service: "transcriber", message: `transcriber provider ${provider} not supported` })
  }
  // Clean up temporary wav
  try { await unlink(tmp) } catch {}
  if (!result) return null
  if (!result.text || !result.text.trim()) return null // never accept empty transcripts
  const transcript: Transcript = { text: result.text, language: result.language || null, segments: result.segments || [], words: result.words || [] }
  return { transcript, audioSha256, durationSec: null }
}

export async function writeTranscript(path: string, manifestEntry: any, transcriptData: { transcript: Transcript; audioSha256: string; durationSec: number | null }) {
  const out = {
    id: manifestEntry?.id || `media-${Date.now()}`,
    title: manifestEntry?.title || basename(path),
    npub: manifestEntry?.npub || null,
    space: manifestEntry?.space || null,
    language: transcriptData.transcript.language || null,
    durationSec: transcriptData.durationSec,
    audioSha256: transcriptData.audioSha256,
    transcript: transcriptData.transcript,
  }
  const outPath = `${path}.transcript.json`
  await new Promise<void>((resolve, reject) => writeFile(outPath, JSON.stringify(out, null, 2), (err) => err ? reject(err) : resolve()))
}

export default { transcribeFile, writeTranscript }
