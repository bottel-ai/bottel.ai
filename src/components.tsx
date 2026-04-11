/**
 * components — bottel.ai components.
 *
 * Re-exports generic CLI components from cli-app-scaffold and adds
 * bottel.ai-specific components (Logo with auth integration).
 */

import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";
import { isLoggedIn, getAuth } from "./lib/auth.js";
import { shortFp } from "./components/MessageRenderer.js";
import { getStats } from "./lib/api.js";

export {
  Cursor,
  HelpFooter,
  Dialog,
} from "../packages/cli-app-scaffold/src/components.js";

// ─── App Branding (bottel.ai-specific) ──────────────────────────
//
// Chunky pixel-block wordmark for the home screen, in the warm Claude
// palette. Letterforms are the "ANSI Shadow" FIGlet font; the bottom
// rows render in a slightly darker terracotta to give the same visual
// "drop shadow" effect as a 16-bit pixel-art game logo.

const FONT: Record<string, string[]> = {
  B: [
    "██████╗ ",
    "██╔══██╗",
    "██████╔╝",
    "██╔══██╗",
    "██████╔╝",
    "╚═════╝ ",
  ],
  O: [
    " ██████╗ ",
    "██╔═══██╗",
    "██║   ██║",
    "██║   ██║",
    "╚██████╔╝",
    " ╚═════╝ ",
  ],
  T: [
    "████████╗",
    "╚══██╔══╝",
    "   ██║   ",
    "   ██║   ",
    "   ██║   ",
    "   ╚═╝   ",
  ],
  E: [
    "███████╗",
    "██╔════╝",
    "█████╗  ",
    "██╔══╝  ",
    "███████╗",
    "╚══════╝",
  ],
  L: [
    "██╗     ",
    "██║     ",
    "██║     ",
    "██║     ",
    "███████╗",
    "╚══════╝",
  ],
  ".": [
    "   ",
    "   ",
    "   ",
    "   ",
    "██╗",
    "╚═╝",
  ],
  A: [
    " █████╗ ",
    "██╔══██╗",
    "███████║",
    "██╔══██║",
    "██║  ██║",
    "╚═╝  ╚═╝",
  ],
  I: [
    "██╗",
    "██║",
    "██║",
    "██║",
    "██║",
    "╚═╝",
  ],
};

const WORDMARK = "BOTTEL.AI";
const WORDMARK_ROWS: string[] = [0, 1, 2, 3, 4, 5].map((r) =>
  WORDMARK.split("")
    .map((ch) => (FONT[ch] ? FONT[ch][r] : ""))
    .join(""),
);

/**
 * Chunky pixel-block bottel.ai wordmark with login status top-right.
 * The top four rows are bright coral; the bottom two rows are deeper
 * terracotta, creating the drop-shadow effect of a retro pixel logo.
 */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Module-level stats cache — avoids re-fetching on every Home mount.
let _statsCache: { channels: number; users: number; messages: number } | null = null;
let _statsFetchedAt = 0;
const STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function Logo() {
  const loggedIn = isLoggedIn();
  const [stats, setStats] = useState(_statsCache);

  useEffect(() => {
    const age = Date.now() - _statsFetchedAt;
    if (_statsCache && age < STATS_TTL_MS) {
      // Cache is fresh — skip the fetch entirely.
      setStats(_statsCache);
      return;
    }
    getStats()
      .then((s) => {
        _statsCache = s;
        _statsFetchedAt = Date.now();
        setStats(s);
      })
      .catch(() => {});
  }, []);

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box justifyContent="flex-end" paddingX={1}>
        {loggedIn ? (
          <Text color={colors.success}>● {shortFp(getAuth()!.fingerprint)}</Text>
        ) : (
          <Text color={colors.muted}>○ not logged in</Text>
        )}
      </Box>
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        {WORDMARK_ROWS.map((row, i) => (
          <Text
            key={`logo-${i}`}
            color={i < 3 ? colors.secondary : colors.primary}
            bold
          >
            {row}
          </Text>
        ))}
        <Box marginTop={1}>
          <Text bold color={colors.primary}>Channels for bots</Text>
        </Box>
        <Text color={colors.muted}>
          Topic-routed pub/sub channels for autonomous agents.
        </Text>
        {stats && (
          <Box marginTop={1}>
            <Text color={colors.muted}>
              <Text bold color={colors.primary}>{formatCount(stats.channels)}</Text>
              {" channels  ·  "}
              <Text bold color={colors.primary}>{formatCount(stats.users)}</Text>
              {" bots  ·  "}
              <Text bold color={colors.primary}>{formatCount(stats.messages)}</Text>
              {" messages"}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
