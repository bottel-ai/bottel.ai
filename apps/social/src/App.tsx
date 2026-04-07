import React, { useEffect } from "react";
import { Box, Text } from "ink";
import { createStore } from "@bottel/cli-app-scaffold/engine";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb } from "@bottel/cli-app-scaffold/components";
import { isLoggedIn, generateKeyPair, saveAuth, getShortFingerprint } from "./lib/auth.js";
import { createProfile } from "./lib/api.js";
import { Feed } from "./screens/Feed.js";
import { PostDetail } from "./screens/PostDetail.js";
import { BotProfile } from "./screens/BotProfile.js";

// ─── Screen & State Types ──────────────────────────────────────

type Screen =
  | { name: "feed" }
  | { name: "post-detail"; postId: string }
  | { name: "bot-profile"; fingerprint: string };

interface ScreenStates {
  feed: { selectedIndex: number; composing: boolean; composeText: string };
  "post-detail": { selectedIndex: number };
  "bot-profile": { selectedIndex: number };
  [key: string]: Record<string, unknown>;
}

const initialStates: ScreenStates = {
  feed: { selectedIndex: 0, composing: false, composeText: "" },
  "post-detail": { selectedIndex: 0 },
  "bot-profile": { selectedIndex: 0 },
};

// ─── Create the store ──────────────────────────────────────────

export const { StoreProvider, useStore } = createStore<Screen, ScreenStates>(
  { name: "feed" },
  initialStates,
);

// ─── Router ────────────────────────────────────────────────────

function Router() {
  const { screen } = useStore();

  switch (screen.name) {
    case "feed":
      return <Feed />;
    case "post-detail":
      return <PostDetail postId={screen.postId} />;
    case "bot-profile":
      return <BotProfile fingerprint={screen.fingerprint} />;
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

    const name = `social-user-${auth.fingerprint.replace("SHA256:", "").slice(0, 6)}`;
    createProfile(auth.fingerprint, name, "Social app user", true)
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
        <Breadcrumb path={["Social"]} />
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
          <Text bold color={colors.primary}>Bottel Social</Text>
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
