import { LockKeyhole, UsersRound, WifiOff } from "lucide-react"

const promises = [
  { icon: LockKeyhole, title: "Your identity.", detail: "Your control." },
  { icon: WifiOff, title: "Works offline.", detail: "Syncs automatically." },
  { icon: UsersRound, title: "Built for", detail: "African communities." },
]

export default function TrustCarousel() {
  return (
    <section className="trust-carousel" aria-label="Core platform promises">
      <div className="trust-carousel-window">
        <div className="trust-carousel-track">
          {[0, 1].map(copy => (
            <ul className="trust-carousel-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {promises.map(({ icon: Icon, title, detail }) => (
                <li className="trust-carousel-item" key={title}>
                  <Icon size={28} aria-hidden="true" />
                  <span>{title}<br /><span>{detail}</span></span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}
