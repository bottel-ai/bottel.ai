import React from "react";
import { Box, Text } from "ink";
import { colors } from "./cli_app_theme.js";

export function Cursor({ active }: { active: boolean }) {
  return <Box width={3}><Text color={active ? colors.primary : undefined}>{active ? "❯ " : "  "}</Text></Box>;
}
export function HelpFooter({ text }: { text: string }) {
  return <Box marginTop={1}><Text dimColor>{text}</Text></Box>;
}
export function Separator({ width = 50 }: { width?: number }) {
  return <Box marginBottom={1}><Text dimColor>{"─".repeat(width)}</Text></Box>;
}
