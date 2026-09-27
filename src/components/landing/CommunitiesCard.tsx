export default function CommunitiesCard() {
  return (
    <article className="highlight-card communities-card" id="communities">
      <div className="highlight-copy">
        <span className="card-kicker">COMMUNITIES</span>
        <h2>Find your people</h2>
        <p>
          Join topic-based channels and communities. Share experiences,
          get support and collaborate on solutions.
        </p>
        <a href="/communities">
          Browse Communities <span aria-hidden="true">→</span>
        </a>
      </div>

      <img
        className="highlight-visual community-visual"
        src="/assets/community-visual.png"
        alt="Spill community categories"
      />
    </article>
  )
}
