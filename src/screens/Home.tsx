import { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { type App, getApps } from "../lib/api.js";
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

const MAX_SUGGESTIONS = 5;

export function Home() {
  const { state, dispatch, navigate } = useStore();
  const { exit } = useApp();
  const selectedIndex = state.home.selectedIndex;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(true);
  const [suggestions, setSuggestions] = useState<App[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch suggestions as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let cancelled = false;
    getApps(searchQuery.trim())
      .then((apps) => {
        if (!cancelled) {
          setSuggestions(apps.slice(0, MAX_SUGGESTIONS));
          setShowSuggestions(true);
          setSuggestionIndex(-1);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchQuery]);

  useInput((input, key) => {
    if (input === "q" && !searchFocused) { exit(); return; }

    if (searchFocused) {
      if (key.return) {
        if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
          // Select suggestion → go to detail
          navigate({ name: "agent-detail", agentId: suggestions[suggestionIndex].id });
        } else if (searchQuery.trim()) {
          // Submit search → go to search results
          dispatch({ type: "UPDATE_SEARCH", state: { query: searchQuery, inputFocused: false } });
          navigate({ name: "search" });
        }
        return;
      }
      if (key.downArrow) {
        if (showSuggestions && suggestions.length > 0) {
          // Navigate into suggestions
          if (suggestionIndex < suggestions.length - 1) {
            setSuggestionIndex(suggestionIndex + 1);
          } else {
            // Past last suggestion → go to menu
            setShowSuggestions(false);
            setSuggestionIndex(-1);
            setSearchFocused(false);
            dispatch({ type: "UPDATE_HOME", state: { selectedIndex: 0 } });
          }
        } else {
          setSearchFocused(false);
          dispatch({ type: "UPDATE_HOME", state: { selectedIndex: 0 } });
        }
        return;
      }
      if (key.upArrow) {
        if (suggestionIndex > 0) {
          setSuggestionIndex(suggestionIndex - 1);
        } else if (suggestionIndex === 0) {
          setSuggestionIndex(-1); // back to input
        }
        return;
      }
      if (key.escape) {
        if (showSuggestions) {
          setShowSuggestions(false);
          setSuggestionIndex(-1);
        } else if (searchQuery) {
          setSearchQuery("");
        }
        return;
      }
      return;
    }

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
  });

  const handleQueryChange = (value: string) => {
    setSearchQuery(value);
    setSuggestionIndex(-1);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Search box */}
      <Box justifyContent="center" marginBottom={0}>
        <Box borderStyle="round" borderColor={searchFocused ? colors.primary : colors.border} paddingX={2} width={50}>
          <Text color={searchFocused ? colors.primary : undefined}>🔍 </Text>
          <TextInput
            value={searchQuery}
            onChange={handleQueryChange}
            placeholder="Search CLI apps and websites..."
            focus={searchFocused}
          />
        </Box>
      </Box>

      {/* Autocomplete dropdown */}
      {searchFocused && showSuggestions && suggestions.length > 0 && (
        <Box justifyContent="center" marginBottom={0}>
          <Box flexDirection="column" width={50} paddingX={2}>
            {suggestions.map((app, i) => {
              const isActive = i === suggestionIndex;
              return (
                <Box key={app.id}>
                  <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                    {isActive ? "❯ " : "  "}{app.name}
                  </Text>
                  <Text dimColor>  {app.installs.toLocaleString()} installs</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

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
