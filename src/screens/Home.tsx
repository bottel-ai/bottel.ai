import { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Autocomplete, HelpFooter, type AutocompleteItem } from "../cli_app_components.js";

const MENU_ITEMS = [
  "Search", "Trending", "Submit", "My Apps", "Auth", "Installed", "Settings",
];

const MENU_MAP: Record<string, string> = {
  "Search": "search",
  "Trending": "trending",
  "Submit": "submit",
  "My Apps": "my-apps",
  "Auth": "auth",
  "Installed": "installed",
  "Settings": "settings",
};

const MAX_SUGGESTIONS = 5;

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const selectedIndex = state.home.selectedIndex;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(true);
  const [apps, setApps] = useState<App[]>([]);

  // Fetch suggestions as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setApps([]);
      return;
    }
    let cancelled = false;
    getApps(searchQuery.trim())
      .then((results) => {
        if (!cancelled) {
          setApps(results.slice(0, MAX_SUGGESTIONS));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchQuery]);

  useInput((input, key) => {
    if (input === "q" && !searchFocused) { exit(); return; }

    if (!searchFocused) {
      // Menu navigation
      if (key.upArrow) {
        if (selectedIndex === 0) setSearchFocused(true);
        else dispatch({ type: "UPDATE_HOME", state: { selectedIndex: selectedIndex - 1 } });
        return;
      }
      if (key.downArrow) {
        dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(MENU_ITEMS.length - 1, selectedIndex + 1) } });
        return;
      }
      if (key.return) {
        const item = MENU_ITEMS[selectedIndex]!;
        const screen = MENU_MAP[item];
        if (screen) navigate({ name: screen } as any);
        return;
      }
      if (input === "/") { setSearchFocused(true); return; }
    }
  });

  const handleQueryChange = (value: string) => {
    setSearchQuery(value);
  };

  const suggestions: AutocompleteItem[] = apps.map(a => ({
    id: a.id,
    label: a.name,
    detail: `${a.installs.toLocaleString()} installs`,
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Search box */}
      <Box justifyContent="center" marginBottom={0}>
        <Autocomplete
          value={searchQuery}
          onChange={handleQueryChange}
          placeholder="Search CLI apps and websites..."
          suggestions={suggestions}
          onSubmit={(q) => {
            dispatch({ type: "UPDATE_SEARCH", state: { query: q, inputFocused: false } });
            navigate({ name: "search" });
          }}
          onSelect={(item) => navigate({ name: "agent-detail", agentId: item.id })}
          onExit={() => {
            setSearchFocused(false);
            dispatch({ type: "UPDATE_HOME", state: { selectedIndex: 0 } });
          }}
          focused={searchFocused}
          width={50}
        />
      </Box>

      {/* Menu links */}
      <Box justifyContent="center" marginTop={1} marginBottom={1} gap={2}>
        {MENU_ITEMS.map((item, i) => {
          const isActive = !searchFocused && selectedIndex === i;
          return (
            <Text key={item} color={isActive ? colors.primary : undefined} bold={isActive} underline={isActive}>
              {item}
            </Text>
          );
        })}
      </Box>

      <HelpFooter text="/ search · ↑↓ nav · Enter select · q quit" />
    </Box>
  );
}
