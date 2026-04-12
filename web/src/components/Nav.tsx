import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Container } from "./Container";

export function Nav() {
  const [stars, setStars] = useState<number | null>(null);

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
          bottel.ai
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
          <a
            href="https://github.com/bottel-ai/bottel.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border rounded-md px-2.5 py-1 hover:text-text-primary hover:border-text-muted transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            <span>Star</span>
            {stars !== null && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-accent tabular-nums">{stars}</span>
              </>
            )}
          </a>
        </div>
      </Container>
    </nav>
  );
}
