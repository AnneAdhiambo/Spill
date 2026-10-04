import { useEffect, useRef, useState } from "react"
import { Headphones, RefreshCw } from "lucide-react"
import { RADIO_API_URL } from "../../features/radio/useRadioNow"

type Recording = {
  id: string
  title: string
  space: string | null
  durationSec: number | null
}

function duration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

export default function RecordingsList() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const listRef = useRef<HTMLDivElement>(null)

  async function load(signal?: AbortSignal) {
    try {
      const response = await fetch(`${RADIO_API_URL}/api/v1/radio/recordings`, { cache: "no-store", signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body: { data: Recording[] } = await response.json()
      if (!signal?.aborted) {
        setRecordings(body.data)
        setStatus("ready")
      }
    } catch {
      if (!signal?.aborted) setStatus("error")
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => void load(controller.signal), 30_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="recordings-section" ref={listRef}>
      <div className="recordings-heading">
        <div>
          <span className="section-eyebrow">RECORDINGS</span>
          <h2>Listen again.</h2>
          <p>Audio stories available on Spill Radio.</p>
        </div>
        <button type="button" className="recordings-refresh" onClick={() => { setStatus("loading"); void load() }} aria-label="Refresh recordings">
          <RefreshCw size={17} aria-hidden="true" /> Refresh
        </button>
      </div>

      {status === "loading" && recordings.length === 0 && <p className="recordings-message">Loading recordings…</p>}
      {status === "error" && recordings.length === 0 && <p className="recordings-message" role="alert">Recordings are unavailable right now. Check that the radio API is running, then refresh.</p>}
      {status === "ready" && recordings.length === 0 && <p className="recordings-message">No radio recordings are ready yet.</p>}

      {recordings.length > 0 && (
        <div className="recordings-list">
          {recordings.map((recording) => (
            <article className="recording-item" key={recording.id}>
              <div className="recording-icon"><Headphones size={22} aria-hidden="true" /></div>
              <div className="recording-content">
                <div className="recording-title-row">
                  <h3>{recording.title}</h3>
                  {duration(recording.durationSec) && <time>{duration(recording.durationSec)}</time>}
                </div>
                <p>{recording.space || "Spill Radio recording"}</p>
                <audio
                  controls
                  preload="none"
                  src={`${RADIO_API_URL}/api/v1/radio/recordings/${recording.id}/audio`}
                  aria-label={`Play ${recording.title}`}
                  onPlay={(event) => {
                    listRef.current?.querySelectorAll("audio").forEach((audio) => {
                      if (audio !== event.currentTarget) audio.pause()
                    })
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
