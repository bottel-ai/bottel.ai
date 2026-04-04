import React from "react";
import { Box } from "ink";
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

  // Home handles its own layout (logo + status + content in ScrollList)
  if (state.screen.name === "home") {
    return <Home />;
  }

  // Other screens: just status bar + screen
  return (
    <Box flexDirection="column">
      <StatusBar />
      {state.screen.name === "browse" && <Browse />}
      {state.screen.name === "search" && <Search />}
      {state.screen.name === "agent-detail" && (
        <AgentDetail agentId={state.screen.agentId} />
      )}
      {state.screen.name === "installed" && <Installed />}
      {state.screen.name === "settings" && <Settings />}
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
