import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
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

function formatPayload(payload: any): string {
  if (payload && typeof payload === "object" && payload.type === "text" && typeof payload.text === "string") {
    return payload.text;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
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
    getChannel(channelName)
      .then(({ channel: ch, messages: msgs }) => {
        if (unmountedRef.current) return;
        setChannel(ch);
        // Server returns newest-first; the renderer expects oldest-first.
        const sorted = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        update({
          messages: sorted,
          loading: false,
          // If the initial fetch returned a full page, assume more history exists.
          hasMoreOlder: msgs.length >= 50,
        });
      })
      .catch((err) => {
        if (unmountedRef.current) return;
        setError(String(err?.message || err));
        update({ loading: false });
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

    // Try to parse as JSON object; otherwise wrap as text
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
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        width={paneWidth}
      >
        <Box justifyContent="space-between">
          <Text bold color={colors.primary}>
            #{channelName}
          </Text>
          <Text dimColor>
            {subs} subs · {msgs} msgs
          </Text>
        </Box>
        {desc && (
          <Box>
            <Text dimColor>{desc}</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderBubble = (msg: ChannelMessage, showHeader: boolean) => {
    const isSelf = !!selfFp && msg.author === selfFp;
    const time = hhmm(msg.created_at);
    const name = isSelf ? "You" : displayName(msg);
    const body = formatPayload(msg.payload);
    const bodyColor = isSelf ? colors.primary : undefined;

    // Wrap long lines manually so no single line exceeds the available
    // width. Then bake the leading spaces into the string itself and
    // render one line per <Text>. This avoids ink's flex-wrapping bug
    // where a Text inside a flexGrow row gets a 1-column width and ends
    // up rendering one character per line.
    const rightGutter = 2;
    const leftGutter = 2;
    const maxLineWidth = Math.max(8, paneWidth - leftGutter - rightGutter);

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

    // Compute alignment padding per visible line.
    const padFor = (lineLen: number) => {
      if (isSelf) {
        return Math.max(0, paneWidth - rightGutter - lineLen);
      }
      return leftGutter;
    };

    return (
      <Box
        key={msg.id}
        flexDirection="column"
        marginTop={showHeader ? 1 : 0}
      >
        {showHeader && (
          <Text>
            <Text>{" ".repeat(padFor(name.length + 3 + time.length))}</Text>
            <Text bold color={isSelf ? colors.primary : undefined}>
              {name}
            </Text>
            <Text dimColor> · {time}</Text>
          </Text>
        )}
        {lines.map((line, i) => (
          <Text key={i} color={bodyColor}>
            {" ".repeat(padFor(line.length)) + line}
          </Text>
        ))}
      </Box>
    );
  };

  const renderMessages = () => {
    if (loading) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text dimColor>⠋ loading messages...</Text>
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
          <Text dimColor>no messages yet — be the first to publish.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" width={paneWidth}>
        {loadingOlder && (
          <Box paddingX={1}>
            <Text dimColor>⠋ loading older messages...</Text>
          </Box>
        )}
        {!loadingOlder && !hasMoreOlder && (
          <Box paddingX={1}>
            <Text dimColor>— start of channel —</Text>
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
          <Text color={colors.primary}>{"> "}</Text>
          <TextInput
            value={input}
            onChange={(v) => update({ input: v })}
            onSubmit={handleSubmit}
            placeholder="Type a JSON payload or plain text..."
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
    <Text dimColor>○</Text>
  );
  const statusLabel = wsConnected ? "live" : "offline";

  return (
    <Box flexDirection="column" paddingX={1}>
      {renderHeader()}
      <Box marginTop={1} flexDirection="column">
        {renderMessages()}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {renderInput()}
      </Box>
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>Enter publish · Esc back · </Text>
        {statusDot}
        <Text dimColor> {statusLabel}</Text>
        {channel && (
          <Text dimColor>   {channel.subscriber_count} subs</Text>
        )}
      </Box>
    </Box>
  );
}
