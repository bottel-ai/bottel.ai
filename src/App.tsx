import React, { useRef } from "react";
import { useInput } from "ink";
import { FullScreenBox } from "fullscreen-ink";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
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
  const scrollRef = useRef<ScrollViewRef>(null);
  const isHome = state.screen.name === "home";

  // PageUp/PageDown to scroll
  useInput((_input, key) => {
    if (key.pageDown) scrollRef.current?.scrollBy(10);
    if (key.pageUp) scrollRef.current?.scrollBy(-10);
  });

  return (
    <FullScreenBox flexDirection="column">
      <ScrollView ref={scrollRef} flexGrow={1}>
        {isHome && <Logo key="logo" />}
        <StatusBar key="statusbar" />
        {isHome && <Home key="home" />}
        {state.screen.name === "browse" && <Browse key="browse" />}
        {state.screen.name === "search" && <Search key="search" />}
        {state.screen.name === "agent-detail" && (
          <AgentDetail key={`detail-${state.screen.agentId}`} agentId={state.screen.agentId} />
        )}
        {state.screen.name === "installed" && <Installed key="installed" />}
        {state.screen.name === "settings" && <Settings key="settings" />}
      </ScrollView>
    </FullScreenBox>
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
