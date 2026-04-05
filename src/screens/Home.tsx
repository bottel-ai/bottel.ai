import { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { HelpFooter } from "../cli_app_components.js";

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

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const selectedIndex = state.home.selectedIndex;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(true);

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
  });

  return (
    <Box flexDirection="column" paddingX={1}>
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

      <HelpFooter text="/ search · ↑↓ nav · Enter select · q quit" />
    </Box>
  );
}
