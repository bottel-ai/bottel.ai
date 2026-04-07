import React, { useEffect } from "react";
import { Box, Text } from "ink";
import { createStore } from "@bottel/cli-app-scaffold/engine";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter } from "@bottel/cli-app-scaffold/components";
import { isLoggedIn, generateKeyPair, saveAuth, getShortFingerprint } from "./lib/auth.js";
import { createProfile } from "./lib/api.js";
import { ChatList } from "./screens/ChatList.js";
import { ChatView } from "./screens/ChatView.js";

// ─── Screen & State Types ──────────────────────────────────────

type Screen =
  | { name: "chat-list" }
  | { name: "chat-view"; chatId: string };

interface ScreenStates {
  "chat-list": { selectedIndex: number };
  "chat-view": { inputText: string };
  [key: string]: Record<string, unknown>;
}

const initialStates: ScreenStates = {
  "chat-list": { selectedIndex: 0 },
  "chat-view": { inputText: "" },
};

// ─── Create the store ──────────────────────────────────────────

export const { StoreProvider, useStore } = createStore<Screen, ScreenStates>(
  { name: "chat-list" },
  initialStates,
);

// ─── Router ────────────────────────────────────────────────────

function Router() {
  const { screen } = useStore();

  switch (screen.name) {
    case "chat-list":
      return <ChatList />;
    case "chat-view":
      return <ChatView chatId={screen.chatId} />;
    default:
      return <Text color={colors.error}>Unknown screen</Text>;
  }
}

// ─── Auth Gate ─────────────────────────────────────────────────

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [status, setStatus] = React.useState("");

  useEffect(() => {
    if (isLoggedIn()) {
      setReady(true);
      return;
    }

    // Auto-generate identity on first run
    setStatus("Generating identity...");
    const auth = generateKeyPair();
    saveAuth(auth);
    setStatus("Registering profile...");

    const name = `chat-user-${auth.fingerprint.replace("SHA256:", "").slice(0, 6)}`;
    createProfile(auth.fingerprint, name, "Chat app user", true)
      .then(() => {
        setStatus("");
        setReady(true);
      })
      .catch(() => {
        // Profile may already exist, that's fine
        setStatus("");
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Chat"]} />
        <Text color={colors.warning}>{status || "Setting up..."}</Text>
      </Box>
    );
  }

  return <>{children}</>;
}

// ─── App ───────────────────────────────────────────────────────

export function App() {
  const loggedIn = isLoggedIn();
  const fp = loggedIn ? getShortFingerprint() : "";

  return (
    <StoreProvider>
      <Box flexDirection="column">
        {/* Status bar */}
        <Box justifyContent="space-between" paddingX={1} marginBottom={0}>
          <Text bold color={colors.primary}>Bottel Chat</Text>
          {loggedIn && <Text color={colors.success}>#{fp}</Text>}
        </Box>
        <Box paddingX={1}><Text dimColor>{"─".repeat(50)}</Text></Box>

        <AuthGate>
          <Router />
        </AuthGate>
      </Box>
    </StoreProvider>
  );
}
