import { useEffect, useRef, useState } from "react"

export type RadioWord = { start: number; end: number; word: string }
export type RadioCurrent = { id: string; title: string; kind: string; npub: string | null; space: string | null; startedAt: string; durationSec: number | null }
export type RadioUpNext = { id: string; title: string; kind: string; durationSec: number | null; reason: string | null }
export type RadioNow = { current: RadioCurrent; upNext: RadioUpNext[]; words: RadioWord[]; transcriptOffsetMs: number }
export type RadioStatus = "loading" | "on-air" | "off-air"

// Dev defaults point at the local API and Icecast. Override with VITE_RADIO_API_URL / VITE_RADIO_STREAM_URL.
export const RADIO_API_URL = (import.meta.env.VITE_RADIO_API_URL as string | undefined) ?? "http://localhost:4000"
export const RADIO_STREAM_URL = (import.meta.env.VITE_RADIO_STREAM_URL as string | undefined) ?? "http://localhost:8000/live"

const POLL_MS = 2000

/** Polls /api/v1/radio/now. `clockOffsetMs` = server time minus local time, corrected on every poll. */
export function useRadioNow() {
  const [now, setNow] = useState<RadioNow | null>(null)
  const [status, setStatus] = useState<RadioStatus>("loading")
  const clockOffsetMs = useRef(0)

  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      const sent = Date.now()
      try {
        const res = await fetch(`${RADIO_API_URL}/api/v1/radio/now`, { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        const received = Date.now()
        const d = body.data
        // Assume the server stamped the response halfway through the round trip.
        clockOffsetMs.current = Date.parse(d.serverTime) - (sent + received) / 2
        if (!stopped) {
          setNow({ current: d.current, upNext: d.upNext ?? [], words: d.words ?? [], transcriptOffsetMs: Number(d.transcriptOffsetMs) || 0 })
          setStatus("on-air")
        }
      } catch {
        if (!stopped) { setStatus("off-air"); setNow(null) }
      } finally {
        if (!stopped) timer = window.setTimeout(poll, POLL_MS)
      }
    }
    void poll()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [])

  return { now, status, clockOffsetMs }
}
