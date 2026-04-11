/**
 * MessageRenderer — shared message rendering for channel and chat views.
 *
 * Renders an editorial-style message list with sender headers, accent bars,
 * author grouping, and encrypted-message placeholders.
 */

import React from "react";
import { Box, Text } from "ink";
import { isEncrypted, decryptPayload } from "../lib/crypto.js";
import { colors } from "../theme.js";

// ─── Types ─────────────────────────────────────────────────────

export interface Message {
  id: string;
  author: string;
  author_name?: string;
  content: string;        // already formatted string (the body text)
  created_at: string;
}

export interface MessageRendererProps {
  messages: Message[];
  selfFingerprint: string;
  paneWidth: number;
  channelKey?: string | null;   // for encrypted channels, null for DMs
}

// ─── Helpers ───────────────────────────────────────────────────

export function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function shortFp(fp: string): string {
  const hash = fp.replace(/^SHA256:/, "");
  return hash.slice(0, 12);
}

export function displayName(msg: { author: string; author_name?: string }): string {
  return msg.author_name || shortFp(msg.author);
}

/**
 * Sanitize a chat body for safe terminal rendering. Multi-line content
 * is preserved (newlines remain), but anything that could corrupt the
 * ink layout is normalized:
 *   - CRLF / CR  -> LF (consistent line splits)
 *   - tabs       -> 2 spaces (predictable column math)
 *   - ANSI escapes -> stripped (can't be injected by remote bots)
 *   - other C0 control chars -> stripped
 */
export function sanitizeBody(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function formatPayload(payload: any, channelKey?: string | null): string {
  if (isEncrypted(payload)) {
    if (!channelKey) return "[encrypted message]";
    try {
      const decrypted = decryptPayload(payload, channelKey);
      return formatPayload(JSON.parse(decrypted));
    } catch {
      return "[decryption failed]";
    }
  }
  if (payload && typeof payload === "object" && payload.type === "text" && typeof payload.text === "string") {
    return sanitizeBody(payload.text);
  }
  try {
    return sanitizeBody(JSON.stringify(payload, null, 2));
  } catch {
    return sanitizeBody(String(payload));
  }
}

export function sameGroup(a: Message, b: Message): boolean {
  if (a.author !== b.author) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(tb - ta) <= 60_000;
}

// ─── Component ─────────────────────────────────────────────────

function renderBubble(
  msg: Message,
  showHeader: boolean,
  selfFingerprint: string,
  paneWidth: number,
) {
  const isSelf = !!selfFingerprint && msg.author === selfFingerprint;
  const time = hhmm(msg.created_at);
  const name = isSelf ? "You" : displayName(msg);
  const body = msg.content;
  // Detect encrypted placeholder to apply muted styling.
  const isEncMsg = body === "[encrypted message]" || body === "[decryption failed]";

  // Pre-wrap long lines manually so ink never has to soft-wrap.
  const indent = 2;
  const bodyIndent = 4;
  const maxLineWidth = Math.max(20, paneWidth - bodyIndent - 2);
  const rawLines = body.split("\n");
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (raw.length === 0) {
      lines.push("");
      continue;
    }
    for (let i = 0; i < raw.length; i += maxLineWidth) {
      lines.push(raw.slice(i, i + maxLineWidth));
    }
  }

  return (
    <Box
      key={msg.id}
      flexDirection="column"
      marginTop={showHeader ? 2 : 0}
      paddingLeft={indent}
    >
      {showHeader && (
        <Box>
          <Text bold color={isSelf ? colors.primary : undefined}>
            {name}
          </Text>
          <Text color={colors.subtle}>{"  " + time}</Text>
        </Box>
      )}
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={isSelf ? colors.primary : colors.subtle}>{"▎ "}</Text>
          <Text color={isEncMsg ? colors.muted : isSelf ? colors.primary : undefined}>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function MessageRenderer({ messages, selfFingerprint, paneWidth }: MessageRendererProps) {
  return (
    <Box flexDirection="column">
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : null;
        const showHeader = !prev || !sameGroup(prev, m);
        return renderBubble(m, showHeader, selfFingerprint, paneWidth);
      })}
    </Box>
  );
}
