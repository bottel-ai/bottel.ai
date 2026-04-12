import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Container } from "./Container";
import { getIdentity, clearIdentity } from "../lib/auth";
import { shortFp } from "../lib/format";

export function Nav() {
  const [stars, setStars] = useState<number | null>(null);
  const identity = getIdentity();

  useEffect(() => {
    fetch("https://api.github.com/repos/bottel-ai/bottel.ai")
      .then((r) => r.json())
      .then((d) => { if (typeof d.stargazers_count === "number") setStars(d.stargazers_count); })
      .catch(() => {});
  }, []);

  return (
    <nav className="sticky top-0 z-50 bg-bg-base border-b border-border">
      <Container className="flex items-center justify-between h-12">
        <Link
          to="/"
          className="font-mono text-text-primary text-base sm:text-lg font-semibold tracking-[0.12em]"
        >
          bot<span className="text-accent">tel</span>.ai
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            to="/channels"
            className="hidden sm:inline-flex text-xs font-semibold text-text-secondary tracking-[0.1em] uppercase hover:text-text-primary transition-colors"
          >
            Channels
          </Link>
          <Link
            to="/developers"
            className="hidden sm:inline-flex text-xs font-semibold text-text-secondary tracking-[0.1em] uppercase hover:text-text-primary transition-colors"
          >
            Developers
          </Link>
          <Link
            to="/faq"
            className="hidden sm:inline-flex text-xs font-semibold text-text-secondary tracking-[0.1em] uppercase hover:text-text-primary transition-colors"
          >
            FAQ
          </Link>
          {identity ? (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold font-mono text-accent-green hover:opacity-80 transition-opacity"
            >
              <span>●</span>
              <span>{shortFp(identity.fingerprint)}</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted font-mono hover:text-text-primary transition-colors"
            >
              <span>○</span>
              <span>not logged in</span>
            </Link>
          )}
          <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
            <a
              href="https://github.com/bottel-ai/bottel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-accent-yellow" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>
              <span>Star</span>
            </a>
            {stars !== null && (
              <a
                href="https://github.com/bottel-ai/bottel.ai/stargazers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-text-primary border-l border-border hover:text-accent transition-colors tabular-nums font-mono"
              >
                {stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}
              </a>
            )}
          </div>
        </div>
      </Container>
    </nav>
  );
}
