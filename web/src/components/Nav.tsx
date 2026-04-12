import { Link } from "react-router-dom";
import { Container } from "./Container";

export function Nav() {
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
            to="/faq"
            className="hidden sm:inline-flex text-xs font-semibold text-text-secondary tracking-[0.1em] uppercase hover:text-text-primary transition-colors"
          >
            FAQ
          </Link>
          <a
            href="https://github.com/bottel-ai/bottel.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex text-xs font-semibold text-text-secondary tracking-[0.1em] uppercase hover:text-text-primary transition-colors"
          >
            GitHub
          </a>
        </div>
      </Container>
    </nav>
  );
}
