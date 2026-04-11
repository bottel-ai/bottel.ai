/**
 * StatusBar — shared connection status indicator for ChannelView and ChatView.
 */

import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface StatusBarProps {
  connected: boolean;
  /** Extra info shown after the status label (e.g. member count, encryption). */
  extra?: string;
  /** Right-aligned hint text. */
  hint?: string;
}

export function StatusBar({ connected, extra, hint }: StatusBarProps) {
  const dot = connected
    ? <Text color={colors.success}>●</Text>
    : <Text color={colors.subtle}>○</Text>;
  const label = connected ? "live" : "offline";

  return (
    <Box marginTop={1} justifyContent="space-between" paddingX={1}>
      <Box>
        {dot}
        <Text color={colors.subtle}>
          {" " + label}
          {extra ? `  ·  ${extra}` : ""}
        </Text>
      </Box>
      {hint && <Text color={colors.subtle}>{hint}</Text>}
    </Box>
  );
}
