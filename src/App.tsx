import React, { useRef, useState, useEffect } from "react";
import { Box, Text, useInput, useStdout, useStdin } from "ink";
import type { Screen } from "./state.js";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { Logo } from "./components.js";
import { StoreProvider, useStore } from "./state.js";
import { colors } from "./theme.js";
import { Home } from "./screens/Home.js";
import { Search } from "./screens/Search.js";
import { ChannelList } from "./screens/ChannelList.js";
import { ChannelView } from "./screens/ChannelView.js";
import { CreateChannel } from "./screens/CreateChannel.js";
import { Auth } from "./screens/Auth.js";
import { Settings } from "./screens/Settings.js";
import { ProfileSetup } from "./screens/ProfileSetup.js";
import { ChatList } from "./screens/ChatList.js";
import { ChatView } from "./screens/ChatView.js";
import { isLoggedIn, getAuth } from "./lib/auth.js";
import { pingOnline } from "./lib/api.js";

const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

// ─── Unified sub-page header ────────────────────────────────────
//
// Claude editorial style: brand identifier + breadcrumb trail on one
// line, with a thin warm-gray separator below. Replaces the per-screen
// Breadcrumb + ScreenHeader components.

function screenCrumbs(screen: Screen): string[] {
  switch (screen.name) {
    case "search":        return ["Search"];
    case "channel-list":  return ["Channels"];
    case "channel-view":  return ["Channels", `b/${screen.channelName}`];
    case "channel-create": return ["Channels", "Create"];
    case "auth":          return ["Profile"];
    case "settings":      return ["Settings"];
    case "profile-setup": return ["Profile", "Edit"];
    case "chat-list":     return ["Chat"];
    case "chat-view":     return ["Chat", "Direct Message"];
    default:              return [];
  }
}

function SubPageHeader({ screen, termWidth }: { screen: Screen; termWidth: number }) {
  const crumbs = screenCrumbs(screen);
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color={colors.primary}>bottel.ai</Text>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <React.Fragment key={i}>
              <Text color={colors.subtle}>{"  ›  "}</Text>
              <Text bold={isLast} color={isLast ? undefined : colors.muted}>
                {c}
              </Text>
            </React.Fragment>
          );
        })}
      </Box>
      <Text color={colors.subtle}>
        {"─".repeat(Math.max(10, termWidth - 2))}
      </Text>
    </Box>
  );
}

