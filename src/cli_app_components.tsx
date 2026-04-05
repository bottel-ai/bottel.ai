/**
 * cli_app_components — Reusable UI components for CLI apps
 *
 * Terminal-specific React components built on ink. Designed for
 * any CLI app that needs navigation, lists, headers, etc.
 *
 * Depends on cli_app_theme for colors/formatters.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { colors, columns, boxStyle, formatInstalls } from "./cli_app_theme.js";
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
    <Box marginTop={1} justifyContent="center">
      <Text dimColor>{text}</Text>
    </Box>
  );
}

// ─── Data Display ───────────────────────────────────────────


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

const LOGO_LINES: [string, string][] = [
  ["╔═╗ ╔═╗ ╔╦╗ ╔╦╗ ╔═╗ ╦     ╔═╗ ╦", "#ff6b6b"],
  ["╠═╣ ║ ║  ║   ║  ╠═  ║  ●  ╠═╣ ║", "#feca57"],
  ["╚═╝ ╚═╝  ╩   ╩  ╚═╝ ╚═╝   ╩ ╩ ╩", "#54a0ff"],
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
          <Text dimColor>○ not logged in</Text>
        )}
      </Box>
      <Box flexDirection="column" alignItems="center" marginTop={2}>
        {LOGO_LINES.map(([line, color], i) => (
          <Text key={`logo-${i}`} color={color} bold>{line}</Text>
        ))}
        <Box marginTop={1}>
          <Text bold color={colors.primary}>The Bot Native Internet</Text>
        </Box>
        <Text dimColor>Search apps and websites - built for bots.</Text>
      </Box>
    </Box>
  );
}

/** Compact one-line logo for small terminals */
export function CompactLogo() {
  return (
    <Box paddingX={1}>
      <Box>{"bottel.ai".split("").map((ch, i) => (
        <Text key={`cl-${i}`} bold color={[colors.error, colors.warning, colors.primary][i % 3]}>{ch}</Text>
      ))}</Box>
      <Text dimColor> — </Text>
      <Text bold color={colors.primary}>The Bot Native Internet</Text>
    </Box>
  );
}

/** Minimal status bar — no border */
export function StatusBar() {
  return null;
}

// ─── Autocomplete ──────────────────────────────────────────

/** Autocomplete search input with dropdown suggestions */
export interface AutocompleteItem {
  id: string;
  label: string;
  detail?: string;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onSelect: (item: AutocompleteItem) => void;
  onExit?: () => void;
  suggestions: AutocompleteItem[];
  placeholder?: string;
  width?: number;
  focused?: boolean;
}

export function Autocomplete({
  value,
  onChange,
  onSubmit,
  onSelect,
  onExit,
  suggestions,
  placeholder,
  width = 50,
  focused,
}: AutocompleteProps) {
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(true);

  // Reset suggestionIndex when value changes
  useEffect(() => {
    setSuggestionIndex(-1);
    setShowDropdown(true);
  }, [value]);

  useInput(
    (input, key) => {
      if (key.downArrow) {
        if (suggestions.length > 0 && showDropdown) {
          if (suggestionIndex < suggestions.length - 1) {
            setSuggestionIndex(suggestionIndex + 1);
          }
          // At last item: stay (don't exit)
        }
        return;
      }
      if (key.upArrow) {
        if (suggestionIndex > 0) {
          setSuggestionIndex(suggestionIndex - 1);
        } else if (suggestionIndex === 0) {
          setSuggestionIndex(-1);
        }
        return;
      }
      if (key.return) {
        if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
          onSelect(suggestions[suggestionIndex]);
        } else {
          onSubmit(value);
        }
        return;
      }
      if (key.escape) {
        if (showDropdown && suggestions.length > 0) {
          setShowDropdown(false);
          setSuggestionIndex(-1);
        } else if (!value) {
          onExit?.();
        } else {
          onChange("");
        }
        return;
      }
      if (key.tab) {
        onExit?.();
        return;
      }
    },
    { isActive: focused ?? true },
  );

  const showSuggestions = (focused ?? true) && showDropdown && suggestions.length > 0;

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={(focused ?? true) ? colors.primary : colors.border}
        paddingX={2}
        width={width}
      >
        <Text color={(focused ?? true) ? colors.primary : undefined}>🔍 </Text>
        <TextInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          focus={focused ?? true}
        />
      </Box>

      {showSuggestions && (
        <Box
          flexDirection="column"
          width={width}
          borderStyle="single"
          borderColor={colors.border}
          paddingX={1}
        >
          {suggestions.map((item, i) => {
            const isActive = i === suggestionIndex;
            return (
              <Box key={item.id}>
                <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                  {isActive ? "❯ " : "  "}{item.label}
                </Text>
                {item.detail && (
                  <Text dimColor>  {item.detail}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// ─── Dialog ─────────────────────────────────────────────────

interface DialogProps {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

/** Modal dialog box — centered, bordered, dismissible with Esc/Enter */
export function Dialog({ title, visible, onClose, children, width = 60 }: DialogProps) {
  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  }, { isActive: visible });

  if (!visible) return null;

  return (
    <Box justifyContent="center" marginY={1}>
      <Box flexDirection="column" borderStyle="double" borderColor={colors.border} width={width} paddingX={2} paddingY={1}>
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={colors.primary}>{title}</Text>
        </Box>
        {children}
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor>Press Esc or Enter to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
