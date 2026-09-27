import { LockKeyhole, Network, Play, UsersRound, WifiOff } from "lucide-react"
import HeroVisual from "./HeroVisual"

export default function HeroSection() {
  return (
    <div className="hero-content" id="home">
      <div className="hero-copy">
        <p className="eyebrow">A SAFER, MORE INCLUSIVE AFRICA</p>

        <h1>
          Real Stories.
          <br />
          Stronger <span className="gradient-text">Communities.</span>
        </h1>

        <p className="hero-description">
          A privacy-first platform for citizens, journalists and communities
          across Africa to document, share, and discuss what matters — even offline.
        </p>

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

        <div className="hero-actions">
          <button className="primary-button large" type="button">
            Get Started <span aria-hidden="true">→</span>
          </button>

          <button className="secondary-button large video-button" type="button">
            <span className="play-disc">
              <Play size={15} fill="currentColor" />
            </span>
            Watch Video
          </button>
        </div>
      </div>

      <HeroVisual />
    </div>
  )
}
