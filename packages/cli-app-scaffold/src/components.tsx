/**
 * Reusable UI components for CLI apps built on ink.
 *
 * Provides navigation, layout, autocomplete, and dialog primitives.
 * Zero app-specific dependencies — only ink, react, and the scaffold theme.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { colors, boxStyle } from "./theme.js";

// ─── Navigation ─────────────────────────────────────────────

/** Arrow cursor indicator for list items */
export function Cursor({ active, width = 3 }: { active: boolean; width?: number }) {
  return (
    <Box width={width}>
      <Text color={active ? colors.primary : undefined}>
        {active ? "\u276f " : "  "}
      </Text>
    </Box>
  );
}

/** Breadcrumb navigation trail: Home > Browse > Development */
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
    <Box {...bs} paddingX={2} marginBottom={1} flexGrow={1}>
      <Text bold color={colors.primary}>{title}</Text>
    </Box>
  );
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
  width,
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
          setSuggestionIndex((suggestionIndex + 1 + 1) % (suggestions.length + 1) - 1);
        }
        return;
      }
      if (key.upArrow) {
        if (suggestions.length > 0 && showDropdown) {
          setSuggestionIndex((suggestionIndex + 1 - 1 + (suggestions.length + 1)) % (suggestions.length + 1) - 1);
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

  const sizeProps = width ? { width } : { flexGrow: 1 as const };

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={(focused ?? true) ? colors.primary : colors.border}
        paddingX={2}
        {...sizeProps}
      >
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
          {...sizeProps}
          borderStyle="single"
          borderColor={colors.border}
          paddingX={1}
        >
          {suggestions.map((item, i) => {
            const isActive = i === suggestionIndex;
            return (
              <Box key={item.id}>
                <Text color={isActive ? colors.primary : undefined} bold={isActive}>
                  {isActive ? "\u276f " : "  "}{item.label}
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
