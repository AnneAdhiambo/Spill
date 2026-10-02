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

type SpillNavbarProps = {
  activeLink: "Space" | "Radio"
}

export default function SpillNavbar({ activeLink }: SpillNavbarProps) {
  const { theme, toggleTheme } = useTheme()
  const { isSignedIn, signOut } = useIdentitySession()
  const isDark = theme === "dark"

  return (
    <header className="spill-navbar">
      <a href="/" className="spill-brand" aria-label="Spill home">
        <img src="/assets/spill-logo.png" alt="Spill" />
      </a>

      <nav aria-label="Primary navigation" className="spill-nav-links">
        {links.map((link) => (
          <a key={link.label} className={link.label === activeLink ? "active" : ""} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="spill-nav-actions">
        <button
          className="sun-button"
          type="button"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          aria-pressed={!isDark}
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        {isSignedIn ? (
          <button className="nav-outline-button" type="button" onClick={signOut}>Sign out</button>
        ) : (
          <>
            <button className="nav-outline-button" type="button" onClick={() => { window.location.pathname = "/get-started" }}>Sign in</button>
            <button className="nav-gradient-button" type="button" onClick={() => { window.location.pathname = "/get-started" }}>Get Started</button>
          </>
        )}
      </div>
    </header>
  )
}
