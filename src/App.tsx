import React from "react";
import { Box } from "ink";
import Logo from "./components/Logo.js";
import StatusBar from "./components/StatusBar.js";
import { StoreProvider, useStore } from "./cli_app_state.js";
import { Home } from "./screens/Home.js";
import { Browse } from "./screens/Browse.js";
import { Search } from "./screens/Search.js";
import { AgentDetail } from "./screens/AgentDetail.js";
import { Installed } from "./screens/Installed.js";
import { Settings } from "./screens/Settings.js";

function Router() {
  const { state } = useStore();
  const isHome = state.screen.name === "home";

  return (
    <Box flexDirection="column">
      {isHome && <Logo />}
      <StatusBar />
      {isHome && <Home />}
      {state.screen.name === "browse" && <Browse key="browse" />}
      {state.screen.name === "search" && <Search key="search" />}
      {state.screen.name === "agent-detail" && (
        <AgentDetail key={`detail-${state.screen.agentId}`} agentId={state.screen.agentId} />
      )}
      {state.screen.name === "installed" && <Installed key="installed" />}
      {state.screen.name === "settings" && <Settings key="settings" />}
    </Box>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}

export default App;
