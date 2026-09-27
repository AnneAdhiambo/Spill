import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "../shared/Brand";
export function Navbar({ onJoin }: { onJoin: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="navbar container">
      <Brand />
      <button
        className="menu-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav
        id="navigation"
        className={open ? "navigation is-open" : "navigation"}
        aria-label="Main navigation"
      >
        {["Home", "Features", "Communities", "Radio", "Safety", "About"].map(
          (item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              onClick={() => setOpen(false)}
            >
              {item}
            </a>
          ),
        )}
      </nav>
      <div className="nav-actions">
        <button className="sign-in" onClick={onJoin}>
          Sign in
        </button>
        <button className="button primary small" onClick={onJoin}>
          Get Started <ArrowUpRight size={16} />
        </button>
      </div>
    </header>
  );
}
