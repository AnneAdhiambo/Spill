export default function ReportingCard() {
  return (
    <article className="highlight-card report-card" id="report">
      <div className="highlight-copy">
        <span className="card-kicker">01 / REPORT & DOCUMENT</span>
        <h2>Some stories<br />need to be seen.</h2>
        <p>
          Give the moments that matter a voice. Share photos and context from your community, even when you're offline.
        </p>
        <a href="/get-started">
          Start your story <span aria-hidden="true">↗</span>
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
