import { useEffect, useRef } from "react"
import { ArrowDown, ArrowUpRight } from "lucide-react"
import HeroSection from "../components/landing/HeroSection"
import ImpactSection from "../components/landing/ImpactSection"
import Navbar from "../components/landing/Navbar"
import ProductHighlights from "../components/landing/ProductHighlights"
import TrustCarousel from "../components/landing/TrustCarousel"

export default function LandingPage() {
  const page = useRef<HTMLElement>(null)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible")
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })
    page.current?.querySelectorAll(".highlight-card, .journey-step, .impact-section").forEach(element => {
      element.classList.add("scroll-reveal")
      observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])
  return (
    <main className="landing-page" ref={page}>
      <section className="hero-shell">
        <Navbar />
        <HeroSection />
      </section>

      <TrustCarousel />
      <div className="landing-intro" id="discover">
        <p className="card-kicker">A LITTLE COURAGE. A COLLECTIVE VOICE.</p>
        <h2>There’s more than one<br />way to make a difference.</h2>
        <p>Share what you see. Listen to a new perspective. Find a community that cares.</p>
        <ArrowDown size={24} aria-hidden="true" />
      </div>
      <ProductHighlights />
      <section className="journey-section" id="how-it-works" aria-labelledby="journey-title">
        <div className="journey-heading">
          <span className="card-kicker">FROM YOUR WORLD TO THE CONVERSATION</span>
          <h2 id="journey-title">Your voice starts here.</h2>
          <p>A moment, a story, a connection. Take it one step at a time.</p>
        </div>
        <div className="journey-grid">
          {[
            ["01", "Make it yours", "Create your identity and choose how you show up in your community."],
            ["02", "Share your perspective", "Add your story, photos and context. Start with what matters to you."],
            ["03", "Keep the conversation going", "Explore communities and join audio Spaces to listen, learn and connect."],
          ].map(([number, title, description]) => (
            <article className="journey-step" key={number}>
              <span className="step-number">{number}</span>
              <h3>{title}</h3><p>{description}</p>
            </article>
          ))}
        </div>
        <a className="journey-link" href="/get-started">Take the first step <ArrowUpRight size={18} /></a>
      </section>
      <ImpactSection />
      <footer className="landing-footer">
        <a href="/" aria-label="Spill home"><img src="/assets/spill-logo.png" alt="Spill" /></a>
        <p>Different voices. A shared tomorrow.</p>
        <nav aria-label="Footer navigation"><a href="/communities">Community</a><a href="/space">Space</a><a href="/radio">Radio</a><a href="#home">Back to top ↑</a></nav>
      </footer>
    </main>
  )
}
