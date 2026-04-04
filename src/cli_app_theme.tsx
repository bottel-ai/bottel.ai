import React from "react";
import { Box, Text } from "ink";

// ─── Colors ─────────────────────────────────────────────────────

export const colors = {
  primary: "#48dbfb",
  secondary: "#54a0ff",
  accent: "#ff9ff3",
  warning: "#feca57",
  success: "#2ed573",
  error: "#ff6b6b",
  border: "#5f27cd",
  orange: "#ff9f43",
  dimBorder: "gray",
} as const;

// ─── Column Widths ──────────────────────────────────────────────

export const columns = {
  cursor: 3,
  rank: 4,
  name: 22,
  author: 16,
  rating: 10,
  installs: 16,
  version: 10,
  category: 18,
} as const;

// ─── Box Styles ─────────────────────────────────────────────────

export const boxStyle = {
  header: { borderStyle: "double" as const, borderColor: colors.border },
  card: { borderStyle: "round" as const },
  cardActive: { borderStyle: "round" as const, borderColor: colors.primary },
  section: { borderStyle: "single" as const, borderColor: colors.border },
  footer: { borderStyle: "single" as const, borderColor: colors.dimBorder },
} as const;

// ─── Text Formatters ────────────────────────────────────────────

export function formatStars(rating: number): string {
  return "\u2605".repeat(Math.round(rating));
}

export function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── Reusable Components ────────────────────────────────────────

// Breadcrumb: Home › Browse › Development
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

// Rating display: ★★★★★ 4.8
export function Rating({ value, showNumber = true }: { value: number; showNumber?: boolean }) {
  return (
    <Box width={columns.rating}>
      <Text color={colors.warning}>
        {formatStars(value)}{showNumber ? ` ${value.toFixed(1)}` : ""}
      </Text>
    </Box>
  );
}

// Install count display
export function InstallCount({ count }: { count: number }) {
  return (
    <Box width={columns.installs}>
      <Text dimColor>{formatInstalls(count)} installs</Text>
    </Box>
  );
}

// Verified badge
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return <Text color={colors.success}> {"\u2713"}</Text>;
}

// Cursor indicator
export function Cursor({ active }: { active: boolean }) {
  return (
    <Box width={columns.cursor}>
      <Text color={active ? colors.primary : undefined}>
        {active ? "\u276f " : "  "}
      </Text>
    </Box>
  );
}

// Section separator line
export function Separator({ width = 60 }: { width?: number }) {
  return (
    <Box marginBottom={1}>
      <Text dimColor>{"\u2500".repeat(width)}</Text>
    </Box>
  );
}

// Help footer
export function HelpFooter({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

// Screen header with border
export function ScreenHeader({ title, style = "section" }: { title: string; style?: "header" | "section" }) {
  const bs = style === "header" ? boxStyle.header : boxStyle.section;
  return (
    <Box {...bs} paddingX={2} marginBottom={1}>
      <Text bold color={colors.primary}>{title}</Text>
    </Box>
  );
}
