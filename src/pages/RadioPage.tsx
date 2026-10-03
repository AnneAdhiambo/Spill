import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, Music, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react"
import SpillNavbar from "../components/layout/SpillNavbar"
import Waveform from "../features/radio/Waveform"
import { RADIO_STREAM_URL, useRadioNow } from "../features/radio/useRadioNow"
import "../styles/space.css"
import "../styles/radio.css"

const fmt = (sec: number | null | undefined) => {
  if (sec == null || !Number.isFinite(sec)) return "–:––"
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
const shortNpub = (n: string) => `${n.slice(0, 9)}…${n.slice(-4)}`

export default function RadioPage() {
  const { now, status, clockOffsetMs } = useRadioNow()
  const audioRef = useRef<HTMLAudioElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [volume, setVolume] = useState(0.9)
  const [tick, setTick] = useState(0) // re-render ~4x/s for time and transcript
  const [copied, setCopied] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const currentWordRef = useRef<HTMLSpanElement>(null)

  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 250); return () => window.clearInterval(t) }, [])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])

  function stop() {
    const a = audioRef.current
    if (!a) return
    a.pause()
    a.removeAttribute("src")
    a.load() // drops the buffer so the next play starts at the live point
    setPlaying(false)
  }

  // Station went off air: stop the local audio too.
  useEffect(() => { if (status === "off-air") stop() }, [status])

  const serverNowMs = () => Date.now() + clockOffsetMs.current
  const startedMs = now ? Date.parse(now.current.startedAt) : 0
  const total = now?.current.durationSec ?? null
  const elapsed = now ? Math.min(Math.max(0, (serverNowMs() - startedMs) / 1000), total ?? Infinity) : 0
  void tick

  const progress = useCallback(() => {
    if (!now || !total) return 0
    return Math.min(1, Math.max(0, (Date.now() + clockOffsetMs.current - Date.parse(now.current.startedAt)) / 1000 / total))
  }, [now, total, clockOffsetMs])

  async function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) { stop(); return }
    setStreamError(false)
    try {
      if (!ctxRef.current) {
        const ctx = new AudioContext()
        const src = ctx.createMediaElementSource(a)
        const an = ctx.createAnalyser()
        an.fftSize = 256
        src.connect(an); an.connect(ctx.destination)
        ctxRef.current = ctx
        setAnalyser(an)
      }
      await ctxRef.current.resume()
      a.src = `${RADIO_STREAM_URL}?t=${Date.now()}`
      await a.play()
      setPlaying(true)
    } catch (err) {
      console.warn("Radio: could not start the stream", err)
      setStreamError(true)
      stop()
    }
  }

  // Transcript position = server now - startedAt - offset.
  const words = now?.words ?? []
  const posSec = now ? (serverNowMs() - startedMs - now.transcriptOffsetMs) / 1000 : 0
  const currentIdx = useMemo(() => {
    let idx = -1
    for (let i = 0; i < words.length; i++) { if (words[i].start <= posSec) idx = i; else break }
    return idx
  }, [words, posSec])
  const wordActive = currentIdx >= 0 && posSec <= words[currentIdx].end + 0.25

  useEffect(() => {
    const box = transcriptRef.current, el = currentWordRef.current
    if (!box || !el) return
    const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
    box.scrollTo({ top: Math.max(0, target), behavior: "smooth" })
  }, [currentIdx])

  async function copyNpub() {
    if (!now?.current.npub) return
    try { await navigator.clipboard.writeText(now.current.npub); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch { console.warn("Radio: clipboard unavailable") }
  }

  let recNo = 0
  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="space-page radio-page">
      <SpillNavbar activeLink="Radio" />
      <audio ref={audioRef} crossOrigin="anonymous" preload="none" onError={() => { if (audioRef.current?.getAttribute("src")) { console.warn("Radio: stream error (unreachable or blocked by CORS)"); setStreamError(true); setPlaying(false) } }} />

      <main className="radio-layout">
        <aside className="radio-upnext" aria-label="Up next">
          <h2>Up next</h2>
          <p className="radio-sub">Lined up by the AI DJ</p>
          {status === "on-air" && now && now.upNext.length === 0 && <p className="radio-muted">Nothing queued yet.</p>}
          <ol>
            {(now?.upNext ?? []).map((item, i) => {
              const music = item.kind === "music"
              if (!music) recNo += 1
              return (
                <li key={`${item.id}-${i}`} className={music ? "is-music" : ""}>
                  <span className="radio-badge">{music ? <Music size={14} aria-hidden="true" /> : recNo}</span>
                  <div className="radio-item-text">
                    <strong>{item.title}</strong>
                    {item.reason && <span>{item.reason}</span>}
                  </div>
                  <time>{fmt(item.durationSec)}</time>
                </li>
              )
            })}
          </ol>
        </aside>

        <section className="radio-card" aria-live="polite">
          {status === "loading" && <p className="radio-state">Connecting to Spill Radio…</p>}

          {status === "off-air" && (
            <div className="radio-state">
              <h1>Radio is off air right now</h1>
              <p className="radio-muted">We’ll reconnect automatically as soon as the station is back.</p>
            </div>
          )}

          {status === "on-air" && now && (
            <>
              <div className="radio-top">
                <span className="radio-pill"><i aria-hidden="true" /> ON AIR</span>
                <span className="radio-muted">Programmed by the AI DJ</span>
              </div>
              <h1>{now.current.title}</h1>
              <p className="radio-speaker">
                {now.current.space && <span>{now.current.space} · </span>}
                {now.current.npub ? (
                  <button type="button" onClick={copyNpub} title="Copy npub" aria-label="Copy speaker npub">
                    {shortNpub(now.current.npub)} {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  </button>
                ) : <span>Spill</span>}
              </p>
              {/* OPEN QUESTION: show the speaker's kind 0 profile name from relays when available. */}

              <Waveform analyser={analyser} playing={playing} progress={progress} />
              <div className="radio-times"><span>{fmt(elapsed)}</span><span>{fmt(total)}</span></div>

              <div className="radio-controls">
                <button type="button" className="radio-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause size={28} fill="currentColor" aria-hidden="true" /> : <Play size={28} fill="currentColor" aria-hidden="true" />}
                </button>
                <label className="radio-volume">
                  <VolIcon size={18} aria-hidden="true" />
                  <input type="range" min={0} max={1} step={0.02} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
                </label>
              </div>
              {streamError && <p className="radio-error" role="alert">The audio stream could not be played. Check that the station is running, then press play again.</p>}

              <div className="radio-transcript">
                <h3>LIVE TRANSCRIPT</h3>
                {words.length === 0 ? (
                  <p className="radio-muted">No transcript for this item.</p>
                ) : (
                  <div className="radio-transcript-text" ref={transcriptRef}>
                    {words.map((w, i) => (
                      <span
                        key={i}
                        ref={i === currentIdx ? currentWordRef : undefined}
                        className={i < currentIdx || (i === currentIdx && !wordActive) ? "past" : i === currentIdx ? "current" : "future"}
                      >{w.word}{" "}</span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
