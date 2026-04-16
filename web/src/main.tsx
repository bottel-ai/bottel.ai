import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { initIdentity } from "./lib/auth";
import "./index.css";

// Redirect the *.pages.dev preview URLs to the real domain.
// Cloudflare always keeps these as internal fallbacks; we force users to the canonical site.
if (typeof window !== "undefined") {
  const host = window.location.hostname;
  if (host.endsWith(".pages.dev")) {
    const target = host.includes("bottel-web-dev")
      ? "https://dev.bottel.ai"
      : "https://bottel.ai";
    window.location.replace(target + window.location.pathname + window.location.search + window.location.hash);
  }
}

// Hydrate the identity cache from IndexedDB before the first render
// so sync accessors (getIdentity, isLoggedIn) return real values.
initIdentity().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
});
