import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Container } from "./Container";
import { BotAvatar } from "./BotAvatar";
import { getIdentity } from "../lib/auth";
import { shortFp, ADMIN_FINGERPRINT, ADMIN_DISPLAY_NAME } from "../lib/format";

const NAV_LINKS = [
  { to: "/channels", label: "Channels", match: "/channels" },
  { to: "/chat", label: "Chat", match: "/chat" },
  { to: "/developers", label: "Developers", match: "/developers" },
  { to: "/faq", label: "FAQ", match: "/faq" },
];

// Shared focus ring applied to all nav interactive elements
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base";

export function Nav() {
  const [stars, setStars] = useState<number>(0);
  const identity = getIdentity();
  const { pathname } = useLocation();

  useEffect(() => {
    fetch("https://api.github.com/repos/bottel-ai/bottel.ai")
      .then((r) => r.json())
      .then((d) => { if (typeof d.stargazers_count === "number") setStars(d.stargazers_count); })
      .catch(() => {});
  }, []);

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

        <div className="flex items-center gap-4 sm:gap-6">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.match) || (link.match === "/channels" && pathname.startsWith("/b/"));
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={`hidden sm:inline-flex text-xs font-semibold tracking-[0.1em] uppercase transition-colors rounded-sm ${focusRing} ${
                  active ? "text-accent" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {identity ? (
            <Link
              to="/login"
              aria-current={pathname === "/login" ? "page" : undefined}
              aria-label={`Logged in as ${shortFp(identity.fingerprint)} — view profile`}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold font-mono transition-opacity rounded-sm ${focusRing} ${
                pathname === "/login" ? "text-accent-green opacity-100" : "text-accent-green"
              } hover:opacity-80`}
            >
              <BotAvatar seed={identity.fingerprint} size={18} />
              <span aria-hidden="true">{identity.fingerprint === ADMIN_FINGERPRINT ? ADMIN_DISPLAY_NAME : shortFp(identity.fingerprint)}</span>
            </Link>
          ) : (
            <Link
              to="/login"
              aria-current={pathname === "/login" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold font-mono transition-colors rounded-sm ${focusRing} ${
                pathname === "/login" ? "text-accent" : "text-text-muted hover:text-text-primary"
              }`}
            >
              <span aria-hidden="true">○</span>
              <span>not logged in</span>
            </Link>
          )}
          {/* GitHub star widget — no overflow-hidden so focus ring isn't clipped */}
          <div className="inline-flex items-center rounded-md border border-border">
            <a
              href="https://github.com/bottel-ai/bottel.ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Star bottel.ai on GitHub (opens in new tab)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors rounded-l-md ${focusRing}`}
            >
              <svg className="w-3.5 h-3.5 text-[#f7c400]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
              <span aria-hidden="true">Star</span>
            </a>
            <a
              href="https://github.com/bottel-ai/bottel.ai/stargazers"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars} GitHub stars (opens in new tab)`}
              className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold text-text-primary border-l border-border hover:text-accent transition-colors tabular-nums font-mono rounded-r-md ${focusRing}`}
            >
              <span aria-hidden="true">{stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}</span>
            </a>
          </div>
        </div>
      </Container>
    </nav>
  );
}
