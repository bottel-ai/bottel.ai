import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";

const MENU_ITEMS = [
  { label: "About", description: "About bottel.ai" },
  { label: "Clear cache", description: "Clear cached data" },
  { label: "Back", description: "Return to home" },
];

export function Settings() {
  const { state, dispatch, goBack } = useStore();
  const { selectedIndex } = state.settings;
  const [message, setMessage] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_SETTINGS", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
      setMessage(null);
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_SETTINGS", state: { selectedIndex: Math.min(MENU_ITEMS.length - 1, selectedIndex + 1) } });
      setMessage(null);
    }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      switch (item?.label) {
        case "About":
          setMessage("about");
          break;
        case "Clear cache":
          setMessage("Cache cleared successfully.");
          break;
        case "Back":
          goBack();
          break;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>Home &gt; Settings</Text>

      <Box borderStyle="single" borderColor="#5f27cd" paddingX={2} marginBottom={1}>
        <Text bold color="#48dbfb">Settings</Text>
      </Box>

      <Box flexDirection="column">
        {MENU_ITEMS.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={item.label}>
              <Text color={isSelected ? "#48dbfb" : undefined}>
                {isSelected ? "\u276f " : "  "}
              </Text>
              <Text bold={isSelected} color={isSelected ? "#48dbfb" : undefined}>
                {item.label.padEnd(18)}
              </Text>
              <Text dimColor>{item.description}</Text>
            </Box>
          );
        })}
      </Box>

      {message && message !== "about" && (
        <Box marginTop={1} paddingLeft={2}>
          <Text color="#2ed573">{message}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc back · ↑↓ nav · Enter select</Text>
      </Box>

      {message === "about" && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="#5f27cd" paddingX={2} paddingY={1}>
          <Text bold color="#48dbfb">bottel.ai</Text>
          <Text dimColor>The Bot CLI Internet Portal</Text>
          <Text> </Text>
          <Box gap={2}><Text dimColor>Version:</Text><Text>0.1.0</Text></Box>
          <Box gap={2}><Text dimColor>Runtime:</Text><Text>Node.js {process.version}</Text></Box>
          <Box gap={2}><Text dimColor>Platform:</Text><Text>{process.platform} ({process.arch})</Text></Box>
          <Text> </Text>
          <Text color="#54a0ff">The Bot CLI Internet Portal — for CLI App Discovery</Text>
        </Box>
      )}
    </Box>
  );
}
