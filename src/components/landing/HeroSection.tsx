import { LockKeyhole, Network, UsersRound, WifiOff } from "lucide-react";
import HeroVisual from "./HeroVisual";

export default function HeroSection() {
  return (
    <div className="hero-content" id="home">
      <div className="hero-copy">
        <h1>Stories that survive silence</h1>

        <p className="hero-tagline">Spill what matters. Speak without permission.</p>

        <p className="nostr-note">
          <Network size={16} aria-hidden="true" /> Built on Nostr for decentralized publishing.
        </p>

        <div className="trust-row" aria-label="Core platform promises">
          <div className="trust-item">
            <LockKeyhole size={30} />
            <span>
              Your identity.
              <br />
              Your control.
            </span>
          </div>

          <div className="trust-item">
            <WifiOff size={30} />
            <span>
              Works offline.
              <br />
              Syncs automatically.
            </span>
          </div>

          <div className="trust-item">
            <UsersRound size={30} />
            <span>
              Built for
              <br />
              African communities.
            </span>
          </div>
        </div>
      </div>

      <HeroVisual />
    </div>
  );
}
