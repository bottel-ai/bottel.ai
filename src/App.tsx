import React, { useRef, useState, useEffect } from "react";
import { Box, useInput, useStdout, useStdin } from "ink";
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

function clampedScrollBy(ref: React.RefObject<ScrollViewRef | null>, delta: number) {
  if (!ref.current) return;
  const offset = ref.current.getScrollOffset();
  const bottom = ref.current.getBottomOffset();
  const newOffset = Math.max(0, Math.min(bottom, offset + delta));
  ref.current.scrollTo(newOffset);
}

function Router() {
  const { state } = useStore();
  const { stdout } = useStdout();
  const { stdin } = useStdin();
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

  // Auto-scroll when selected item changes (arrow down/up past viewport)
  const selectedIndex = state.home.selectedIndex;
  const browseState = state.browse;
  const searchState = state.search;
  const installedState = state.installedScreen;

  useEffect(() => {
    if (!scrollRef.current) return;
    // Estimate selected item position (each navigable item ~1 line, header ~15 lines)
    const headerLines = isHome ? 15 : 3; // logo+status vs just breadcrumb+header
    let itemLine = headerLines;

    if (isHome) {
      // Menu section starts at ~15, each section header adds 2
      itemLine = 15 + selectedIndex;
      if (selectedIndex >= 6) itemLine += 2; // past menu, into featured
      if (selectedIndex >= 9) itemLine += 2; // past featured, into trending
      if (selectedIndex >= 14) itemLine += 2; // past trending, into categories
    }

    const offset = scrollRef.current.getScrollOffset();
    const viewportH = scrollRef.current.getViewportHeight();

    // If item is below viewport, scroll down
    if (itemLine >= offset + viewportH - 1) {
      scrollRef.current.scrollTo(itemLine - viewportH + 2);
    }
    // If item is above viewport, scroll up
    if (itemLine < offset) {
      scrollRef.current.scrollTo(itemLine);
    }
  }, [selectedIndex, isHome, browseState, searchState, installedState]);

  // Parse mouse wheel events from stdin (SGR mouse tracking)
  useEffect(() => {
    if (!stdin) return;
    const onData = (data: Buffer) => {
      const str = data.toString();
      const matches = str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g);
      for (const match of matches) {
        const button = parseInt(match[1]!, 10);
        if ((button & 0x43) === 0x40) {
          clampedScrollBy(scrollRef, -3);
        } else if ((button & 0x43) === 0x41) {
          clampedScrollBy(scrollRef, 3);
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin]);

  // PageUp/PageDown to scroll (clamped)
  useInput((_input, key) => {
    if (key.pageDown) clampedScrollBy(scrollRef, 5);
    if (key.pageUp) clampedScrollBy(scrollRef, -5);
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
