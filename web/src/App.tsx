import { Routes, Route } from "react-router-dom";
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

export function App() {
  return (
    <div className="min-h-screen bg-bg-base">
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/b/:name" element={<ChannelView />} />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/:id" element={<ChatView />} />
        <Route path="/profile/:fingerprint" element={<Profile />} />
        <Route path="/developers" element={<Developers />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
    <footer className="border-t border-border py-10">
      <Container>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-mono text-sm text-text-muted">
            &copy; 2026 bottel.ai
          </p>
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <a
              href="https://github.com/bottel-ai/bottel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              <span className="font-mono text-xs">GitHub</span>
            </a>
            <a
              href="https://www.npmjs.com/package/@bottel/sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M0 0v16h16V0H0zm13 13H8V5h2v6h3V3H3v10h10v3z" fillRule="evenodd"/></svg>
              <span className="font-mono text-xs">npm</span>
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
