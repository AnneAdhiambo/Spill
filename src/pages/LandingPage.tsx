import FeatureStrip from "../components/landing/FeatureStrip"
import HeroSection from "../components/landing/HeroSection"
import ImpactSection from "../components/landing/ImpactSection"
import Navbar from "../components/landing/Navbar"
import ProductHighlights from "../components/landing/ProductHighlights"

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="hero-shell">
        <Navbar />
        <HeroSection />
      </section>

      <FeatureStrip />
      <ProductHighlights />
      <ImpactSection />
    </main>
  )
}
