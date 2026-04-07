import React, { useRef, useState, useEffect } from "react";
import { Box, Text, useInput, useStdout, useStdin } from "ink";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { Logo } from "./components.js";
import { StoreProvider, useStore } from "./state.js";
import { Home } from "./screens/Home.js";
import { Search } from "./screens/Search.js";
import { AgentDetail } from "./screens/AgentDetail.js";
import { Installed } from "./screens/Installed.js";
import { Settings } from "./screens/Settings.js";
import { Auth } from "./screens/Auth.js";
import { Submit } from "./screens/Submit.js";
import { MyApps } from "./screens/MyApps.js";
import { Trending } from "./screens/Trending.js";
import { ChatList } from "./screens/ChatList.js";
import { ChatView } from "./screens/ChatView.js";
import { ProfileSetup } from "./screens/ProfileSetup.js";
import { Social } from "./screens/Social.js";
import { PostDetail } from "./screens/PostDetail.js";
import { BotProfile } from "./screens/BotProfile.js";
import { isLoggedIn, getAuth } from "./lib/auth.js";
import { pingOnline } from "./lib/api.js";

const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

function Router() {
  const { state, dispatch } = useStore();
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  const scrollRef = useRef<ScrollViewRef>(null);
  const isHome = state.screen.name === "home";
  const isSearch = state.screen.name === "search";
  const hasTextInput = ["search", "submit", "home", "auth", "my-apps", "chat-view", "chat-list", "profile-setup", "social", "post-detail"].includes(state.screen.name);

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

  // Disable mouse tracking on search screen
  useEffect(() => {
    if (!stdout) return;
    stdout.write(hasTextInput ? DISABLE_MOUSE : ENABLE_MOUSE);
  }, [hasTextInput, stdout]);

  // Mouse wheel — scroll viewport only (no cursor movement)
  useEffect(() => {
    if (!stdin || hasTextInput) return;
    const onData = (data: Buffer) => {
      const str = data.toString();
      const matches = str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g);
      for (const match of matches) {
        const button = parseInt(match[1]!, 10);
        if (!scrollRef.current) continue;
        const offset = scrollRef.current.getScrollOffset();
        const bottom = scrollRef.current.getBottomOffset();
        if ((button & 0x43) === 0x40) {
          // Wheel up
          scrollRef.current.scrollTo(Math.max(0, offset - 3));
        } else if ((button & 0x43) === 0x41) {
          // Wheel down
          scrollRef.current.scrollTo(Math.min(bottom, offset + 3));
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin, hasTextInput]);

  // Arrow keys: scroll viewport 1 line when cursor moves
  // PageUp/PageDown: jump 10 lines
  useInput((_input, key) => {
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
      <ScrollView ref={scrollRef} height={termHeight}>
        {isHome && <Logo key="logo" />}
        {!isHome && !isSearch && (
          <Box key="mini-logo" paddingX={1} marginBottom={1}>
            {"bottel.ai".split("").map((ch, i) => (
              <Text key={`ml-${i}`} bold color={["#ff6b6b", "#feca57", "#54a0ff"][i % 3]}>{ch}</Text>
            ))}
          </Box>
        )}
        {isHome && <Home key="home" />}
        {isSearch && <Search key="search" />}
        {state.screen.name === "agent-detail" && (
          <AgentDetail key={`detail-${state.screen.agentId}`} agentId={state.screen.agentId} />
        )}
        {state.screen.name === "installed" && <Installed key="installed" />}
        {state.screen.name === "settings" && <Settings key="settings" />}
        {state.screen.name === "auth" && <Auth key="auth" />}
        {state.screen.name === "submit" && <Submit key="submit" />}
        {state.screen.name === "my-apps" && <MyApps key="my-apps" />}
        {state.screen.name === "trending" && <Trending key="trending" />}
        {state.screen.name === "social" && <Social key="social" />}
        {state.screen.name === "chat-list" && <ChatList key="chat-list" />}
        {state.screen.name === "chat-view" && <ChatView key={`chat-${state.screen.chatId}`} chatId={state.screen.chatId} />}
        {state.screen.name === "post-detail" && <PostDetail key={`post-${state.screen.postId}`} postId={state.screen.postId} />}
        {state.screen.name === "bot-profile" && <BotProfile key={`bp-${state.screen.fingerprint}`} fingerprint={state.screen.fingerprint} />}
        {state.screen.name === "profile-setup" && <ProfileSetup key="profile-setup" />}
      </ScrollView>
    </Box>
  );
}

function OnlinePing() {
  useEffect(() => {
    if (!isLoggedIn()) return;
    const auth = getAuth();
    if (!auth) return;
    const fp = auth.fingerprint;

    // Ping immediately on start
    pingOnline(fp).catch(() => {});

    // Ping every 60 seconds
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
