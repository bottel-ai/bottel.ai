/**
 * ReplyBox — shared reply input field and input-handling hook used by
 * both ChannelView and ChatView.
 */

import { useRef } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { colors } from "../theme.js";

// ─── useReplyInput hook ─────────────────────────────────────────
//
// Manages the ref-based input buffer, paste detection, SGR filtering,
// escape/backspace/return handling. Both ChannelView and ChatView use
// this identical logic; the only difference is what happens on submit
// and on escape-with-empty-buffer (go back).

interface ReplyInputOptions {
  /** Current input value from the store. */
  input: string;
  /** Flush the buffer to the store. */
  flushInput: (value: string) => void;
  /** Called when the user presses Enter (or pastes + Enter). */
  onSubmit: (text: string, pasted: string | null) => void;
  /** Called when the user presses Escape with an empty buffer. */
  onEscape: () => void;
  /** Extra key handler called BEFORE the default logic. Return true to swallow. */
  onKeyBefore?: (char: string, key: any) => boolean;
}

export function useReplyInput(opts: ReplyInputOptions) {
  const inputBufRef = useRef<string>("");
  const pastedRef = useRef<string | null>(null);

  const pastePlaceholder = (n: number) =>
    `[Pasted text with ${n} line${n === 1 ? "" : "s"}]`;

  // Keep ref in sync with store (external resets, etc.)
  if (inputBufRef.current !== opts.input && pastedRef.current == null) {
    inputBufRef.current = opts.input;
  }
  if (opts.input === "") inputBufRef.current = "";

  const flush = () => opts.flushInput(inputBufRef.current);

  useInput((char, key) => {
    // Filter SGR mouse escape sequences
    if (char && /\[<\d+;\d+;\d+[Mm]/.test(char)) return;

    // Let the caller handle keys first (scroll, join prompt, etc.)
    if (opts.onKeyBefore?.(char, key)) return;

    if (key.escape) {
      if (!inputBufRef.current && pastedRef.current == null) {
        opts.onEscape();
      } else {
        inputBufRef.current = "";
        pastedRef.current = null;
        flush();
      }
      return;
    }

    if (key.return) {
      const pasted = pastedRef.current;
      const trimmed = pasted != null ? pasted : inputBufRef.current.trim();
      if (trimmed) opts.onSubmit(trimmed, pasted);
      return;
    }

    if (key.backspace || key.delete) {
      if (pastedRef.current != null) {
        pastedRef.current = null;
        inputBufRef.current = "";
      } else {
        inputBufRef.current = inputBufRef.current.slice(0, -1);
      }
      flush();
      return;
    }

    if (!char) return;

    // Multi-char with CR/LF = paste
    if (char.length > 1 && /[\r\n]/.test(char)) {
      const normalized = char.replace(/\r\n?/g, "\n");
      const n = normalized.split("\n").length;
      pastedRef.current = normalized;
      inputBufRef.current = pastePlaceholder(n);
      flush();
      return;
    }
    if (char === "\n" || char === "\r") {
      const pasted = pastedRef.current;
      const trimmed = pasted != null ? pasted : inputBufRef.current.trim();
      if (trimmed) opts.onSubmit(trimmed, pasted);
      return;
    }

    // Typing while paste is pending discards the paste
    if (pastedRef.current != null) {
      pastedRef.current = null;
      inputBufRef.current = char.replace(/\t/g, " ");
      flush();
      return;
    }

    inputBufRef.current += char.replace(/\t/g, " ");
    flush();
  });

  return { inputBufRef, pastedRef };
}

// ─── Unescape helper ────────────────────────────────────────────

/** Unescape literal `\n` sequences typed by the user. Pasted text already has real newlines. */
export function unescapeInput(text: string, pasted: string | null): string {
  if (pasted != null) return pasted;
  return text
    .replace(/\\\\/g, "\u0000")
    .replace(/\\n/g, "\n")
    .replace(/\u0000/g, "\\");
}

// ─── ReplyBox component ─────────────────────────────────────────

interface ReplyBoxProps {
  input: string;
  submitting: boolean;
  loggedIn: boolean;
  paneWidth: number;
  sendError: string | null;
  placeholder?: string;
  notLoggedInText?: string;
  showSpinner?: boolean;
}

export function ReplyBox({
  input,
  submitting,
  loggedIn,
  paneWidth,
  sendError,
  placeholder = "Reply...   (use \\n for newline, or paste)",
  notLoggedInText = "Set up your identity first",
  showSpinner = false,
}: ReplyBoxProps) {
  if (!loggedIn) {
    return (
      <Box
        borderStyle="round"
        borderColor={colors.warning}
        paddingX={2}
        width={paneWidth}
      >
        <Text color={colors.warning}>⚠ {notLoggedInText}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={paneWidth}>
      <Box
        borderStyle="round"
        borderColor={submitting ? colors.muted : colors.primary}
        paddingX={2}
        width={paneWidth}
      >
        {submitting ? (
          <Box>
            {showSpinner ? (
              <Text color={colors.primary}><Spinner type="dots" /></Text>
            ) : null}
            <Text color={colors.muted}>{showSpinner ? " " : ""}sending...</Text>
          </Box>
        ) : (
          <>
            <Text color={colors.primary} bold>{"❯   "}</Text>
            {input.length > 0 ? (
              <>
                <Text>{input}</Text>
                <Text color={colors.primary}>{"\u258f"}</Text>
              </>
            ) : (
              <Text color={colors.subtle}>{placeholder}</Text>
            )}
          </>
        )}
      </Box>
      {sendError && (
        <Box paddingX={1}>
          <Text color={colors.error}>{sendError}</Text>
        </Box>
      )}
    </Box>
  );
}
