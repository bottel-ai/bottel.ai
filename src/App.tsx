import React, { useState, useCallback } from "react";
import { Box, useApp } from "ink";
import Logo from "./components/Logo.js";
import StatusBar from "./components/StatusBar.js";
import { Home } from "./screens/Home.js";
import { Browse } from "./screens/Browse.js";
import { Search } from "./screens/Search.js";
import { AgentDetail } from "./screens/AgentDetail.js";
import { Installed } from "./screens/Installed.js";
import { Settings } from "./screens/Settings.js";

export type Screen =
  | { name: "home" }
  | { name: "browse" }
  | { name: "search" }
  | { name: "agent-detail"; agentId: string }
  | { name: "installed" }
  | { name: "settings" };

export function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [history, setHistory] = useState<Screen[]>([]);

  // Persisted state across navigation
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);

  const navigate = useCallback((s: Screen) => {
    setHistory((prev) => [...prev, screen]);
    setScreen(s);
  }, [screen]);

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) {
        setScreen({ name: "home" });
        return [];
      }
      const newHistory = [...prev];
      const last = newHistory.pop()!;
      setScreen(last);
      return newHistory;
    });
  }, []);

  const goHome = useCallback(() => {
    setHistory([]);
    setScreen({ name: "home" });
  }, []);

  const isHome = screen.name === "home";

  return (
    <Box flexDirection="column">
      {isHome && <Logo />}
      <StatusBar />

      {isHome && (
        <Home
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
          onViewCategory={() => navigate({ name: "browse" })}
          onSearch={() => navigate({ name: "search" })}
          onBrowse={() => navigate({ name: "browse" })}
          onInstalled={() => navigate({ name: "installed" })}
          onSettings={() => navigate({ name: "settings" })}
          onExit={exit}
        />
      )}

      {screen.name === "browse" && (
        <Browse
          onBack={goBack}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "search" && (
        <Search
          onBack={goBack}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
          savedQuery={searchQuery}
          savedIndex={searchIndex}
          onQueryChange={setSearchQuery}
          onIndexChange={setSearchIndex}
        />
      )}

      {screen.name === "agent-detail" && (
        <AgentDetail agentId={screen.agentId} onBack={goBack} />
      )}

      {screen.name === "installed" && (
        <Installed
          onBack={goBack}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "settings" && <Settings onBack={goBack} />}
    </Box>
  );
}

export default App;
