import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import Fastify from "fastify"
import type { FastifyReply, FastifyRequest } from "fastify"
import { AiProgrammingService, contextHash, createAiProviderManager, defaultStationProfile, type BroadcastContext } from "@blocktek/ai"
// Midnight removed as part of Phase 2 cleanup. Replace midnight integrations with
// no-op placeholders so the API runs without MIDNIGHT_* env vars.
import { createRadioSeed, InMemoryRadioRepository, radioStatusForStream, type RadioRepository } from "@blocktek/radio-core"
import { programmeRequestSchema, submissionStateSchema, type AiDecision, type Channel, type SubmissionState, type Stream } from "@blocktek/types"
import { z } from "zod"
import { loadConfig, type ApiConfig } from "./config.js"
import { transitionSubmission } from "./submission.js"
import { checkStream, type StreamProbe } from "./stream.js"
import type { AiDecisionStore } from "./db/repository.js"
import { actorFromRequest, authFailure } from "./auth.js"
import { pipeline } from "node:stream/promises"
import { createWriteStream } from "node:fs"
import { unlink } from "node:fs/promises"
import os from "node:os"
import { randomUUID } from "node:crypto"
import { transcribeFile, TranscribeError } from "../../shared/src/transcriber.js"
// Privacy flows (Midnight) removed. Use a minimal in-memory placeholder that
// satisfies the small subset of methods the server expects during Phase 2.
type PrivacyActor = { id: string; role: "CONTRIBUTOR" | "EDITOR" | "ADMIN" }
type PrivacyStore = { counts(): Promise<{ pending: number; verified: number; approved: number }>; programmable(): Promise<any[]>; close(): Promise<void> }
const InMemoryPrivacyStore = () => ({ counts: async () => ({ pending: 0, verified: 0, approved: 0 }), programmable: async () => [], close: async () => {} }) as PrivacyStore

const transitionBodySchema = z.object({ to: submissionStateSchema })
const submissionBodySchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(20000),
  evidenceAttached: z.boolean().default(false),
})
const contributionBodySchema = z.object({
  contentType: z.enum(["AUDIO", "PODCAST", "PROGRAMME", "TEXT"]).default("TEXT"),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(20000),
  contentReference: z.string().trim().max(2000).nullable().optional().default(null),
  metadata: z.record(z.string().trim().max(200), z.string().trim().max(500)).default({}),
})
const proofBodySchema = z.object({
  claimType: z.string().trim().min(1).max(120),
  proofReference: z.string().trim().min(1).max(500),
  disclosedAttributes: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
}).strict()
const reviewBodySchema = z.object({ status: z.enum(["VERIFIED", "REJECTED", "REVOKED"]), reason: z.string().trim().max(1000).nullable().optional().default(null) }).strict()
const scheduleQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

type Submission = {
  id: string
  title: string
  body: string
  evidenceAttached: boolean
  state: SubmissionState
  createdAt: string
}

export type ServerDependencies = {
  radioRepository?: RadioRepository
  streamProbe?: StreamProbe
  aiDecisionStore?: AiDecisionStore
  privacyStore?: PrivacyStore
}

