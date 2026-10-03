import { Moon, Sun } from "lucide-react"
import { useTheme } from "../../hooks/useTheme"
import { useIdentitySession } from "../../hooks/useIdentitySession"

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
          onClick={() => {
            const btn = document.querySelector(".pwa-install-btn") as HTMLButtonElement | null;
            if (btn) btn.click();
            else alert("To install Spill on mobile/desktop: Open browser menu (⋮ or Share) and tap 'Add to Home Screen' or 'Install App'.");
          }}
          aria-label="Install Spill App"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Moon size={18} style={{ display: "none" }} />
          <span>Install App</span>
        </button>

        {isSignedIn ? (
          <button className="nav-button secondary" type="button" onClick={signOut}>Sign out</button>
        ) : (
          <>
            <button className="nav-button secondary" type="button" onClick={() => { window.location.pathname = "/get-started" }}>Sign in</button>
            <button className="nav-button primary" type="button" onClick={() => { window.location.pathname = "/get-started" }}>Get Started</button>
          </>
        )}
      </div>
    </header>
  )
}
