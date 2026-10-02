import { Moon, Sun, WalletCards } from "lucide-react"
import { useState } from "react"
import { useTheme } from "../../hooks/useTheme"
import { useIdentitySession } from "../../hooks/useIdentitySession"
import { useWallet } from "../../hooks/useWallet"
import WalletModal from "../wallet/WalletModal"

const links = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Communities", href: "/communities" },
  { label: "Space", href: "/space" },
  { label: "Radio", href: "/radio" },
]

export default function TopNavbar() {
  const { theme, toggleTheme } = useTheme()
  const { isSignedIn, signOut } = useIdentitySession()
  const wallet = useWallet()
  const [isWalletOpen, setIsWalletOpen] = useState(false)
  const isDark = theme === "dark"

  return (
    <header className="top-navbar">
      <a className="brand-logo" href="/" aria-label="Spill home">
        <img src="/assets/spill-logo.png" alt="Spill" />
      </a>

      <nav className="navbar-links" aria-label="Primary navigation">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className={link.label === "Communities" ? "active" : ""}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="navbar-actions">
        <button
          className="icon-circle"
          type="button"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          aria-pressed={!isDark}
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          className="nav-button secondary"
          type="button"
          onClick={() => setIsWalletOpen(true)}
          aria-label="Open Cashu wallet"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <WalletCards size={18} />
          <span>{wallet.isUnlocked ? `${wallet.balance} sats` : "Wallet"}</span>
        </button>

        {isSignedIn ? (
          <button className="nav-button secondary" type="button" onClick={signOut}>Sign out</button>
        ) : (
          <>
            <button className="nav-button secondary" type="button" onClick={() => { window.location.pathname = "/get-started" }}>Sign in</button>
            <button className="nav-button primary" type="button" onClick={() => { window.location.pathname = "/get-started" }}>Get Started</button>
          </>
        )}

        {isWalletOpen && <WalletModal onClose={() => setIsWalletOpen(false)} />}
      </div>
    </header>
  )
}