export function buildServer(config: ApiConfig = loadConfig(), dependencies: ServerDependencies = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info", serializers: { req: (req) => ({ method: req.method, url: req.url }) } } })
  // Privacy/Midnight removed: do not initialise a privacy store.
  const privacyStore = dependencies.privacyStore || null
  const submissions = new Map<string, Submission>()
  const radioRepository = dependencies.radioRepository || new InMemoryRadioRepository(createRadioSeed({
    streamUrl: config.RADIO_PUBLIC_STREAM_URL || config.RADIO_STREAM_URL || undefined,
    streamName: config.RADIO_STREAM_NAME,
    streamEnabled: config.RADIO_STREAM_ENABLED,
  }))
  const streamProbe = dependencies.streamProbe
  const streamCache = new Map<string, { stream: Stream; expiresAt: number }>()
  const aiService = new AiProgrammingService({ manager: config.AI_PROGRAMMING_MODE === "DETERMINISTIC" ? undefined : createAiProviderManager(process.env), timeoutMs: config.AI_TIMEOUT_MS, mode: config.AI_PROGRAMMING_MODE })
  const memoryDecisions: AiDecision[] = []
  const decisionStore = dependencies.aiDecisionStore || { save: async (decision: AiDecision) => { memoryDecisions.unshift(decision); memoryDecisions.splice(20) }, list: async (limit = 20) => memoryDecisions.slice(0, limit), get: async (id: string) => memoryDecisions.find((item) => item.id === id) || null }

  async function checkedStream(stream: Stream | null): Promise<Stream | null> {
    if (!stream) return null
    const cached = streamCache.get(stream.url || "")
    if (cached && cached.expiresAt > Date.now()) return cached.stream
    const checked = await checkStream(stream, streamProbe)
    if (checked) streamCache.set(checked.url || "", { stream: checked, expiresAt: Date.now() + 15_000 })
    return checked
  }

  async function checkedChannels(): Promise<Channel[]> {
    const channels = await radioRepository.getChannels()
    return Promise.all(channels.map(async (channel) => ({ ...channel, stream: await checkedStream(channel.stream) })))
  }

  app.register(cors, { origin: config.WEB_BASE_URL })
  // multipart support for file uploads (transcription)
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: error.issues })
    }
    app.log.error({ err: error }, "request failed")
    return reply.code(500).send({ error: "INTERNAL_ERROR" })
  })

  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "blocktek-api",
    version: "v1",
    mode: config.DATABASE_URL ? "production" : "development",
    integrations: {
      radioStream: Boolean(config.RADIO_STREAM_ENABLED && (config.RADIO_PUBLIC_STREAM_URL || config.RADIO_STREAM_URL)),
      aiProvider: config.AI_PROVIDER,
      aiStatus: (await aiService.status()).status,
      midnight: "NOT_CONFIGURED",
      broadcast: config.RADIO_BROADCAST_ENABLED ? "enabled" : "not-configured",
      redis: "optional",
    },
  }))

  app.get("/api/v1/health/ready", async (_request, reply) => {
    const persistence = await radioRepository.health()
    const ready = persistence.status !== "unavailable"
    const broadcast = await radioRepository.getBroadcastState()
    return reply.send({
      status: persistence.status === "ready" ? "ok" : "degraded",
      ready,
      persistence: persistence.status,
      redis: "not-required",
      broadcastEngine: broadcast.status === "RUNNING" || broadcast.status === "DEGRADED" ? "running" : config.RADIO_BROADCAST_ENABLED ? "not-running" : "not-required",
      icecast: broadcast.health.icecastRunning ? "running" : config.RADIO_BROADCAST_ENABLED ? "not-reachable" : "not-required",
      midnight: "NOT_CONFIGURED",
    })
  })

  app.get("/api/v1/radio/stations", async () => {
    const station = await radioRepository.getStation()
    const channels = await checkedChannels()
    return { data: station ? [{ ...station, status: radioStatusForStream(channels[0]?.stream || null) }] : [] }
  })
  app.get("/api/v1/radio/channels", async () => ({ data: await checkedChannels() }))
  app.get("/api/v1/radio/now-playing", async () => {
    const current = await radioRepository.getNowPlaying()
    const channels = await checkedChannels()
    const channel = channels.find((item) => item.id === current.channelId) || channels[0]
    return { data: { ...current, channelId: channel?.id || current.channelId, stream: channel?.stream || null, status: radioStatusForStream(channel?.stream || null), metadataStatus: current.metadataStatus } }
  })
  app.get("/api/v1/radio/status", async () => {
    const channels = await checkedChannels()
    const stream = channels[0]?.stream || null
    const broadcast = await radioRepository.getBroadcastState()
    return { data: {
      status: radioStatusForStream(stream),
      stream: { configured: Boolean(stream?.url && stream.enabled), reachable: stream?.health === "reachable", url: stream?.url || null },
      broadcast: { ...broadcast, health: { ...broadcast.health, streamReachable: stream?.health === "reachable" } },
    } }
  })
  app.get("/api/v1/radio/stream", async () => {
    const channels = await checkedChannels()
    return { data: channels[0]?.stream || null }
  })
  app.get("/api/v1/radio/queue", async () => ({ data: await radioRepository.getQueue() }))
  app.get("/api/v1/radio/programmes", async () => ({ data: await radioRepository.getProgrammes() }))
  app.get("/api/v1/radio/schedule", async (request) => {
    const query = scheduleQuerySchema.parse(request.query)
    return { data: await radioRepository.getSchedule(query.from ? new Date(query.from) : undefined, query.to ? new Date(query.to) : undefined) }
  })

  app.get("/api/v1/ai/status", async () => ({ data: await aiService.status() }))

  async function generateAiProgramme(input: ReturnType<typeof programmeRequestSchema.parse>) {
    const nowPlaying = await radioRepository.getNowPlaying()
    const queue = await radioRepository.getQueue(8)
    const media = await radioRepository.getMediaAssets()
    // Privacy/Midnight removed: no programmable contributions are available.
    const approvedContributions: any[] = []
    const context: BroadcastContext = { now: new Date().toISOString(), currentProgramme: nowPlaying.programme?.title || null, currentTrackId: nowPlaying.track?.id || null, recentTrackIds: nowPlaying.track ? [nowPlaying.track.id] : [], recentArtists: nowPlaying.track ? [nowPlaying.track.artist.name] : [], upcomingTrackIds: queue.map((item) => item.track.id).slice(0, 8), availableMedia: media.map(({ id, title, artist, album, durationSeconds, genre, mood, kind, enabled, programmeEligible }) => ({ id, title, artist, album, durationSeconds, genre, mood, kind, enabled, programmeEligible })), approvedContributions, station: defaultStationProfile, mode: config.AI_PROGRAMMING_MODE, request: input }
    const result = config.AI_PROGRAMMING_MODE === "DETERMINISTIC"
      ? await aiService.generate({ ...context, mode: "DETERMINISTIC" })
      : await aiService.generate(context)
    await decisionStore.save(result.decision, contextHash(context))
    if (result.status === "AI_GENERATED") await decisionStore.enqueue?.(result.decision.id, result.acceptedMediaIds, input.theme)
    return result
  }

  app.post("/api/v1/ai/programmes", async (request) => {
    const input = programmeRequestSchema.parse(request.body)
    const result = await generateAiProgramme(input)
    return { data: result.programme, aiStatus: result.status, decision: result.decision }
  })
  app.post("/api/v1/ai/playlist", async (request) => { const input = programmeRequestSchema.parse(request.body); const result = await generateAiProgramme(input); return { data: result.programme, aiStatus: result.status, decision: result.decision } })
  app.get("/api/v1/ai/decisions", async (request) => { const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query); return { data: await decisionStore.list(query.limit) } })
  app.get("/api/v1/ai/decisions/:id", async (request, reply) => { const item = await decisionStore.get((request.params as { id: string }).id); return item ? { data: item } : reply.code(404).send({ error: "NOT_FOUND" }) })

  // Privacy and Midnight-related endpoints removed as part of Phase 2 cleanup.

  app.post("/api/v1/submissions", async (request, reply) => {
    const input = submissionBodySchema.parse(request.body)
    const id = `submission-${submissions.size + 1}`
    const submission: Submission = {
      ...input,
      id,
      state: "SUBMITTED",
      createdAt: new Date().toISOString(),
    }
    submissions.set(id, submission)
    return reply.code(201).send({
      data: submission,
      notice: "DEVELOPMENT ONLY: identity, evidence encryption, authentication, and durable storage are not configured.",
    })
  })

  // Transcription endpoint (dictation). Audio is converted to 16 kHz mono WAV, capped at 120 s,
  // sent to the transcriber and deleted. Nothing is stored; transcript text is never logged.
  const transcribeHits = new Map<string, number[]>()
  const TRANSCRIBE_LIMIT = 10 // requests per minute per client, in memory only
  app.post("/api/v1/transcribe", async (request, reply) => {
    const now = Date.now()
    const hits = (transcribeHits.get(request.ip) || []).filter((t) => now - t < 60_000)
    if (hits.length >= TRANSCRIBE_LIMIT) return reply.code(429).send({ error: "RATE_LIMITED" })
    hits.push(now); transcribeHits.set(request.ip, hits)
    if (transcribeHits.size > 5000) for (const [k, v] of transcribeHits) if (!v.some((t) => now - t < 60_000)) transcribeHits.delete(k)
    const file = await (request as FastifyRequest).file?.({ limits: { fileSize: 15 * 1024 * 1024 } })
    if (!file) return reply.code(400).send({ error: "NO_FILE" })
    const tmpPath = `${os.tmpdir()}/spill-upload-${randomUUID()}`
    try {
      await pipeline(file.file, createWriteStream(tmpPath))
      if (file.file.truncated) return reply.code(413).send({ error: "FILE_TOO_LARGE" })
      const { transcript } = await transcribeFile(tmpPath, { maxSeconds: 120 })
      return reply.send({ text: transcript.text, language: transcript.language, segments: transcript.segments, words: transcript.words })
    } catch (err) {
      const code = err instanceof TranscribeError ? err.code : "TRANSCRIPTION_FAILED"
      request.log.warn({ code }, "transcribe failed")
      const status = code === "MISSING_KEY" || code === "UNAVAILABLE" || code === "BAD_PROVIDER" ? 503 : code === "FFMPEG_FAILED" ? 415 : 502
      return reply.code(status).send({ error: code, message: err instanceof TranscribeError ? err.message : "Transcription failed" })
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
  })

  app.get("/api/v1/submissions/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const submission = submissions.get(id)
    if (!submission) return reply.code(404).send({ error: "NOT_FOUND" })
    return reply.send({ data: submission })
  })

  app.post("/api/v1/submissions/:id/transitions", async (request, reply) => {
    const { id } = request.params as { id: string }
    const submission = submissions.get(id)
    if (!submission) return reply.code(404).send({ error: "NOT_FOUND" })
    const { to } = transitionBodySchema.parse(request.body)
    try {
      submission.state = transitionSubmission(submission.state, to)
    } catch (error) {
      return reply.code(409).send({ error: "INVALID_TRANSITION", message: error instanceof Error ? error.message : "Invalid transition" })
    }
    return reply.send({ data: submission })
  })

  app.addHook("onClose", async () => {
    await radioRepository.close()
    if (privacyStore && typeof privacyStore.close === "function") await privacyStore.close()
  })
  return app
}
