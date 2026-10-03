export default function RadioCard() {
  return (
    <article className="highlight-card radio-card" id="radio">
      <div className="highlight-copy">
        <span className="card-kicker">RADIO</span>
        <h2>Real conversations. Real people.</h2>
        <p>
          Join live audio channels for your community, interests or causes —
          from activism and GBV support to journalism and culture.
        </p>
        <a href="/radio">
          Explore Radio <span aria-hidden="true">→</span>
        </a>
      </div>

      <img
        className="highlight-visual radio-visual"
        src="/assets/radio-visual.png"
        alt="Activism and civic rights live radio channel"
      />
    </article>
  )
}
