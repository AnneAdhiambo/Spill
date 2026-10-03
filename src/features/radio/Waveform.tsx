import { useEffect, useRef } from "react"

const BARS = 64

type Props = { analyser: AnalyserNode | null; playing: boolean; progress: () => number }

/** Bars follow the audio through an AnalyserNode. Without a readable analyser they are static, never simulated. */
export default function Waveform({ analyser, playing, progress }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext("2d")
    if (!ctx) return
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    let raf = 0
    let silentFrames = 0
    let warned = false

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = el.clientWidth, h = el.clientHeight
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      let live = false
      if (analyser && data && playing) {
        analyser.getByteFrequencyData(data)
        live = data.some((v) => v > 0)
        if (!live && ++silentFrames > 180 && !warned) { warned = true; console.warn("Radio waveform: the analyser reads only silence (stream CORS?). Showing static bars.") }
        if (live) silentFrames = 0
      }
      const slot = w / BARS, barW = Math.max(2, slot * 0.55)
      const played = Math.floor(progress() * BARS)
      const usable = Math.floor((data?.length ?? BARS) * 0.75) // upper bins are mostly empty for speech
      for (let i = 0; i < BARS; i++) {
        let level = 0.18 // static bar
        if (live && data) {
          const from = Math.floor((i / BARS) * usable), to = Math.max(from + 1, Math.floor(((i + 1) / BARS) * usable))
          let sum = 0
          for (let j = from; j < to; j++) sum += data[j]
          level = Math.max(0.1, sum / (to - from) / 255)
        }
        const bh = Math.max(4, level * h)
        ctx.fillStyle = i < played ? "#f26a21" : "rgba(180,170,160,.32)"
        ctx.beginPath()
        ctx.roundRect(i * slot + (slot - barW) / 2, (h - bh) / 2, barW, bh, barW / 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [analyser, playing, progress])

  return <canvas ref={canvas} className="radio-wave" aria-hidden="true" />
}
