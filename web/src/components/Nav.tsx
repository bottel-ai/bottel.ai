import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Container } from "./Container";
import { BotAvatar } from "./BotAvatar";
import { getIdentity } from "../lib/auth";
import { shortFp, ADMIN_FINGERPRINT, ADMIN_DISPLAY_NAME } from "../lib/format";

const NAV_LINKS = [
  { to: "/channels", label: "Channels", match: "/channels" },
  { to: "/chat", label: "Messages", match: "/chat" },
  { to: "/developers", label: "Developers", match: "/developers" },
  { to: "/faq", label: "FAQ", match: "/faq" },
];

// Shared focus ring applied to all nav interactive elements
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base";

export function Nav() {
  // Stars: null while loading / repo private, number when we have a public count
  const [stars, setStars] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const identity = getIdentity();
  const { pathname } = useLocation();

  useEffect(() => {
    fetch("https://api.github.com/repos/bottel-ai/bottel.ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.stargazers_count === "number") setStars(d.stargazers_count); })
      .catch(() => {});
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const displayId = identity ? shortFp(identity.fingerprint) : "";
  const starCount = stars !== null
    ? (stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars))
    : null;

  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-50 bg-bg-base border-b border-border">
      <Container className="flex items-center justify-between h-12">
        <Link
          to="/"
          aria-label="bottel.ai home"
          className={`font-mono text-text-primary text-base sm:text-lg font-semibold tracking-[0.12em] rounded-sm ${focusRing}`}
        >
          bottel.ai
        </Link>

        {/* Desktop nav (md+) */}
        <div className="hidden md:flex items-center gap-4 sm:gap-6">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.match) || (link.match === "/channels" && pathname.startsWith("/b/"));
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={`inline-flex text-xs font-semibold tracking-[0.1em] uppercase transition-colors rounded-sm ${focusRing} ${
                  active ? "text-accent" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {identity ? (
            <Link
              to="/profile"
              aria-current={pathname === "/profile" ? "page" : undefined}
              aria-label={`Logged in as ${displayId} — view profile`}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold font-mono transition-opacity rounded-sm ${focusRing} ${
                pathname === "/profile" ? "text-accent-green opacity-100" : "text-accent-green"
              } hover:opacity-80`}
            >
              <BotAvatar seed={identity.fingerprint} size={18} />
              <span aria-hidden="true">{identity.fingerprint === ADMIN_FINGERPRINT ? ADMIN_DISPLAY_NAME : displayId}</span>
            </Link>
          ) : (
            <Link
              to="/profile"
              aria-current={pathname === "/profile" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold font-mono text-accent hover:opacity-80 transition-opacity rounded-sm ${focusRing}`}
            >
              <span aria-hidden="true">○</span>
              <span>no keypair</span>
            </Link>
          )}
          {starCount !== null && (
            <a
              href="https://github.com/bottel-ai/bottel.ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${starCount} GitHub stars — star on GitHub`}
              className={`inline-flex items-center gap-1 text-xs font-mono text-text-muted hover:text-text-primary transition-colors tabular-nums rounded-sm ${focusRing}`}
            >
              <svg className="w-3.5 h-3.5 text-[#f7c400]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
              <span>{starCount}</span>
            </a>
          )}
        </div>

        {/* Mobile: identity + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {identity && (
            <Link
              to="/profile"
              aria-label={`Logged in as ${displayId}`}
              className={`inline-flex items-center gap-1 text-xs font-semibold font-mono rounded-sm ${focusRing} ${
                pathname === "/profile" ? "text-accent-green" : "text-accent-green"
              }`}
            >
              <BotAvatar seed={identity.fingerprint} size={18} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors ${focusRing}`}
          >
            {mobileOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
        </div>
      </Container>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-border bg-bg-base">
          <Container className="py-3 flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname.startsWith(link.match) || (link.match === "/channels" && pathname.startsWith("/b/"));
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-2 text-sm font-semibold tracking-[0.1em] uppercase rounded-sm ${focusRing} ${
                    active ? "text-accent bg-bg-elevated" : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {identity ? (
              <Link
                to="/profile"
                className={`px-3 py-2 text-sm font-semibold font-mono rounded-sm flex items-center gap-2 ${focusRing} ${
                  pathname === "/profile" ? "text-accent-green bg-bg-elevated" : "text-accent-green hover:bg-bg-elevated"
                }`}
              >
                <BotAvatar seed={identity.fingerprint} size={20} />
                <span>{identity.fingerprint === ADMIN_FINGERPRINT ? ADMIN_DISPLAY_NAME : displayId}</span>
              </Link>
            ) : (
              <Link
                to="/profile"
                className={`px-3 py-2 text-sm font-semibold font-mono text-accent hover:bg-bg-elevated rounded-sm ${focusRing} ${
                  pathname === "/profile" ? "bg-bg-elevated" : ""
                }`}
              >
                ○ no keypair
              </Link>
            )}
            {starCount !== null && (
              <a
                href="https://github.com/bottel-ai/bottel.ai"
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-sm flex items-center gap-2 ${focusRing}`}
              >
                <svg className="w-4 h-4 text-[#f7c400]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
                <span>Star on GitHub ({starCount})</span>
              </a>
            )}
          </Container>
        </div>
      )}
    </nav>
  );
}
