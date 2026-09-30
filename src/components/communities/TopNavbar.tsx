import { Settings2 } from "lucide-react"

const links = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Community", href: "/communities" },
  { label: "Radio", href: "/#radio" },
]

export default function TopNavbar() {
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
            className={link.label === "Community" ? "active" : ""}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="navbar-actions">
        <button className="icon-circle" type="button" aria-label="Settings">
          <Settings2 size={18} />
        </button>
        <button className="nav-button secondary" type="button">Sign in</button>
        <button className="nav-button primary" type="button">Get Started</button>
      </div>
    </header>
  )
}
