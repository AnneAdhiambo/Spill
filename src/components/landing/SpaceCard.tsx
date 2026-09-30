export default function SpaceCard() {
  return (
    <article className="highlight-card space-card" id="space">
      <div className="highlight-copy">
        <span className="card-kicker">SPACE</span>
        <h2>Real conversations. Real people.</h2>
        <p>
          Join live audio Spaces for your community, interests, or causes — from activism and GBV support
          to journalism and culture.
        </p>
        <a href="/space">
          Explore Space <span aria-hidden="true">→</span>
        </a>
      </div>

      <img
        className="highlight-visual space-visual"
        src="/assets/space-visual.png"
        alt="Activism and civic rights Spill Space room"
      />
    </article>
  );
}
