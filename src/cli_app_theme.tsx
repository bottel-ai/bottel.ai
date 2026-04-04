import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";

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

// ─── Accordion Layout ───────────────────────────────────────────

export interface AccordionSection {
  key: string;
  title: string;
  itemCount: number;
  render: (activeIndex: number) => React.ReactNode;
}

interface AccordionProps {
  sections: AccordionSection[];
  selectedIndex: number;
}

export function Accordion({ sections, selectedIndex }: AccordionProps) {
  // Decode flat selectedIndex into section + itemIndex
  let remaining = selectedIndex;
  let activeSection = 0;
  let activeItemIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    if (remaining < sections[i]!.itemCount) {
      activeSection = i;
      activeItemIndex = remaining;
      break;
    }
    remaining -= sections[i]!.itemCount;
  }

  return (
    <Box flexDirection="column">
      {sections.map((section, i) => {
        const isActive = i === activeSection;
        return (
          <Box key={`accordion-${section.key}`} flexDirection="column">
            <Box>
              <Text bold color={isActive ? colors.primary : undefined}>
                {isActive ? "\u25BC " : "\u25B6 "}{section.title}
              </Text>
              {!isActive && (
                <Text dimColor> ({section.itemCount})</Text>
              )}
            </Box>
            {isActive && (
              <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
                {section.render(activeItemIndex)}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

// Helper: get total items across all accordion sections
export function accordionTotalItems(sections: AccordionSection[]): number {
  return sections.reduce((sum, s) => sum + s.itemCount, 0);
}

// ─── Scroll List ────────────────────────────────────────────────
// Renders a list of items with virtual scrolling.
// Only shows items that fit in the terminal, scrolling to keep
// the focused item visible — like a browser page.

export function useTerminalHeight(): number {
  const { stdout } = useStdout();
  const [height, setHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setHeight(stdout.rows);
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  return height;
}

interface ScrollListProps {
  items: React.ReactNode[];
  focusedIndex: number;
  reservedLines?: number; // lines used by header/footer outside the list
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function ScrollList({ items, focusedIndex, reservedLines = 4, header, footer }: ScrollListProps) {
  const termHeight = useTerminalHeight();
  const maxVisible = Math.max(3, termHeight - reservedLines);

  // Calculate viewport offset to keep focused item visible
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    let newOffset = scrollOffset;
    // If focused is below viewport, scroll down
    if (focusedIndex >= newOffset + maxVisible) {
      newOffset = focusedIndex - maxVisible + 1;
    }
    // If focused is above viewport, scroll up
    if (focusedIndex < newOffset) {
      newOffset = focusedIndex;
    }
    // Clamp
    newOffset = Math.max(0, Math.min(newOffset, Math.max(0, items.length - maxVisible)));
    if (newOffset !== scrollOffset) {
      setScrollOffset(newOffset);
    }
  }, [focusedIndex, maxVisible, items.length]);

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxVisible);
  const showScrollUp = scrollOffset > 0;
  const showScrollDown = scrollOffset + maxVisible < items.length;

  return (
    <Box flexDirection="column">
      {header}
      {showScrollUp && (
        <Text dimColor>  ▲ {scrollOffset} more above</Text>
      )}
      {visibleItems}
      {showScrollDown && (
        <Text dimColor>  ▼ {items.length - scrollOffset - maxVisible} more below</Text>
      )}
      {footer}
    </Box>
  );
}

