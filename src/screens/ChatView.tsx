import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useStore } from "../state.js";
import type { DirectMessage } from "../state.js";
import { getChatMessages, sendDirectMessage, openChatWs } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { colors } from "../theme.js";
import { HelpFooter } from "../components.js";
import { hhmm, shortFp, displayName as displayNameBase, sanitizeBody } from "../components/MessageRenderer.js";

function displayName(msg: DirectMessage): string {
  return displayNameBase({ author: msg.sender, author_name: msg.sender_name ?? undefined });
}

function sameGroup(a: DirectMessage, b: DirectMessage): boolean {
  if (a.sender !== b.sender) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(tb - ta) <= 60_000;
}

// ─── Props ──────────────────────────────────────────────────────

interface ChatViewProps {
  chatId: string;
}

export function ChatView({ chatId }: ChatViewProps) {
  const { state, dispatch, goBack } = useStore();
  const { messages, input, loading, wsConnected } = state.chatView;
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const paneWidth = Math.max(50, termWidth - 2);

  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Paste support — same pattern as ChannelView
  const pastedRef = useRef<string | null>(null);
  const pastePlaceholder = (n: number) =>
    `[Pasted text with ${n} line${n === 1 ? "" : "s"}]`;

  const auth = getAuth();
  const loggedIn = isLoggedIn();
  const selfFp = auth?.fingerprint ?? "";

  const update = (s: Partial<typeof state.chatView>) =>
    dispatch({ type: "UPDATE_CHAT_VIEW", state: s });

  // ─── Fetch messages on mount ────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false;
    if (!loggedIn || !selfFp) return;
    update({ loading: true });

    getChatMessages(selfFp, chatId)
      .then((msgs) => {
        if (unmountedRef.current) return;
        const sorted = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        update({ messages: sorted, loading: false });
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
  }, [chatId]);

  // ─── WebSocket lifecycle ──────────────────────────────────

  useEffect(() => {
    if (!loggedIn || !selfFp) return;

    let cancelled = false;

    const connect = () => {
      if (cancelled || unmountedRef.current) return;
      let ws: WebSocket;
      try {
        ws = openChatWs(chatId, selfFp);
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
          const incoming: DirectMessage | null = data?.message
            ? data.message
            : data?.id && data?.sender
              ? data
              : null;
          if (!incoming) return;
          dispatch({ type: "APPEND_DIRECT_MESSAGE", message: incoming });
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
  }, [chatId, loggedIn, selfFp]);

  // ─── Input handling ───────────────────────────────────────
  //
  // Custom useInput-based reply field (same ref-based approach as
  // ChannelView to avoid dropped chars with ink-text-input).

  const inputBufRef = useRef<string>("");
  if (inputBufRef.current !== input && pastedRef.current == null) {
    inputBufRef.current = input;
  }
  if (input === "") inputBufRef.current = "";

  const flushInputToStore = () => {
    update({ input: inputBufRef.current });
  };

  useInput((char, key) => {
    // Filter out SGR mouse escape sequences
    if (char && /\[<\d+;\d+;\d+[Mm]/.test(char)) return;

    if (key.escape) {
      if (!inputBufRef.current && pastedRef.current == null) {
        goBack();
      } else {
        inputBufRef.current = "";
        pastedRef.current = null;
        flushInputToStore();
      }
      return;
    }

    if (key.return) {
      void handleSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      if (pastedRef.current != null) {
        pastedRef.current = null;
        inputBufRef.current = "";
      } else {
        inputBufRef.current = inputBufRef.current.slice(0, -1);
      }
      flushInputToStore();
      return;
    }

    if (!char) return;

    // Multi-char input with CR/LF = paste
    if (char.length > 1 && /[\r\n]/.test(char)) {
      const normalized = char.replace(/\r\n?/g, "\n");
      const n = normalized.split("\n").length;
      pastedRef.current = normalized;
      inputBufRef.current = pastePlaceholder(n);
      flushInputToStore();
      return;
    }
    if (char === "\n" || char === "\r") {
      void handleSubmit();
      return;
    }

    // Typing while a paste is pending discards the paste
    if (pastedRef.current != null) {
      pastedRef.current = null;
      inputBufRef.current = char.replace(/\t/g, " ");
      flushInputToStore();
      return;
    }

    inputBufRef.current += char.replace(/\t/g, " ");
    flushInputToStore();
  });

  const handleSubmit = async () => {
    if (submitting) return;
    const pasted = pastedRef.current;
    const trimmed = pasted != null ? pasted : input.trim();
    if (!trimmed || !loggedIn || !selfFp) return;
    setSendError(null);
    setSubmitting(true);

    // Unescape literal \n
    const unescaped =
      pasted != null
        ? pasted
        : trimmed
            .replace(/\\\\/g, "\u0000")
            .replace(/\\n/g, "\n")
            .replace(/\u0000/g, "\\");

    try {
      await sendDirectMessage(selfFp, chatId, unescaped);
      update({ input: "" });
      pastedRef.current = null;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("Profile required")) {
        setSendError("Set up your identity first -- go to Profile from the home menu.");
      } else {
        setSendError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Rendering ────────────────────────────────────────────

  const renderBubble = (msg: DirectMessage, showHeader: boolean) => {
    const isSelf = !!selfFp && msg.sender === selfFp;
    const time = hhmm(msg.created_at);
    const name = isSelf ? "You" : displayName(msg);
    const body = sanitizeBody(msg.content);

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
            <Text color={isSelf ? colors.primary : colors.subtle}>{"\u258e "}</Text>
            <Text color={isSelf ? colors.primary : undefined}>{line}</Text>
          </Box>
        ))}
      </Box>
    );
  };

  const renderMessages = () => {
    if (loading) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text color={colors.muted}>loading messages...</Text>
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
          <Text color={colors.muted}>No messages yet -- say hello!</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" width={paneWidth}>
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
            Set up your identity first
          </Text>
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
              <Text color={colors.muted}>sending...</Text>
            </Box>
          ) : (
            <>
              <Text color={colors.primary} bold>{"\u276f   "}</Text>
              {input.length > 0 ? (
                <>
                  <Text>{input}</Text>
                  <Text color={colors.primary}>{"\u258f"}</Text>
                </>
              ) : (
                <Text color={colors.subtle}>
                  Reply...   (use \n for newline, or paste)
                </Text>
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
  };

  const statusDot = wsConnected ? (
    <Text color={colors.success}>{"\u25cf"}</Text>
  ) : (
    <Text color={colors.subtle}>{"\u25cb"}</Text>
  );
  const statusLabel = wsConnected ? "live" : "offline";

  return (
    <Box flexDirection="column" paddingX={1}>
      {renderMessages()}

      <Box marginTop={1}>
        {renderInput()}
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Box>
          {statusDot}
          <Text color={colors.subtle}> {statusLabel}</Text>
        </Box>
      </Box>

      <HelpFooter text="Enter send \u00b7 Esc back" />
    </Box>
  );
}
