import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

const MENU_ITEMS = [
  { label: "About", description: "About bottel.ai" },
  { label: "Clear cache", description: "Clear cached data" },
  { label: "Back", description: "Return to home" },
];

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      setMessage(null);
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(MENU_ITEMS.length - 1, i + 1));
      setMessage(null);
    }

    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      switch (item.label) {
        case "About":
          setMessage("bottel.ai v0.1.0 -- The App Store for AI Agents");
          break;
        case "Clear cache":
          setMessage("Cache cleared");
          break;
        case "Back":
          onBack();
          break;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Settings
        </Text>
        <Text dimColor>{"   "}Esc: back | Enter: select</Text>
      </Box>

      {/* Menu */}
      <Box flexDirection="column">
        {MENU_ITEMS.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={item.label}>
              <Text>{isSelected ? "> " : "  "}</Text>
              <Text
                bold={isSelected}
                color={isSelected ? "#48dbfb" : undefined}
              >
                {item.label.padEnd(18)}
              </Text>
              <Text dimColor>{item.description}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Message display */}
      {message && (
        <Box marginTop={1} paddingLeft={2}>
          <Text color="#2ed573">{message}</Text>
        </Box>
      )}
    </Box>
  );
}
