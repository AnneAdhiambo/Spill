import { useEffect, useRef } from "react"
import { ArrowUpRight, Heart, MapPin, MessageCircle, Radio } from "lucide-react"

const stories = [
  { image: "/assets/protest-hunger.jpeg", location: "Nairobi, Kenya", title: "The streets are speaking.", likes: "342", comments: "48" },
  { image: "/assets/injured-protest.jpeg", location: "Nairobi, Kenya", title: "A different side of the story.", likes: "1.2K", comments: "210" },
  { image: "/assets/protest-femicide.jpeg", location: "Nairobi, Kenya", title: "We deserve to feel safe.", likes: "1.9K", comments: "320" },
  { image: "/assets/post-journalism.png", location: "From the ground", title: "The story behind the headline.", likes: "826", comments: "73" },
  { image: "/assets/post-activism.png", location: "Our community", title: "Together, we make change.", likes: "421", comments: "56" },
]

export default function ProductHighlights() {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const cards = [...viewport.querySelectorAll<HTMLElement>(".story-card")]
    const markCentered = () => {
      const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2
      let closest: HTMLElement | null = null
      let distance = Infinity
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        const nextDistance = Math.abs(rect.left + rect.width / 2 - center)
        if (nextDistance < distance) {
          distance = nextDistance
          closest = card
        }
      }
      cards.forEach(card => card.classList.toggle("is-centered", card === closest))
    }
    markCentered()
    const timer = window.setInterval(markCentered, 160)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section className="product-highlights" id="report" aria-label="Stories, Spaces, and many voices">
      <div className="stories-panel">
        <div className="stories-heading">
          <span className="card-kicker">01 / STORIES</span>
          <h2>Some stories<br />need to be seen.</h2>
        </div>
        <div className="stories-viewport" ref={viewportRef} aria-label="Stories from the community">
          <div className="stories-track">
            {[0, 1].map(copy => (
              <div className="stories-group" key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
                {stories.map((story, index) => (
                  <article className="story-card" key={story.title}>
                    <img src={story.image} alt="" loading={index > 2 ? "lazy" : "eager"} />
                    <div className="story-location"><MapPin size={13} aria-hidden="true" />{story.location}</div>
                    <div className="story-details">
                      <h3>{story.title}</h3>
                      <div className="story-engagement">
                        <span><Heart size={14} aria-hidden="true" />{story.likes}</span>
                        <span><MessageCircle size={14} aria-hidden="true" />{story.comments}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="voices-layout">
        <div className="spaces-column" id="space">
          <span className="card-kicker">02 / SPACES</span>
          <h2>Real conversations.<br />Real people.</h2>
          <p>Join live conversations around the stories that matter.</p>
          <a className="voices-cta voices-cta-solid" href="/space">Join a Space <ArrowUpRight size={18} aria-hidden="true" /></a>
          <div className="space-preview">
            <div className="space-preview-top">
              <span className="live-pill"><Radio size={13} aria-hidden="true" /> LIVE</span>
              <span>Students for Safer Cities</span>
            </div>
            <div className="space-preview-presence">
              <div className="space-avatars" aria-hidden="true"><span>A</span><span>M</span><span>N</span><span>J</span></div>
              <span>284 listening</span>
            </div>
            <div className="space-comments">
              <p><strong>anon_jk9d</strong> This is happening in my area too.</p>
              <p><strong>anon_p3la</strong> We need more people to see this.</p>
            </div>
          </div>
        </div>

        <div className="voices-film">
          <img className="voices-poster" src="/assets/spill-it-poster.webp" alt="" aria-hidden="true" />
          <video
            src="/assets/spill-it-video.mp4"
            poster="/assets/spill-it-poster.webp"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="One anonymous voice spreading into a community of voices"
          />
        </div>

        <div className="many-voices-column">
          <span className="card-kicker">03 / MANY VOICES</span>
          <h2>Freedom starts with <em>one voice.</em></h2>
          <p>Speak. Connect. Be heard.</p>
          <a className="voices-cta voices-cta-outline" href="/get-started">Report securely <ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  )
}
