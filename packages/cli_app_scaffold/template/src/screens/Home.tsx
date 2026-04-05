import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Cursor, HelpFooter } from "../cli_app_components.js";

const MENU = [
  { label: "Home", value: "home", desc: "Main screen" },
  { label: "Example", value: "example", desc: "Example screen" },
  { label: "Exit", value: "exit", desc: "Quit" },
];

export function Home() {
  const { navigate } = useStore();
  const { exit } = useApp();
  const [idx, setIdx] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setIdx(i => Math.min(MENU.length - 1, i + 1));
    if (key.return) {
      const item = MENU[idx]!;
      if (item.value === "exit") exit();
      else if (item.value !== "home") navigate({ name: item.value } as any);
    }
    if (_input === "q") exit();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>{"{{APP_NAME}}"}</Text>
      </Box>
      {MENU.map((item, i) => (
        <Box key={item.value}>
          <Cursor active={i === idx} />
          <Box width={16}><Text bold={i === idx} color={i === idx ? colors.primary : undefined}>{item.label}</Text></Box>
          <Text dimColor>{item.desc}</Text>
        </Box>
      ))}
      <HelpFooter text="↑↓ nav · Enter select · q quit" />
    </Box>
  );
}
