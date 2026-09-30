export default function ReportingCard() {
  return (
    <article className="highlight-card report-card">
      <div className="highlight-copy">
        <span className="card-kicker">REPORT</span>
        <h2>Turn moments into meaningful change</h2>
        <p>
          Document issues in your community with photos, location and context.
          Your reports stay safe and sync automatically when you're online.
        </p>
        <a href="#report">
          Learn more <span aria-hidden="true">→</span>
        </a>
      </div>

      <img
        className="highlight-visual report-visual"
        src="/assets/report-visual.png"
        alt="Offline report syncing preview"
      />
    </article>
  )
}
