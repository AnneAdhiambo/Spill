import { Network } from "lucide-react";
import HeroVisual from "./HeroVisual";

export default function HeroSection() {
  return (
    <div className="hero-content" id="home">
      <div className="hero-copy">
        <h1>Stories that survive silence</h1>

        <p className="hero-tagline">Spill what matters. Speak without permission.</p>
        <p className="hero-description">A place for everyday voices to share stories, start conversations and find their community.</p>
        <div className="hero-actions">
          <a className="primary-button large" href="/get-started">Find your voice <span aria-hidden="true">↗</span></a>
          <a className="hero-discover" href="#discover">Explore Spill <span aria-hidden="true">↓</span></a>
        </div>

        <p className="nostr-note">
          <Network size={16} aria-hidden="true" /> Built on Nostr for decentralized publishing.
        </p>


      </div>

      <HeroVisual />
    </div>
  );
}
