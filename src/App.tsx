import React, { useState } from "react";
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

  const navigate = (s: Screen) => setScreen(s);
  const goHome = () => setScreen({ name: "home" });

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
          onBack={goHome}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "search" && (
        <Search
          onBack={goHome}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "agent-detail" && (
        <AgentDetail agentId={screen.agentId} onBack={goHome} />
      )}

      {screen.name === "installed" && (
        <Installed
          onBack={goHome}
          onViewAgent={(id) => navigate({ name: "agent-detail", agentId: id })}
        />
      )}

      {screen.name === "settings" && <Settings onBack={goHome} />}
    </Box>
  );
}

export default App;
