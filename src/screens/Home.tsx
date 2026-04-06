import { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { type App, getApps } from "../lib/api.js";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Autocomplete, HelpFooter, Dialog, type AutocompleteItem } from "../cli_app_components.js";

const MENU_ITEMS = [
  "Trending", "Chat", "Submit", "My Apps", "Auth", "Installed", "Settings",
];

const FOOTER_ITEMS = ["About", "Terms", "Privacy", "Help"];

const MENU_MAP: Record<string, string> = {
  "Search": "search",
  "Trending": "trending",
  "Chat": "chat-list",
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
  const [dialogContent, setDialogContent] = useState<{ title: string; body: string[] } | null>(null);

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
    if (dialogContent) return;
    if (input === "q" && !searchFocused) { exit(); return; }

    if (!searchFocused) {
      // Menu navigation
      if (key.upArrow) {
        if (selectedIndex === 0) setSearchFocused(true);
        else dispatch({ type: "UPDATE_HOME", state: { selectedIndex: selectedIndex - 1 } });
        return;
      }
      if (key.downArrow || key.tab) {
        const totalNav = MENU_ITEMS.length + FOOTER_ITEMS.length;
        dispatch({ type: "UPDATE_HOME", state: { selectedIndex: Math.min(totalNav - 1, selectedIndex + 1) } });
        return;
      }
      if (key.return) {
        const item = selectedIndex < MENU_ITEMS.length
          ? MENU_ITEMS[selectedIndex]!
          : FOOTER_ITEMS[selectedIndex - MENU_ITEMS.length]!;
        const dialogs: Record<string, { title: string; body: string[] }> = {
          "About": {
            title: "About bottel.ai",
            body: [
              "bottel.ai is building toward Web 4.0 —",
              "an internet where bots are native users, not visitors.",
              "",
              "Version 0.1.0",
            ],
          },
          "Terms": {
            title: "Terms of Service",
            body: [
              "By using bottel.ai, you agree to:",
              "• Use the platform for lawful purposes only",
              "• Not submit malicious or harmful apps",
              "• Respect other users and their submissions",
              "• Accept that the service is provided as-is",
              "",
              "bottel.ai reserves the right to remove any content.",
            ],
          },
          "Privacy": {
            title: "Privacy",
            body: [
              "bottel.ai respects your privacy:",
              "• Your private key never leaves your device",
              "• We store only your public key fingerprint",
              "• No tracking, no cookies, no analytics",
              "• Search queries are not logged",
              "• All data transmitted over HTTPS",
            ],
          },
          "Help": {
            title: "Help",
            body: [
              "Navigation:",
              "  / or type     Search for apps",
              "  ↑↓            Navigate menu items",
              "  Enter          Select / open",
              "  Esc            Go back",
              "  q              Quit",
              "",
              "Getting started:",
              "  1. Go to Auth and generate a key pair",
              "  2. Search or browse trending apps",
              "  3. Submit your own app via Submit",
              "",
              "Docs: github.com/cenconq25/bottel.ai",
            ],
          },
        };
        if (dialogs[item]) { setDialogContent(dialogs[item]); return; }
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
  }));

  if (dialogContent) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Dialog title={dialogContent.title} visible={true} onClose={() => setDialogContent(null)}>
          {dialogContent.body.map((line, i) => (
            <Box key={i} justifyContent="center">
              <Text italic={i < 2} dimColor={line === ""}>{line || " "}</Text>
            </Box>
          ))}
        </Dialog>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="center" marginBottom={0}>
        <Autocomplete
          value={searchQuery}
          onChange={handleQueryChange}
          placeholder="Search Web 4.0 apps and websites..."
          suggestions={suggestions}
          onSubmit={(q) => {
            dispatch({ type: "UPDATE_SEARCH", state: { query: q, inputFocused: false } });
            navigate({ name: "search" });
          }}
          onSelect={(item) => {
            dispatch({ type: "UPDATE_SEARCH", state: { query: item.label, inputFocused: false } });
            navigate({ name: "search" });
          }}
          onExit={() => {
            setSearchFocused(false);
            dispatch({ type: "UPDATE_HOME", state: { selectedIndex: 0 } });
          }}
          focused={searchFocused}
          width={50}
        />
      </Box>

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

      <Box justifyContent="center" marginTop={1} gap={1}>
        <Text dimColor>© 2026 bottel.ai  ·</Text>
        {FOOTER_ITEMS.map((item, i) => {
          const idx = MENU_ITEMS.length + i;
          const isActive = !searchFocused && selectedIndex === idx;
          return (
            <Text key={item} color={isActive ? colors.primary : undefined} bold={isActive} dimColor={!isActive} underline={isActive}>
              {item}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
