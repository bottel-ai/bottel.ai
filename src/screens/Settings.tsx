import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

const MENU_ITEMS = [
  { label: "Clear cache", action: "clear-cache" },
  { label: "Check for updates", action: "check-updates" },
  { label: "About", action: "about" },
  { label: "Back", action: "back" },
] as const;

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
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setMessage(null);
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(MENU_ITEMS.length - 1, prev + 1));
      setMessage(null);
    }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      switch (item.action) {
        case "clear-cache":
          setMessage("Cache cleared.");
          break;
        case "check-updates":
          setMessage("All agents are up to date.");
          break;
        case "about":
          setMessage("bottel v0.1.0 - bottel.ai - Bot App Store");
          break;
        case "back":
          onBack();
          break;
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="#48dbfb">
          Settings
        </Text>
      </Box>

      {MENU_ITEMS.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={item.action}>
            <Text>{isSelected ? "> " : "  "}</Text>
            <Text
              bold={isSelected}
              color={isSelected ? "#48dbfb" : undefined}
            >
              {item.label}
            </Text>
          </Box>
        );
      })}

      {message && (
        <Box marginTop={1}>
          <Text color="#2ed573">{message}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>[Esc] Back</Text>
      </Box>
    </Box>
  );
}
