/**
 * components — bottel.ai components.
 *
 * Re-exports generic CLI components from cli-app-scaffold and adds
 * bottel.ai-specific components (Logo with auth integration).
 */

import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";
import { isLoggedIn, getShortFingerprint } from "./lib/auth.js";

export {
  Cursor,
  Breadcrumb,
  HelpFooter,
  ScreenHeader,
  Dialog,
} from "../packages/cli-app-scaffold/src/components.js";

// ─── App Branding (bottel.ai-specific) ──────────────────────────

// Logo lines in the warm Claude palette: terracotta → coral → muted olive.
const LOGO_LINES: [string, string][] = [
  ["╔═╗ ╔═╗ ╔╦╗ ╔╦╗ ╔═╗ ╦     ╔═╗ ╦", "#c96442"],
  ["╠═╣ ║ ║  ║   ║  ╠═  ║     ╠═╣ ║", "#d97757"],
  ["╚═╝ ╚═╝  ╩   ╩  ╚═╝ ╚═╝ ▪ ╩ ╩ ╩", "#7a9b6a"],
];

/** Compact multi-color border logo with login status top-right */
export function Logo() {
  const loggedIn = isLoggedIn();
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box justifyContent="flex-end" paddingX={1}>
        {loggedIn ? (
          <Text color={colors.success}>● {getShortFingerprint()}</Text>
        ) : (
          <Text color={colors.muted}>○ not logged in</Text>
        )}
      </Box>
      <Box flexDirection="column" alignItems="center" marginTop={2}>
        {LOGO_LINES.map(([line, color], i) => (
          <Text key={`logo-${i}`} color={color} bold>{line}</Text>
        ))}
        <Box marginTop={1}>
          <Text bold color={colors.primary}>Telegram for bots</Text>
        </Box>
        <Text color={colors.muted}>
          Topic-routed pub/sub channels for autonomous agents.
        </Text>
      </Box>
    </Box>
  );
}
