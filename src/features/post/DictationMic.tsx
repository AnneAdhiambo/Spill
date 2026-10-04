import { Loader2, Mic, Square } from "lucide-react"
import type { CSSProperties } from "react"
import { MAX_DICTATION_SEC } from "./config"
import type { DictationState } from "./useDictation"
import "../../styles/mic.css"

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

type Props = { state: DictationState; seconds: number; level: number; online: boolean; onStart: () => void; onStop: () => void; disabled?: boolean }

/** Large circular mic. Rings follow the live input level; reduced motion gets a static ring + level bar. */
export default function DictationMic({ state, seconds, level, online, onStart, onStop, disabled }: Props) {
  const recording = state === "recording"
  const transcribing = state === "transcribing"
  const remaining = Math.max(0, MAX_DICTATION_SEC - seconds)
  const status = transcribing ? "Transcribing…" : recording ? "Listening… tap to stop" : online ? "Tap to speak" : "Dictation needs a connection"

  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic-btn${recording ? " is-recording" : ""}${transcribing ? " is-busy" : ""}`}
        style={{ "--level": level.toFixed(3) } as CSSProperties}
        onClick={recording ? onStop : onStart}
        disabled={transcribing || disabled || (!online && !recording)}
        aria-label={recording ? "Stop dictation" : "Start dictation"}
      >
        {recording && <><span className="mic-ring mic-ring-1" aria-hidden="true" /><span className="mic-ring mic-ring-2" aria-hidden="true" /></>}
        {transcribing ? <Loader2 className="spin" size={36} aria-hidden="true" /> : recording ? <Square size={30} fill="currentColor" aria-hidden="true" /> : <Mic size={38} aria-hidden="true" />}
      </button>
      {recording && <div className="mic-level-bar" aria-hidden="true"><span style={{ width: `${Math.round(level * 100)}%` }} /></div>}
      {recording && <div className="mic-timer" aria-label="Time left">{fmt(remaining)}</div>}
      <p className="mic-status" role="status" aria-live="polite">{status}</p>
    </div>
  )
}
