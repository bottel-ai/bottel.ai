import React, { useRef, useState, useEffect } from "react";
import { Box, useInput, useStdout } from "ink";
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
  const { stdout } = useStdout();
  const scrollRef = useRef<ScrollViewRef>(null);
  const isHome = state.screen.name === "home";

  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 24);
  useEffect(() => {
    if (!stdout) return;
    setTermHeight(stdout.rows);
    const onResize = () => {
      setTermHeight(stdout.rows);
      scrollRef.current?.remeasure();
    };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  // Scroll to top when screen changes
  useEffect(() => {
    scrollRef.current?.scrollToTop();
  }, [state.screen.name]);

  // PageUp/PageDown/mouse wheel to scroll
  useInput((_input, key) => {
    if (key.pageDown) scrollRef.current?.scrollBy(5);
    if (key.pageUp) scrollRef.current?.scrollBy(-5);
  });

  return (
    <Box flexDirection="column">
      <ScrollView ref={scrollRef} height={termHeight}>
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
