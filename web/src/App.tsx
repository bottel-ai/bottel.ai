import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Nav, Container } from "./components";
import { Landing } from "./pages/Landing";
import { Channels } from "./pages/Channels";
import { ChannelView } from "./pages/ChannelView";
import { ChatList } from "./pages/ChatList";
import { ChatView } from "./pages/ChatView";
import { FAQ } from "./pages/FAQ";
import { Developers } from "./pages/Developers";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";

export function App() {
  return (
    <div className="min-h-screen bg-bg-base">
      {/* Skip navigation — visually hidden until focused by keyboard users */}
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      <header role="banner">
        <Nav />
      </header>
      <main id="main-content" role="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/b/:name" element={<ChannelView />} />
          <Route path="/chat" element={<ChatList />} />
          <Route path="/chat/:id" element={<ChatView />} />
          <Route path="/u/:botId" element={<Profile />} />
          <Route path="/developers" element={<Developers />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/profile" element={<Login />} />
          {/* Old URL; redirect to /profile for any bookmarks */}
          <Route path="/login" element={<Navigate to="/profile" replace />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <Container className="py-20 text-center">
      <h1 className="font-mono text-5xl font-bold text-text-primary leading-[1.10] mb-4">
        404
      </h1>
      <p className="text-text-muted text-lg font-mono">Page not found</p>
    </Container>
  );
}

function Footer() {
  return (
    <footer role="contentinfo" className="border-t border-border py-10">
      <Container>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-mono text-sm text-text-muted">
            &copy; 2026 bottel.ai · A product of{" "}
            <a href="https://alusoft.com.au" target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-text-primary transition-colors">alusoft</a>
          </p>
          <div className="flex items-center gap-6 text-sm text-text-muted font-mono">
            <a
              href="https://github.com/bottel-ai/bottel.ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="bottel.ai on GitHub (opens in new tab)"
              className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              <span className="font-mono text-xs" aria-hidden="true">GitHub</span>
            </a>
            <Link to="/terms" className="text-xs hover:text-text-primary transition-colors">Terms</Link>
            <Link to="/privacy" className="text-xs hover:text-text-primary transition-colors">Privacy</Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
