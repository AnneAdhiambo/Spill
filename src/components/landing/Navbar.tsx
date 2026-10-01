import { Moon, Sun } from "lucide-react"
import { useTheme } from "../../hooks/useTheme"
import { useIdentitySession } from "../../hooks/useIdentitySession"

const links = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Community", href: "/communities" },
  { label: "Space", href: "/space" },
  { label: "Radio", href: "/radio" },
]

export default function Navbar() {
  const { theme, toggleTheme } = useTheme()
  const { isSignedIn, signOut } = useIdentitySession()
  const isDark = theme === "dark"

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Spill home">
        <img src="/assets/spill-logo.png" alt="Spill" />
      </a>

      <nav className="desktop-nav" aria-label="Primary navigation">
        {links.map((link, index) => (
          <a
            className={index === 0 ? "active" : ""}
            href={link.href}
            key={link.label}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="header-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          aria-pressed={!isDark}
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        {isSignedIn ? (
          <button className="secondary-button compact" type="button" onClick={signOut}>Sign out</button>
        ) : (
          <>
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => {
                window.location.pathname = "/get-started"
              }}
            >
              Sign in
            </button>
            <button
              className="primary-button compact"
              type="button"
              onClick={() => {
                window.location.pathname = "/get-started"
              }}
            >
              Get Started
            </button>
          </>
        )}
      </div>
    </header>
  )
}
