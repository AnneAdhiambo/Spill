export default function Waveform() {
  const bars = [22,37,48,30,56,44,62,51,29,45,54,39,59,48,36,28,50,57,42,33,26,45,38,32,28,36,42,31,25,34,27,23,31,24,20,27,22,19,25,18,16,21]

  return (
    <div className="waveform" aria-label="Live audio waveform">
      {bars.map((height, index) => (
        <span key={index} className={index < 16 ? "hot" : ""} style={{ height: `${height}px` }} />
      ))}
    </div>
  )
}
