import { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors, columns } from "../cli_app_theme.js";
import { Cursor, Rating, InstallCount, VerifiedBadge, HelpFooter } from "../cli_app_components.js";

const MENU_ITEMS = [
  "Search", "Submit", "My Apps", "Auth", "Installed", "Settings",
];

const MENU_MAP: Record<string, string> = {
  "Search": "search",
  "Submit": "submit",
  "My Apps": "my-apps",
  "Auth": "auth",
  "Installed": "installed",
  "Settings": "settings",
};

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const selectedIndex = state.home.selectedIndex;

  const [apps, setApps] = useState<App[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApps()
      .then((data) => { if (!cancelled) setApps(data); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const trendingAgents = apps.slice(0, 5);

  useInput((input, key) => {
    if (input === "q" && !searchFocused) { exit(); return; }

    if (searchFocused) {
      if (key.return && searchQuery.trim()) {
        dispatch({ type: "UPDATE_SEARCH", state: { query: searchQuery, inputFocused: false } });
        navigate({ name: "search" });
        return;
      }
      if (key.downArrow) {
        setSearchFocused(false);
        dispatch({ type: "UPDATE_HOME", state: { selectedIndex: 0 } });
        return;
      }
      return;
    }

    if (key.upArrow) {
      if (selectedIndex === 0) {
        setSearchFocused(true);
      } else {
        dispatch({ type: "UPDATE_HOME", state: { selectedIndex: selectedIndex - 1 } });
      }
      return;
    }

    if (key.downArrow) {
      const maxIdx = MENU_ITEMS.length + trendingAgents.length - 1;
      dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(maxIdx, selectedIndex + 1) } });
      return;
    }

    if (key.return) {
      if (selectedIndex < MENU_ITEMS.length) {
        const item = MENU_ITEMS[selectedIndex]!;
        const screen = MENU_MAP[item];
        if (screen) navigate({ name: screen } as any);
      } else {
        const agent = trendingAgents[selectedIndex - MENU_ITEMS.length];
        if (agent) navigate({ name: "agent-detail", agentId: agent.id });
      }
      return;
    }

    if (input === "/") { setSearchFocused(true); return; }
  });

  if (loading) {
    return <Box flexDirection="column" paddingX={1}><Text>Loading...</Text></Box>;
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">Failed to load: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Search box — centered, prominent */}
      <Box justifyContent="center" marginBottom={1}>
        <Box borderStyle="round" borderColor={searchFocused ? colors.primary : colors.border} paddingX={2} width={50}>
          <Text color={searchFocused ? colors.primary : undefined}>🔍 </Text>
          <TextInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search CLI apps and websites..."
            focus={searchFocused}
          />
        </Box>
      </Box>

      {/* Menu — horizontal links below search */}
      <Box justifyContent="center" marginBottom={1} gap={2}>
        {MENU_ITEMS.map((item, i) => {
          const isActive = !searchFocused && selectedIndex === i;
          return (
            <Text key={item} color={isActive ? colors.primary : undefined} bold={isActive} underline={isActive}>
              {item}
            </Text>
          );
        })}
      </Box>

      {/* Trending */}
      {trendingAgents.length > 0 && (
        <Box flexDirection="column">
          <Text bold dimColor>Trending</Text>
          <Box flexDirection="column" marginTop={1}>
            {trendingAgents.map((agent, i) => {
              const idx = MENU_ITEMS.length + i;
              const isActive = !searchFocused && selectedIndex === idx;
              return (
                <Box key={`trending-${agent.id}`}>
                  <Cursor active={isActive} />
                  <Box width={columns.rank}><Text dimColor>{i + 1}.</Text></Box>
                  <Box width={columns.name}><Text color={isActive ? colors.primary : undefined} bold={isActive}>{agent.name}</Text></Box>
                  <Rating value={agent.rating} />
                  <InstallCount count={agent.installs} />
                  <VerifiedBadge verified={agent.verified} />
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <HelpFooter text="/ search · ↑↓ nav · Enter select · q quit" />
    </Box>
  );
}
