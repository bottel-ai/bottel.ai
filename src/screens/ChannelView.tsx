import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useStore } from "../state.js";
import type { Channel, ChannelMessage } from "../state.js";
import { getChannel, publishMessage, openChannelWs, loadOlderMessages } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { colors } from "../theme.js";
import { HelpFooter } from "../components.js";

// ─── Helpers ────────────────────────────────────────────────────

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function shortFp(fp: string): string {
  const hash = fp.replace(/^SHA256:/, "");
  return hash.slice(0, 12);
}

function displayName(msg: ChannelMessage): string {
  return msg.author_name || shortFp(msg.author);
}

/**
 * Sanitize a chat body for safe terminal rendering. Multi-line content
 * is preserved (newlines remain), but anything that could corrupt the
 * ink layout is normalized:
 *   - CRLF / CR  → LF (consistent line splits)
 *   - tabs       → 2 spaces (predictable column math)
 *   - ANSI escapes → stripped (can't be injected by remote bots)
 *   - other C0 control chars → stripped
 */
function sanitizeBody(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function formatPayload(payload: any): string {
  if (payload && typeof payload === "object" && payload.type === "text" && typeof payload.text === "string") {
    // Multi-line text is preserved verbatim. The renderer splits on \n
    // and emits one row per line, each with the accent prefix and the
    // same indent — so pasted multi-line content stays readable without
    // breaking the editorial column.
    return sanitizeBody(payload.text);
  }
  try {
    return sanitizeBody(JSON.stringify(payload, null, 2));
  } catch {
    return sanitizeBody(String(payload));
  }
}

function sameGroup(a: ChannelMessage, b: ChannelMessage): boolean {
  if (a.author !== b.author) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(tb - ta) <= 60_000;
}

// ─── Props ──────────────────────────────────────────────────────

interface ChannelViewProps {
  channelName: string;
}

export function ChannelView({ channelName }: ChannelViewProps) {
  const { state, dispatch, goBack, scroll } = useStore();
  const { messages, input, loading, wsConnected, loadingOlder, hasMoreOlder } =
    state.channelView;
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  // Use the full terminal width (minus a 2-col gutter for outer paddingX).
  // Previously capped at 90, which left bubbles right-aligned to a narrower
  // pane than the header and input — making them look "shifted".
  const paneWidth = Math.max(50, termWidth - 2);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const auth = getAuth();
  const loggedIn = isLoggedIn();
  const selfFp = auth?.fingerprint ?? "";

  const update = (s: Partial<typeof state.channelView>) =>
    dispatch({ type: "UPDATE_CHANNEL_VIEW", state: s });

  // ─── Fetch channel + messages on mount ─────────────────────

  useEffect(() => {
    unmountedRef.current = false;
    // Reset pagination flags whenever we open a new channel.
    update({ loading: true, loadingOlder: false, hasMoreOlder: true });
    // Enforce a minimum loading window so the spinner is visible long enough
    // to feel intentional (avoids a sub-100ms flash on a fast network).
    const MIN_LOADING_MS = 1000;
    const startedAt = Date.now();
    getChannel(channelName)
      .then(({ channel: ch, messages: msgs }) => {
        if (unmountedRef.current) return;
        const sorted = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const elapsed = Date.now() - startedAt;
        const finish = () => {
          if (unmountedRef.current) return;
          setChannel(ch);
          update({
            messages: sorted,
            loading: false,
            hasMoreOlder: msgs.length >= 50,
          });
        };
        if (elapsed >= MIN_LOADING_MS) finish();
        else setTimeout(finish, MIN_LOADING_MS - elapsed);
      })
      .catch((err) => {
        if (unmountedRef.current) return;
        const elapsed = Date.now() - startedAt;
        const finish = () => {
          if (unmountedRef.current) return;
          setError(String(err?.message || err));
          update({ loading: false });
        };
        if (elapsed >= MIN_LOADING_MS) finish();
        else setTimeout(finish, MIN_LOADING_MS - elapsed);
      });

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);

  // ─── Scroll-up to load older messages ─────────────────────────
  //
  // Strategy:
  //   1. On Up / PageUp / mouse-wheel-up, if the global ScrollView is at
  //      offset 0 AND there's more history AND we're not already loading,
  //      kick off a fetch.
  //   2. Capture `getBottom()` BEFORE the fetch resolves.
  //   3. After the prepend lands and React re-renders, run a useEffect
  //      keyed on the messages length to compute the new bottom and
  //      adjust the scroll offset by the delta — keeping the user pinned
  //      to whatever they were looking at before the prepend.

  const pendingAnchor = useRef<number | null>(null);

  const loadOlder = async () => {
    if (loadingOlder || !hasMoreOlder) return;
    if (messages.length === 0) return;
    const oldest = messages[0]!;
    pendingAnchor.current = scroll.getBottom();
    update({ loadingOlder: true });
    try {
      const older = await loadOlderMessages(channelName, oldest.created_at, 50);
      if (unmountedRef.current) return;
      if (older.length === 0) {
        update({ loadingOlder: false, hasMoreOlder: false });
        pendingAnchor.current = null;
        return;
      }
      dispatch({ type: "PREPEND_CHANNEL_MESSAGES", messages: older });
      update({
        loadingOlder: false,
        // If we got fewer than a full page, we've hit the start of history.
        hasMoreOlder: older.length >= 50,
      });
    } catch {
      if (unmountedRef.current) return;
      update({ loadingOlder: false });
      pendingAnchor.current = null;
    }
  };

  // After a prepend, re-anchor the scroll position so the user stays put.
  useEffect(() => {
    if (pendingAnchor.current == null) return;
    const t = setTimeout(() => {
      const anchored = pendingAnchor.current;
      pendingAnchor.current = null;
      if (anchored == null) return;
      const newBottom = scroll.getBottom();
      const delta = newBottom - anchored;
      // Move the viewport down by the height of the newly prepended block.
      const target = Math.max(0, scroll.getOffset() + delta);
      scroll.scrollTo(target);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ─── WebSocket lifecycle ───────────────────────────────────

  useEffect(() => {
    if (!loggedIn || !selfFp) return;

    let cancelled = false;

    const connect = () => {
      if (cancelled || unmountedRef.current) return;
      let ws: WebSocket;
      try {
        ws = openChannelWs(channelName, selfFp);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (unmountedRef.current) return;
        update({ wsConnected: true });
      });

      ws.addEventListener("message", (ev: MessageEvent) => {
        if (unmountedRef.current) return;
        try {
          const data = JSON.parse(String(ev.data));

          // Live presence update — DO broadcasts these on every join/leave.
          if (data?.type === "presence" && typeof data.subscribers === "number") {
            setChannel((prev) =>
              prev ? { ...prev, subscriber_count: data.subscribers } : prev
            );
            return;
          }

          // Support either {message: ChannelMessage} or ChannelMessage directly
          const incoming: ChannelMessage | null = data?.message
            ? data.message
            : data?.id && data?.author
              ? data
              : null;
          if (!incoming) return;
          // Use atomic dispatch — handler closures over a stale `state` would
          // otherwise overwrite messages loaded after the WS opened.
          dispatch({ type: "APPEND_CHANNEL_MESSAGE", message: incoming });
        } catch {
          /* ignore */
        }
      });

      ws.addEventListener("close", () => {
        if (unmountedRef.current) return;
        update({ wsConnected: false });
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {}
      });
    };

    const scheduleReconnect = () => {
      if (unmountedRef.current || cancelled) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, loggedIn, selfFp, state.channelView.messages]);

  // ─── Input handling ────────────────────────────────────────

  useInput((_inputCh, key) => {
    if (key.escape) {
      if (!input) {
        goBack();
      } else {
        update({ input: "" });
      }
      return;
    }
    // Scroll-up-to-load-more: when the viewport is already at the top,
    // an Up arrow or PageUp fetches the previous page of history.
    if ((key.upArrow || key.pageUp) && hasMoreOlder && !loadingOlder) {
      if (scroll.getOffset() <= 0) {
        void loadOlder();
      }
    }
  });

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || !loggedIn || !selfFp) return;
    setSendError(null);

    // Try to parse as JSON object; otherwise wrap as text. Multi-line
    // text is preserved as-is so users can paste code blocks or
    // multi-paragraph content; the renderer handles line wrapping.
    let payload: any;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed;
      } else {
        payload = { type: "text", text: trimmed };
      }
    } catch {
      payload = { type: "text", text: trimmed };
    }

    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > 4096) {
      setSendError("payload too large (>4096 bytes)");
      return;
    }

    try {
      await publishMessage(selfFp, channelName, payload);
      update({ input: "" });
    } catch (err: any) {
      setSendError(String(err?.message || err));
    }
  };

  // ─── Rendering ─────────────────────────────────────────────

  const renderHeader = () => {
    const subs = channel?.subscriber_count ?? 0;
    const msgs = channel?.message_count ?? messages.length;
    const desc = channel?.description || "";
    // Editorial-style channel header card: round-bordered, terracotta
    // channel name on the left, stone-gray metadata on the right.
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        paddingY={0}
        width={paneWidth}
      >
        <Box justifyContent="space-between">
          <Text bold color={colors.primary}>
            #{channelName}
          </Text>
          <Text color={colors.subtle}>
            {subs} subs · {msgs} msgs
          </Text>
        </Box>
        {desc && (
          <Box>
            <Text color={colors.muted}>{desc}</Text>
          </Box>
        )}
      </Box>
    );
  };

  // Editorial conversation rendering — Claude.ai style.
  //
  // No alignment tricks, no flex spacers, no per-character wrap risks.
  // Each message is a sender header (bold, terracotta for "You") followed
  // by a body indented under it. Generous vertical spacing separates
  // author groups; consecutive messages from the same author within 60s
  // collapse into a single block. A terracotta accent character on the
  // body row marks "self" without right-aligning.
  const renderBubble = (msg: ChannelMessage, showHeader: boolean) => {
    const isSelf = !!selfFp && msg.author === selfFp;
    const time = hhmm(msg.created_at);
    const name = isSelf ? "You" : displayName(msg);
    const body = formatPayload(msg.payload);

    // Pre-wrap long lines manually so ink never has to soft-wrap. Without
    // this, a single line longer than the parent's available width would
    // get wrapped to column 0, escaping the indented block.
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
        // Wide gap between author groups, tight within a group.
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
            <Text color={isSelf ? colors.primary : undefined}>{line}</Text>
          </Box>
        ))}
      </Box>
    );
  };

  const renderMessages = () => {
    if (loading) {
      // Centered spinner — fills the messages pane horizontally and adds
      // vertical padding so it floats roughly in the middle of the area.
      return (
        <Box
          width={paneWidth}
          flexDirection="column"
          alignItems="center"
          paddingY={4}
        >
          <Box>
            <Text color={colors.primary}>
              <Spinner type="dots" />
            </Text>
            <Text color={colors.muted}> loading messages...</Text>
          </Box>
        </Box>
      );
    }
    if (error) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text color={colors.error}>error: {error}</Text>
        </Box>
      );
    }
    if (messages.length === 0) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text color={colors.muted}>no messages yet — be the first to publish.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" width={paneWidth}>
        {loadingOlder && (
          <Box paddingX={1}>
            <Text color={colors.muted}>⠋ loading older messages...</Text>
          </Box>
        )}
        {!loadingOlder && !hasMoreOlder && (
          <Box paddingX={1}>
            <Text color={colors.subtle}>— start of channel —</Text>
          </Box>
        )}
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const showHeader = !prev || !sameGroup(prev, m);
          return renderBubble(m, showHeader);
        })}
      </Box>
    );
  };

  const renderInput = () => {
    if (!loggedIn) {
      return (
        <Box
          borderStyle="round"
          borderColor={colors.warning}
          paddingX={2}
          width={paneWidth}
        >
          <Text color={colors.warning}>
            ⚠ generate a key in Profile to publish
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" width={paneWidth}>
        <Box
          borderStyle="round"
          borderColor={colors.primary}
          paddingX={2}
          width={paneWidth}
        >
          <Text color={colors.primary} bold>{"▸ "}</Text>
          <TextInput
            value={input}
            onChange={(v) => update({ input: v })}
            onSubmit={handleSubmit}
            placeholder="Reply on #channel..."
            focus
          />
        </Box>
        {sendError && (
          <Box paddingX={1}>
            <Text color={colors.error}>{sendError}</Text>
          </Box>
        )}
      </Box>
    );
  };

  const statusDot = wsConnected ? (
    <Text color={colors.success}>●</Text>
  ) : (
    <Text color={colors.subtle}>○</Text>
  );
  const statusLabel = wsConnected ? "live" : "offline";

  return (
    <Box flexDirection="column" paddingX={1}>
      {renderHeader()}
      <Box marginTop={1} flexDirection="column">
        {renderMessages()}
      </Box>
      <Box marginTop={2} flexDirection="column">
        {renderInput()}
      </Box>
      <Box marginTop={1} justifyContent="space-between" paddingX={1}>
        <Box>
          {statusDot}
          <Text color={colors.subtle}>
            {" " + statusLabel}
            {channel ? `  ·  ${channel.subscriber_count} subscriber${channel.subscriber_count === 1 ? "" : "s"}` : ""}
          </Text>
        </Box>
        <Text color={colors.subtle}>Enter to publish  ·  Esc to leave</Text>
      </Box>
    </Box>
  );
}
