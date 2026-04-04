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
  const isSearch = state.screen.name === "search";

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

  // Disable mouse tracking on search screen (prevents escape codes in TextInput)
  // Re-enable when leaving search
  useEffect(() => {
    if (!stdout) return;
    if (isSearch) {
      stdout.write(DISABLE_MOUSE);
    } else {
      stdout.write(ENABLE_MOUSE);
    }
  }, [isSearch, stdout]);

  // Parse mouse wheel events from stdin (only when mouse tracking is enabled)
  useEffect(() => {
    if (!stdin || isSearch) return;
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
  }, [stdin, isSearch]);

  // Arrow keys nudge scroll 1 line
  useInput((_input, key) => {
    if (key.downArrow) clampedScrollBy(scrollRef, 1);
    if (key.upArrow) clampedScrollBy(scrollRef, -1);
  });

  // PageUp/PageDown
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
