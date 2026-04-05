/**
 * cli_app_components — Reusable UI components for CLI apps
 *
 * Terminal-specific React components built on ink. Designed for
 * any CLI app that needs navigation, lists, ratings, headers, etc.
 *
 * Depends on cli_app_theme for colors/formatters.
 */

import React from "react";
import { Box, Text } from "ink";
import { colors, columns, boxStyle, formatStars, formatInstalls } from "./cli_app_theme.js";
import { isLoggedIn, getShortFingerprint } from "./lib/auth.js";

// ─── Navigation ─────────────────────────────────────────────

/** Arrow cursor indicator for list items */
export function Cursor({ active }: { active: boolean }) {
  return (
    <Box width={columns.cursor}>
      <Text color={active ? colors.primary : undefined}>
        {active ? "\u276f " : "  "}
      </Text>
    </Box>
  );
}

/** Breadcrumb navigation trail: Home › Browse › Development */
export function Breadcrumb({ path }: { path: string[] }) {
  return (
    <Box marginBottom={1}>
      {path.map((item, i) => {
        const isLast = i === path.length - 1;
        return (
          <React.Fragment key={`bc-${i}`}>
            {i > 0 && <Text dimColor> {"\u203a"} </Text>}
            <Text color={isLast ? colors.primary : colors.secondary} bold={isLast}>
              {item}
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

/** Keyboard shortcut help text at screen bottom */
export function HelpFooter({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

// ─── Data Display ───────────────────────────────────────────

/** Star rating display: ★★★★★ 4.8 */
export function Rating({ value, showNumber = true }: { value: number; showNumber?: boolean }) {
  return (
    <Box width={columns.rating}>
      <Text color={colors.warning}>
        {formatStars(value)}{showNumber ? ` ${value.toFixed(1)}` : ""}
      </Text>
    </Box>
  );
}

/** Install count display with auto-formatting (45.2k) */
export function InstallCount({ count }: { count: number }) {
  return (
    <Box width={columns.installs}>
      <Text dimColor>{formatInstalls(count)} installs</Text>
    </Box>
  );
}

/** Green checkmark for verified items */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return <Text color={colors.success}> {"\u2713"}</Text>;
}

// ─── Layout ─────────────────────────────────────────────────

/** Horizontal separator line */
export function Separator({ width = 60 }: { width?: number }) {
  return (
    <Box marginBottom={1}>
      <Text dimColor>{"\u2500".repeat(width)}</Text>
    </Box>
  );
}

/** Bordered section header */
export function ScreenHeader({ title, style = "section" }: { title: string; style?: "header" | "section" }) {
  const bs = style === "header" ? boxStyle.header : boxStyle.section;
  return (
    <Box {...bs} paddingX={2} marginBottom={1}>
      <Text bold color={colors.primary}>{title}</Text>
    </Box>
  );
}

// ─── App Branding ───────────────────────────────────────────

const LOGO_LINES = [
  "  ██████╗   ██████╗  ████████╗████████╗███████╗██╗         █████╗ ██╗",
  "  ██╔══██╗ ██╔═══██╗ ╚══██╔══╝╚══██╔══╝██╔════╝██║        ██╔══██╗██║",
  "  ██████╔╝ ██║   ██║    ██║      ██║   █████╗  ██║        ███████║██║",
  "  ██╔══██╗ ██║   ██║    ██║      ██║   ██╔══╝  ██║        ██╔══██║██║",
  "  ██████╔╝ ╚██████╔╝    ██║      ██║   ███████╗███████╗██╗██║  ██║██║",
  "  ╚═════╝   ╚═════╝     ╚═╝      ╚═╝   ╚══════╝╚══════╝╚═╝╚═╝  ╚═╝╚═╝",
];

/** Full 3D ASCII art logo in single blue color */
export function Logo() {
  return (
    <Box flexDirection="column" alignItems="center" paddingTop={2} paddingBottom={1}>
      {LOGO_LINES.map((line, i) => (
        <Text key={`logo-${i}`} color={colors.primary} bold>{line}</Text>
      ))}
      <Box marginTop={1}>
        <Text bold color={colors.primary}>The Bot CLI Internet Portal</Text>
      </Box>
      <Text dimColor>Discover, install, and run CLI apps — built for bots.</Text>
    </Box>
  );
}

/** Compact one-line logo for small terminals */
export function CompactLogo() {
  return (
    <Box paddingX={1}>
      <Text bold color={colors.accent}>bottel.ai</Text>
      <Text dimColor> — </Text>
      <Text bold color={colors.primary}>The Bot CLI Internet Portal</Text>
    </Box>
  );
}

/** Status bar showing app name and auth status */
export function StatusBar() {
  const loggedIn = isLoggedIn();
  return (
    <Box borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1}>
      <Box flexGrow={1}>
        <Text bold color={colors.accent}>bottel.ai</Text>
      </Box>
      <Box>
        {loggedIn ? (
          <Text color={colors.success}>● {getShortFingerprint()}</Text>
        ) : (
          <Text dimColor>○ not logged in</Text>
        )}
      </Box>
    </Box>
  );
}
