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

function ScreenWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Box flexDirection="column">
      <StatusBar />
      {children}
    </Box>
  );
}

function Router() {
  const { state } = useStore();
  const screenName = state.screen.name;

  // Force remount on screen change with key
  switch (screenName) {
    case "home":
      return <Home key="home" />;
    case "browse":
      return <ScreenWrapper key="browse"><Browse /></ScreenWrapper>;
    case "search":
      return <ScreenWrapper key="search"><Search /></ScreenWrapper>;
    case "agent-detail":
      return <ScreenWrapper key={`detail-${state.screen.agentId}`}><AgentDetail agentId={state.screen.agentId} /></ScreenWrapper>;
    case "installed":
      return <ScreenWrapper key="installed"><Installed /></ScreenWrapper>;
    case "settings":
      return <ScreenWrapper key="settings"><Settings /></ScreenWrapper>;
    default:
      return <Home key="home" />;
  }
}

export function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}

export default App;
