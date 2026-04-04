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

const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

function Router() {
  const { state, dispatch } = useStore();
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  const scrollRef = useRef<ScrollViewRef>(null);
  const isHome = state.screen.name === "home";
  const isSearch = state.screen.name === "search";

  // Track which selected index we last scrolled for, to detect changes
  const lastScrolledIndex = useRef(-1);

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
    lastScrolledIndex.current = -1;
  }, [state.screen.name]);

  // Disable mouse tracking on search screen
  useEffect(() => {
    if (!stdout) return;
    stdout.write(isSearch ? DISABLE_MOUSE : ENABLE_MOUSE);
  }, [isSearch, stdout]);

  // Get current selected index for the active screen
  function getSelectedIndex(): number {
    if (isHome) return state.home.selectedIndex;
    if (state.screen.name === "installed") return state.installedScreen.selectedIndex;
    if (state.screen.name === "settings") return state.settings.selectedIndex;
    if (state.screen.name === "browse") return state.browse.categoryIndex;
    return 0;
  }

  // When selected index changes, scroll viewport ONLY if cursor is off-screen
  const currentIndex = getSelectedIndex();
  useEffect(() => {
    if (!scrollRef.current) return;
    if (currentIndex === lastScrolledIndex.current) return;

    const direction = currentIndex > lastScrolledIndex.current ? "down" : "up";
    lastScrolledIndex.current = currentIndex;

    const offset = scrollRef.current.getScrollOffset();
    const viewportH = scrollRef.current.getViewportHeight();
    const bottom = scrollRef.current.getBottomOffset();

    if (direction === "down") {
      // Only scroll if we might be near the bottom of viewport
      // Scroll just 1 line to nudge the viewport
      const nearBottom = offset + viewportH;
      if (nearBottom < scrollRef.current.getContentHeight()) {
        // Check if we should scroll by seeing if content is clipped
        const newOffset = Math.min(bottom, offset + 1);
        scrollRef.current.scrollTo(newOffset);
      }
    } else {
      // Scroll up: nudge viewport up 1 line if we're not at top
      if (offset > 0) {
        scrollRef.current.scrollTo(Math.max(0, offset - 1));
      }
    }
  }, [currentIndex]);

  // Mouse wheel — move cursor only (viewport follows via effect above)
  useEffect(() => {
    if (!stdin || isSearch) return;
    const onData = (data: Buffer) => {
      const str = data.toString();
      const matches = str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g);
      for (const match of matches) {
        const button = parseInt(match[1]!, 10);
        const isUp = (button & 0x43) === 0x40;
        const isDown = (button & 0x43) === 0x41;
        if (!isUp && !isDown) continue;

        // Move cursor only — viewport follows automatically
        if (isHome) {
          dispatch({ type: "UPDATE_HOME", state: {
            selectedIndex: isDown
              ? Math.min(state.home.selectedIndex + 1, 999)
              : Math.max(state.home.selectedIndex - 1, 0),
          }});
        } else if (state.screen.name === "installed") {
          dispatch({ type: "UPDATE_INSTALLED", state: {
            selectedIndex: isDown
              ? state.installedScreen.selectedIndex + 1
              : Math.max(state.installedScreen.selectedIndex - 1, 0),
          }});
        } else if (state.screen.name === "settings") {
          dispatch({ type: "UPDATE_SETTINGS", state: {
            selectedIndex: isDown
              ? state.settings.selectedIndex + 1
              : Math.max(state.settings.selectedIndex - 1, 0),
          }});
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin, isSearch, isHome, state, dispatch]);

  // PageUp/PageDown — scroll viewport directly (for fast jumping)
  useInput((_input, key) => {
    if (!scrollRef.current) return;
    if (key.pageDown) {
      const offset = scrollRef.current.getScrollOffset();
      const bottom = scrollRef.current.getBottomOffset();
      scrollRef.current.scrollTo(Math.min(bottom, offset + 10));
    }
    if (key.pageUp) {
      const offset = scrollRef.current.getScrollOffset();
      scrollRef.current.scrollTo(Math.max(0, offset - 10));
    }
  });

  return (
    <Box flexDirection="column">
      <ScrollView ref={scrollRef} height={termHeight}>
        {isHome && <Logo key="logo" />}
        <StatusBar key="statusbar" />
        {isHome && <Home key="home" />}
        {state.screen.name === "browse" && <Browse key="browse" />}
        {isSearch && <Search key="search" />}
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