function Router() {
  const { state, setScrollControls } = useStore();
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  const scrollRef = useRef<ScrollViewRef>(null);

  // Expose the ScrollView ref via the store so screens (e.g. ChannelView)
  // can read offset / trigger pagination without owning the ref themselves.
  useEffect(() => {
    setScrollControls({
      getOffset: () => scrollRef.current?.getScrollOffset() ?? 0,
      getBottom: () => scrollRef.current?.getBottomOffset() ?? 0,
      scrollTo: (n: number) => scrollRef.current?.scrollTo(n),
    });
  }, [setScrollControls]);
  const isHome = state.screen.name === "home";
  // channel-view is excluded: it uses a custom useInput handler (not ink-text-input)
  // and needs mouse tracking enabled for wheel scrolling.
  const hasTextInput = ["search", "home", "auth", "channel-create", "profile-setup", "chat-list", "chat-view"].includes(state.screen.name);

  const termWidth = stdout?.columns ?? 80;
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

  // Scroll behavior:
  //   - channel-view: stick to the bottom (latest message) on mount and
  //     whenever a NEW message is appended (live WS arrival or our own
  //     publish). We key the effect on the LAST message's id rather than
  //     the array length so that prepending older history (scroll-up
  //     pagination) does NOT re-trigger the auto-scroll-to-bottom — that
  //     used to fight ChannelView's re-anchor logic and make the view
  //     snap back to the bottom right after fetching older messages.
  //   - everything else: scroll to top on screen change.
  const isChannelView = state.screen.name === "channel-view";
  const lastMessageId =
    state.channelView.messages[state.channelView.messages.length - 1]?.id ?? null;
  useEffect(() => {
    if (isChannelView) {
      // Defer one tick so ink has a chance to lay out the new content
      // before we measure the bottom offset.
      const t = setTimeout(() => {
        const bottom = scrollRef.current?.getBottomOffset() ?? 0;
        scrollRef.current?.scrollTo(bottom);
      }, 0);
      return () => clearTimeout(t);
    }
    scrollRef.current?.scrollToTop();
  }, [state.screen.name, isChannelView, lastMessageId]);

  // Disable mouse tracking on text-input screens
  useEffect(() => {
    if (!stdout) return;
    stdout.write(hasTextInput ? DISABLE_MOUSE : ENABLE_MOUSE);
  }, [hasTextInput, stdout]);

  // Mouse wheel — scroll GLOBAL viewport (channel-view handles its own).
  const isChannelViewScreen = state.screen.name === "channel-view";
  useEffect(() => {
    if (!stdin || hasTextInput || isChannelViewScreen) return;
    const onData = (data: Buffer) => {
      const str = data.toString();
      const matches = str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g);
      for (const match of matches) {
        const button = parseInt(match[1]!, 10);
        if (!scrollRef.current) continue;
        const offset = scrollRef.current.getScrollOffset();
        const bottom = scrollRef.current.getBottomOffset();
        if ((button & 0x43) === 0x40) {
          scrollRef.current.scrollTo(Math.max(0, offset - 3));
        } else if ((button & 0x43) === 0x41) {
          scrollRef.current.scrollTo(Math.min(bottom, offset + 3));
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin, hasTextInput, isChannelViewScreen]);

  // Arrow keys: scroll the GLOBAL viewport (not for channel-view, which
  // has its own internal ScrollView and handles its own keys).
  useInput((_input, key) => {
    if (state.screen.name === "channel-view") return;
    if (!scrollRef.current) return;
    const offset = scrollRef.current.getScrollOffset();
    const bottom = scrollRef.current.getBottomOffset();
    if (key.downArrow && offset < bottom) scrollRef.current.scrollTo(offset + 1);
    if (key.upArrow && offset > 0) scrollRef.current.scrollTo(offset - 1);
    if (key.pageDown) scrollRef.current.scrollTo(Math.min(bottom, offset + 10));
    if (key.pageUp) scrollRef.current.scrollTo(Math.max(0, offset - 10));
  });

  return (
    <Box flexDirection="column">
      {/* Channel-view has its own scroll — render outside the global ScrollView */}
      {state.screen.name === "channel-view" ? (
        <Box flexDirection="column" height={termHeight}>
          <SubPageHeader screen={state.screen} termWidth={termWidth} />
          <ChannelView
            key={`cv-${state.screen.channelName}`}
            channelName={state.screen.channelName}
            termHeight={termHeight - 2}
            termWidth={termWidth}
          />
        </Box>
      ) : (
        <ScrollView ref={scrollRef} height={termHeight}>
          {isHome ? (
            <Logo key="logo" />
          ) : (
            <SubPageHeader screen={state.screen} termWidth={termWidth} />
          )}
          {state.screen.name === "home" && <Home key="home" />}
          {state.screen.name === "search" && <Search key="search" />}
          {state.screen.name === "channel-list" && <ChannelList key="channel-list" />}
          {state.screen.name === "channel-create" && <CreateChannel key="channel-create" />}
          {state.screen.name === "auth" && <Auth key="auth" />}
          {state.screen.name === "settings" && <Settings key="settings" />}
          {state.screen.name === "profile-setup" && <ProfileSetup key="profile-setup" />}
          {state.screen.name === "chat-list" && <ChatList key="chat-list" />}
          {state.screen.name === "chat-view" && <ChatView key={`dv-${state.screen.chatId}`} chatId={state.screen.chatId} />}
        </ScrollView>
      )}
    </Box>
  );
}

function OnlinePing() {
  useEffect(() => {
    if (!isLoggedIn()) return;
    const auth = getAuth();
    if (!auth) return;
    const fp = auth.fingerprint;

    pingOnline(fp).catch(() => {});
    const interval = setInterval(() => {
      pingOnline(fp).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return null;
}

export function App() {
  return (
    <StoreProvider>
      <OnlinePing />
      <Router />
    </StoreProvider>
  );
}

export default App;
