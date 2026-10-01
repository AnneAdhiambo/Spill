import { z } from "zod"

export type Candidate = { id: string; title: string; kind: "recording" | "music"; language: string | null; durationSec: number | null; excerpt: string }
export type PlannedItem = { id: string; reason: string | null }
export type Plan = { items: PlannedItem[]; status: "ACCEPTED" | "FALLBACK"; provider: string | null; model: string | null; error: string | null; latencyMs: number }

const outputSchema = z.object({ order: z.array(z.object({ id: z.string().min(1), reason: z.string().trim().min(1).max(90) }).strict()).min(1).max(8) }).strict()

const SYSTEM = [
  "You are the programming director of Spill, a community radio station.",
  "You receive prepared recordings (and optionally music breaks) as text only: id, title, language, duration and the first part of the transcript.",
  "Choose the running order of the next block. You never hear or edit audio and you do not judge what is allowed on air.",
  "Use only ids from the list, each at most once. Do not put two music items back to back.",
  "Each reason must be at most 90 characters and may use ONLY information present in that item's input (its topic and language).",
  "Never name a place, language, group or any fact that is not in the input.",
  'Never say "first", "last" or "end" (or similar) unless the item really is first or last in your returned list.',
  'Return only JSON: {"order":[{"id":"<id>","reason":"<one plain sentence>"}]}',
].join(" ")

const LANGUAGES = ["english", "swahili", "kiswahili", "sheng", "french", "arabic", "somali", "luo", "kikuyu", "kalenjin", "luhya", "spanish", "german", "portuguese", "hindi", "basque", "italian", "chinese", "amharic", "yoruba", "zulu", "afrikaans"]
const POSITIONAL = /\b(first|last|final|finally|end|ends|ending|close|closes|closing|open|opens|opening|begin|begins|start|starts|wrap|wraps)\b/i

// Whisper's auto-detect mislabels Swahili/English speech (seen: "Basque", "Latin").
// Only languages this station actually carries are passed on; anything else is "unknown".
const TRUSTED_LANGUAGES = new Set(["english", "swahili", "kiswahili"])
export function trustedLanguage(language: string | null): string | null {
  const l = (language || "").trim().toLowerCase()
  return TRUSTED_LANGUAGES.has(l) ? l : null
}

/** Returns the reason if it is grounded in the input, otherwise a neutral one built from the title. */
export function groundReason(reason: string, c: Candidate, position: number, total: number): string {
  const neutral = `Next: ${c.title}`.slice(0, 90)
  const r = reason.trim()
  if (!r || r.length > 90) return neutral
  const lower = r.toLowerCase()
  const own = trustedLanguage(c.language) || ""
  for (const lang of LANGUAGES) {
    if (new RegExp(`\\b${lang}\\b`).test(lower) && !(own && (own === lang || (own === "swahili" && lang === "kiswahili")))) {
      if (!c.title.toLowerCase().includes(lang)) return neutral
    }
  }
  if (POSITIONAL.test(r) && !(position === 0 || position === total - 1)) return neutral
  // Capitalised words (not the first word) must appear in the title or transcript start.
  const source = `${c.title} ${c.excerpt}`.toLowerCase()
  const words = r.split(/\s+/).slice(1).map((w) => w.replace(/[^\p{L}]/gu, "")).filter((w) => w.length > 2 && /^\p{Lu}/u.test(w))
  for (const w of words) if (!source.includes(w.toLowerCase())) return neutral
  return r
}

/** Deterministic selection used for fallback and top-up. Candidates are already eligible and ordered least-recently-played first. */
function deterministic(candidates: Candidate[], size: number, lastWasMusic: boolean, already: PlannedItem[] = []): PlannedItem[] {
  const out = [...already]
  const used = new Set(out.map((i) => i.id))
  const byId = new Map(candidates.map((c) => [c.id, c]))
  let prevMusic = already.length ? byId.get(already[already.length - 1].id)?.kind === "music" : lastWasMusic
  for (const c of candidates) {
    if (out.length >= size) break
    if (used.has(c.id)) continue
    if (c.kind === "music" && prevMusic) continue
    out.push({ id: c.id, reason: null }); used.add(c.id); prevMusic = c.kind === "music"
  }
  return out
}

export async function planBlock(opts: { candidates: Candidate[]; blockSize: number; lastWasMusic: boolean; env: NodeJS.ProcessEnv }): Promise<Plan> {
  const { candidates, env } = opts
  const started = Date.now()
  const size = Math.min(opts.blockSize, candidates.length)
  const fallback = (error: string, provider: string | null = null, model: string | null = null): Plan => ({ items: deterministic(candidates, size, opts.lastWasMusic), status: "FALLBACK", provider, model, error: error.slice(0, 300), latencyMs: Date.now() - started })
  if (!candidates.length) return { items: [], status: "FALLBACK", provider: null, model: null, error: "no eligible candidates", latencyMs: 0 }
  const provider = (env.AI_PROVIDER || "").toLowerCase()
  const mode = env.AI_PROGRAMMING_MODE || "AI_ASSISTED"
  if (mode === "DETERMINISTIC") return fallback("AI_PROGRAMMING_MODE is DETERMINISTIC")
  if (provider !== "groq") return fallback(`AI_PROVIDER is "${provider || "unset"}", expected groq`)
  const apiKey = env.GROQ_API_KEY
  if (!apiKey) return fallback("GROQ_API_KEY is not set", "groq")
  const model = env.GROQ_MODEL || "openai/gpt-oss-20b"
  const base = (env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "")
  const input = candidates.map((c) => ({ id: c.id, kind: c.kind, title: c.title, language: trustedLanguage(c.language) ?? "unknown", durationSec: c.durationSec ? Math.round(c.durationSec) : null, transcriptStart: c.excerpt.slice(0, 800) }))
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(Number(env.AI_TIMEOUT_MS || 12000)),
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1200, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ blockSize: size, items: input }) }] }),
    })
    if (!resp.ok) return fallback(`groq returned HTTP ${resp.status}`, "groq", model)
    const body: any = await resp.json()
    const content = body?.choices?.[0]?.message?.content
    if (typeof content !== "string") return fallback("groq returned no content", "groq", model)
    const parsed = outputSchema.safeParse(JSON.parse(content))
    if (!parsed.success) return fallback("invalid AI output: schema", "groq", model)
    const known = new Set(candidates.map((c) => c.id))
    const seen = new Set<string>()
    for (const item of parsed.data.order) {
      if (!known.has(item.id)) return fallback("invalid AI output: unknown id", "groq", model)
      if (seen.has(item.id)) return fallback("invalid AI output: repeated id", "groq", model)
      seen.add(item.id)
    }
    // Enforce deterministic rules on the AI order: no back-to-back music, then cap and top up.
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const accepted: PlannedItem[] = []
    let prevMusic = opts.lastWasMusic
    for (const item of parsed.data.order) {
      const music = byId.get(item.id)!.kind === "music"
      if (music && prevMusic) continue
      accepted.push({ id: item.id, reason: item.reason }); prevMusic = music
      if (accepted.length >= size) break
    }
    const grounded = accepted.map((i, idx) => ({ id: i.id, reason: groundReason(i.reason || "", byId.get(i.id)!, idx, accepted.length) }))
    const items = deterministic(candidates, size, opts.lastWasMusic, grounded)
    return { items, status: "ACCEPTED", provider: "groq", model, error: null, latencyMs: Date.now() - started }
  } catch (err) {
    return fallback(err instanceof Error ? err.message : "AI call failed", "groq", model)
  }
}
