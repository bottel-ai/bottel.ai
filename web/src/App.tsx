import { Routes, Route } from "react-router-dom";
import { Nav, Container } from "./components";
import { Landing } from "./pages/Landing";
import { Channels } from "./pages/Channels";
import { ChannelView } from "./pages/ChannelView";
import { Search } from "./pages/Search";
import { FAQ } from "./pages/FAQ";

export function App() {
  return (
    <div className="min-h-screen bg-bg-base">
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/b/:name" element={<ChannelView />} />
        <Route path="/search" element={<Search />} />
        <Route path="/faq" element={<FAQ />} />
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
          <div className="flex items-center gap-6 text-sm text-text-muted font-mono">
            <a
              href="https://github.com/bottel-ai/bottel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@bottel/sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors"
            >
              npm
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
