import { Flower2, ShieldCheck, UsersRound, Wifi } from "lucide-react"

const promises = [
  { icon: ShieldCheck, label: "Privacy by design" },
  { icon: UsersRound, label: "Community driven" },
  { icon: Wifi, label: "Offline first" },
  { icon: Flower2, label: "Built for impact" },
]

export default function ImpactSection() {
  return (
    <section className="impact-section" id="about">
      <div className="impact-copy">
        <h2>
          Stronger voices.
          <br />
          Safer communities.
          <br />
          A more informed Africa.
        </h2>
      </div>

      <div className="impact-promises">
        {promises.map(({ icon: Icon, label }) => (
          <div className="impact-promise" key={label}>
            <Icon size={28} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <img
        className="impact-people"
        src="/assets/impact-people.png"
        alt=""
        aria-hidden="true"
      />

      <button
        className="primary-button impact-button"
        type="button"
        onClick={() => {
          window.location.pathname = "/get-started"
        }}
      >
        Join the Movement <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}
