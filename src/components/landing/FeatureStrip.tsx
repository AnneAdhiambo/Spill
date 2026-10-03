import { Camera, Languages, Radio, UsersRound } from "lucide-react"

const features = [
  {
    icon: Camera,
    title: "Report & Document",
    text: "Share text, photos and evidence — even without internet.",
  },
  {
    icon: Radio,
    title: "Community Radio",
    text: "Join live audio rooms and channels that matter to you.",
  },
  {
    icon: UsersRound,
    title: "Communities",
    text: "Find and join channels for activists, GBV support, journalism, climate, and more.",
  },
  {
    icon: Languages,
    title: "Automatic Translation",
    text: "Read and contribute in any language. We translate it to English.",
  },
]

export default function FeatureStrip() {
  return (
    <section className="feature-strip" id="features">
      {features.map(({ icon: Icon, title, text }) => (
        <article className="feature-strip-item" key={title}>
          <div className="feature-icon">
            <Icon size={27} />
          </div>
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        </article>
      ))}
    </section>
  )
}
