import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import Spinner from "ink-spinner";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { useStore } from "../state.js";
import type { Channel, ChannelMessage } from "../state.js";
import { getChannel, publishMessage, openChannelWs, loadOlderMessages, joinChannel, checkJoined, fetchChannelKey, getFollowers, approveFollower } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { isEncrypted, decryptPayload } from "../lib/crypto.js";
import { getChannelKey, saveChannelKey, hasChannelKey } from "../lib/keys.js";
import { minePow, hashPayload } from "../lib/pow.js";
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

function formatPayload(payload: any, channelKey?: string | null): string {
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
  termHeight: number;
  termWidth: number;
}

export function ChannelView({ channelName, termHeight, termWidth }: ChannelViewProps) {
  const { state, dispatch, goBack } = useStore();
  const { messages, input, loading, wsConnected, loadingOlder, hasMoreOlder } =
    state.channelView;
  // Use the full terminal width (minus a 2-col gutter for outer paddingX).
  // Previously capped at 90, which left bubbles right-aligned to a narrower
  // pane than the header and input — making them look "shifted".
  const paneWidth = Math.max(50, termWidth - 2);

  // Internal ScrollView ref for the messages area.
  const msgScrollRef = useRef<ScrollViewRef>(null);

  // Calculate the height available for the scrollable messages area.
  const headerLines = 3;
  const inputLines = 3;
  const footerLines = 1;
  const margins = 6; // various marginTop values
  const fixedChrome = headerLines + inputLines + footerLines + margins;
  const scrollHeight = Math.max(5, termHeight - fixedChrome);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Encryption key for private channels (null = not available / public channel).
  const [channelKey, setChannelKey] = useState<string | null>(null);
  // Join state: null = loading, false = not joined, true = joined,
  // "pending" = join request pending (private channel)
  const [joinState, setJoinState] = useState<boolean | "pending" | null>(null);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  // Pending join requests (only loaded for private channel owners).
  const [pendingRequests, setPendingRequests] = useState<
    { follower: string; follower_name: string | null }[]
  >([]);
  const [pendingIdx, setPendingIdx] = useState(0);
  const [showPending, setShowPending] = useState(false);
  // When the user pastes multi-line content into the single-line reply
  // field we show a "[Pasted text with N lines]" placeholder in the field
  // and stash the real content here. handleSubmit reads from this ref so
  // the original multi-line body actually goes on the wire.
  const pastedRef = useRef<string | null>(null);

  const pastePlaceholder = (n: number) =>
    `[Pasted text with ${n} line${n === 1 ? "" : "s"}]`;

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
    // Reset join state for new channel.
    setJoinState(null);
    setShowJoinPrompt(false);
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
          // Load encryption key for private channels.
          if (!ch.is_public) {
            if (hasChannelKey(channelName)) {
              setChannelKey(getChannelKey(channelName));
            } else if (loggedIn && selfFp) {
              fetchChannelKey(selfFp, channelName)
                .then((key) => {
                  if (unmountedRef.current) return;
                  if (key) {
                    saveChannelKey(channelName, key);
                    setChannelKey(key);
                  }
                })
                .catch(() => {
                  // 403 or network error — no key available.
                });
            }
          }
          // Load pending join requests if this user owns a private channel.
          if (loggedIn && selfFp && !ch.is_public && ch.created_by === selfFp) {
            getFollowers(channelName, "pending")
              .then((list) => {
                if (unmountedRef.current) return;
                setPendingRequests(list);
                if (list.length > 0) setShowPending(true);
              })
              .catch(() => {});
          }
          // Check join status after loading.
          if (loggedIn && selfFp) {
            checkJoined(selfFp, channelName)
              .then(({ following, status }) => {
                if (unmountedRef.current) return;
                if (following) {
                  setJoinState(status === "pending" ? "pending" : true);
                } else {
                  setJoinState(false);
                  setShowJoinPrompt(true);
                }
              })
              .catch(() => setJoinState(false));
          }
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
    pendingAnchor.current = msgScrollRef.current?.getBottomOffset() ?? 0;
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
      const newBottom = msgScrollRef.current?.getBottomOffset() ?? 0;
      const delta = newBottom - anchored;
      // Move the viewport down by the height of the newly prepended block.
      const target = Math.max(0, (msgScrollRef.current?.getScrollOffset() ?? 0) + delta);
      msgScrollRef.current?.scrollTo(target);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Scroll to bottom when the last message changes (new message arrives).
  const lastMsgId = messages[messages.length - 1]?.id ?? null;
  useEffect(() => {
    const t = setTimeout(() => {
      const bottom = msgScrollRef.current?.getBottomOffset() ?? 0;
      msgScrollRef.current?.scrollTo(bottom);
    }, 0);
    return () => clearTimeout(t);
  }, [lastMsgId]);

  // ─── Mouse wheel scrolling ──────────────────────────────────
  //
  // Listen for SGR mouse sequences on stdin and scroll the internal
  // messages ScrollView. This handles both Linux (always SGR) and
  // macOS iTerm2 (SGR when enabled). Terminal.app on macOS uses the
  // older X10 protocol — we handle both formats.

  const { stdin } = useStdin();
  useEffect(() => {
    if (!stdin) return;
    const onData = (data: Buffer) => {
      const str = data.toString();
      // SGR format: \x1b[<button;col;rowM (press) or m (release)
      const matches = str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g);
      for (const match of matches) {
        const button = parseInt(match[1]!, 10);
        if (!msgScrollRef.current) continue;
        const offset = msgScrollRef.current.getScrollOffset();
        const bottom = msgScrollRef.current.getBottomOffset();
        if ((button & 0x43) === 0x40) {
          // Wheel up
          msgScrollRef.current.scrollTo(Math.max(0, offset - 3));
        } else if ((button & 0x43) === 0x41) {
          // Wheel down
          msgScrollRef.current.scrollTo(Math.min(bottom, offset + 3));
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, loggedIn, selfFp]);

  // ─── Input handling ────────────────────────────────────────
  //
  // We own the reply field directly via useInput + a ref instead of
  // using ink-text-input. ink-text-input is controlled — it computes
  // newValue from its current `value` prop and emits onChange. When
  // stdin events arrive faster than React commits, multiple onChange
  // callbacks all fire with the same stale prop and characters get
  // dropped on the floor.
  //
  // Owning the field via a ref means every keystroke is appended
  // SYNCHRONOUSLY before the next event handler runs — no race, no
  // dropped chars. The React `input` slice is just a mirror of the
  // ref so the renderer can re-render when needed.

  const inputBufRef = useRef<string>("");
  // Keep the ref in sync if the store's input value is reset elsewhere
  // (e.g. handleSubmit setting it to "").
  if (inputBufRef.current !== input && pastedRef.current == null) {
    // Only sync from store → ref when there's no pending paste, so the
    // store can clear the field after publish.
    if (input === "") inputBufRef.current = "";
  }

  const flushInputToStore = () => {
    update({ input: inputBufRef.current });
  };

  const handleJoin = async () => {
    if (!loggedIn || !selfFp) return;
    try {
      const { status } = await joinChannel(selfFp, channelName);
      setJoinState(status === "pending" ? "pending" : true);
      setShowJoinPrompt(false);
      // Refresh channel to get updated subscriber_count.
      const result = await getChannel(channelName);
      if (result) setChannel(result.channel);
      // For private channels, try to fetch the encryption key after approval.
      if (status !== "pending" && channel && !channel.is_public) {
        fetchChannelKey(selfFp, channelName)
          .then((key) => {
            if (key) {
              saveChannelKey(channelName, key);
              setChannelKey(key);
            }
          })
          .catch(() => {});
      }
    } catch {
      setShowJoinPrompt(false);
    }
  };

  useInput((char, key) => {
    // Pending requests panel: arrow keys to navigate, Enter to approve, Esc to dismiss.
    if (showPending && pendingRequests.length > 0) {
      if (key.upArrow) {
        setPendingIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setPendingIdx((i) => Math.min(pendingRequests.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const req = pendingRequests[pendingIdx];
        if (req && selfFp) {
          approveFollower(selfFp, channelName, req.follower)
            .then(() => {
              setPendingRequests((prev) => {
                const next = prev.filter((_, i) => i !== pendingIdx);
                if (next.length === 0) setShowPending(false);
                return next;
              });
              setPendingIdx((i) => Math.max(0, i - 1));
              // Refresh channel to update member count.
              getChannel(channelName).then((r) => r && setChannel(r.channel)).catch(() => {});
            })
            .catch(() => {});
        }
        return;
      }
      if (key.escape) {
        setShowPending(false);
        return;
      }
      return;
    }

    // Join prompt intercept: y = join, n/Esc = dismiss.
    if (showJoinPrompt) {
      if (char === "y" || char === "Y") {
        void handleJoin();
        return;
      }
      if (char === "n" || char === "N" || key.escape) {
        setShowJoinPrompt(false);
        return;
      }
      return; // swallow all other keys while the prompt is showing
    }

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

    // Scroll-up-to-load-more: when the viewport is already at the top,
    // an Up arrow or PageUp fetches the previous page of history.
    if ((key.upArrow || key.pageUp) && hasMoreOlder && !loadingOlder) {
      if ((msgScrollRef.current?.getScrollOffset() ?? 0) <= 0) {
        void loadOlder();
        return;
      }
    }
    // Up/Down/PageUp/PageDown: scroll the internal messages ScrollView.
    if (key.upArrow) { msgScrollRef.current?.scrollBy(-1); return; }
    if (key.downArrow) { msgScrollRef.current?.scrollBy(1); return; }
    if (key.pageUp) { msgScrollRef.current?.scrollBy(-10); return; }
    if (key.pageDown) { msgScrollRef.current?.scrollBy(10); return; }

    if (key.return) {
      void handleSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      if (pastedRef.current != null) {
        // Backspacing while a paste is pending discards it.
        pastedRef.current = null;
        inputBufRef.current = "";
      } else {
        inputBufRef.current = inputBufRef.current.slice(0, -1);
      }
      flushInputToStore();
      return;
    }

    if (!char) return;

    // Multi-char input with CR/LF = paste of multi-line content. A bare
    // single-char "\n" is treated as Enter (and would normally arrive
    // via key.return anyway).
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

    // Typing while a paste is pending discards the paste and starts fresh.
    if (pastedRef.current != null) {
      pastedRef.current = null;
      inputBufRef.current = char.replace(/\t/g, " ");
      flushInputToStore();
      return;
    }

    // Normal append. Tabs are flattened so they can't mangle column math.
    inputBufRef.current += char.replace(/\t/g, " ");
    flushInputToStore();
  });

  const handleSubmit = async () => {
    if (submitting) return; // block double-submit while POW is mining
    const pasted = pastedRef.current;
    const trimmed = pasted != null ? pasted : input.trim();
    if (!trimmed || !loggedIn || !selfFp) return;
    setSendError(null);
    setSubmitting(true);

    // Unescape literal `\n` (and `\\` to escape the escape) so users can
    // compose multi-line text in the single-line input by typing
    // "line1\nline2". Pasted bodies already contain real newlines, so
    // skip the unescape step for them.
    const unescaped =
      pasted != null
        ? pasted
        : trimmed
            .replace(/\\\\/g, "\u0000")
            .replace(/\\n/g, "\n")
            .replace(/\u0000/g, "\\");

    // Try to parse as JSON object; otherwise wrap as text. JSON parsing
    // uses the original (escaped) string so a JSON payload like
    // {"type":"text","text":"a\nb"} still parses cleanly.
    let payload: any;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed;
      } else {
        payload = { type: "text", text: unescaped };
      }
    } catch {
      payload = { type: "text", text: unescaped };
    }

    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > 4096) {
      setSendError("payload too large (>4096 bytes)");
      return;
    }

    try {
      // minePow is async — it yields the event loop every 4096 hashes
      // so the spinner animation stays smooth during mining.
      const pow = await minePow(channelName, selfFp, payload);
      await publishMessage(selfFp, channelName, payload, undefined, pow);
      update({ input: "" });
      pastedRef.current = null;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("Profile required")) {
        setSendError("Set up your identity first — go to Profile from the home menu.");
      } else {
        setSendError(msg);
      }
    } finally {
      setSubmitting(false);
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
            {channel && !channel.is_public ? "\u{1F512} " : ""}b/{channelName}
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
  // Each message is a sender header (bold, terracotta for "You") joined
  // by a body indented under it. Generous vertical spacing separates
  // author groups; consecutive messages from the same author within 60s
  // collapse into a single block. A terracotta accent character on the
  // body row marks "self" without right-aligning.
  const renderBubble = (msg: ChannelMessage, showHeader: boolean) => {
    const isSelf = !!selfFp && msg.author === selfFp;
    const time = hhmm(msg.created_at);
    const name = isSelf ? "You" : displayName(msg);
    const body = formatPayload(msg.payload, channelKey);
    const isEncMsg = isEncrypted(msg.payload) && !channelKey;

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
            <Text color={isEncMsg ? colors.muted : isSelf ? colors.primary : undefined}>{line}</Text>
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
          borderColor={submitting ? colors.muted : colors.primary}
          paddingX={2}
          width={paneWidth}
        >
          {submitting ? (
            <Box>
              <Text color={colors.primary}><Spinner type="dots" /></Text>
              <Text color={colors.muted}> sending...</Text>
            </Box>
          ) : (
            <>
              <Text color={colors.primary} bold>{"❯   "}</Text>
              {input.length > 0 ? (
                <>
                  <Text>{input}</Text>
                  <Text color={colors.primary}>{"▏"}</Text>
                </>
              ) : (
                <Text color={colors.subtle}>
                  Reply on b/channel...   (use \n for newline, or paste)
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
    <Text color={colors.success}>●</Text>
  ) : (
    <Text color={colors.subtle}>○</Text>
  );
  const statusLabel = wsConnected ? "live" : "offline";

  const joinLabel = joinState === true
    ? "joined"
    : joinState === "pending"
      ? "pending approval"
      : "";

  return (
    <Box flexDirection="column" paddingX={1}>
      {renderHeader()}

      {/* Join prompt — shown on first visit to a channel you haven't joined */}
      {showJoinPrompt && (
        <Box
          borderStyle="round"
          borderColor={colors.primary}
          paddingX={2}
          paddingY={0}
          marginTop={1}
          width={paneWidth}
        >
          <Text>Join </Text>
          <Text bold color={colors.primary}>b/{channelName}</Text>
          <Text>?  </Text>
          <Text bold color={colors.success}>y</Text>
          <Text color={colors.muted}> yes  </Text>
          <Text bold color={colors.error}>n</Text>
          <Text color={colors.muted}> no</Text>
        </Box>
      )}

      {/* Pending join notice for private channels */}
      {joinState === "pending" && !showJoinPrompt && (
        <Box paddingX={2} marginTop={1}>
          <Text color={colors.warning}>⏳ Join request pending — waiting for channel creator approval</Text>
        </Box>
      )}

      {/* Pending join requests — visible only to the channel owner */}
      {showPending && pendingRequests.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.warning}
          paddingX={2}
          paddingY={0}
          marginTop={1}
          width={paneWidth}
        >
          <Box marginBottom={1}>
            <Text bold color={colors.warning}>
              {pendingRequests.length} pending join request{pendingRequests.length === 1 ? "" : "s"}
            </Text>
          </Box>
          {pendingRequests.map((req, i) => {
            const active = i === pendingIdx;
            const label = req.follower_name || req.follower.replace("SHA256:", "").substring(0, 12);
            return (
              <Box key={req.follower}>
                <Text color={colors.primary}>{active ? "❯ " : "  "}</Text>
                <Text bold={active} color={active ? colors.primary : undefined}>
                  {label}
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text color={colors.muted}>↑↓ nav · Enter approve · Esc dismiss</Text>
          </Box>
        </Box>
      )}

      {/* Private channel encryption notice */}
      {channel && !channel.is_public && (
        <Box paddingX={2} marginTop={1}>
          <Text color={colors.muted}>{"\u{1F512}"} This is a private channel. Messages are encrypted.</Text>
        </Box>
      )}

      {/* Scrollable messages area — only this part scrolls */}
      <ScrollView ref={msgScrollRef} height={scrollHeight}>
        {renderMessages()}
      </ScrollView>

      <Box marginTop={1} flexDirection="column">
        {renderInput()}
      </Box>
      <Box marginTop={1} justifyContent="space-between" paddingX={1}>
        <Box>
          {statusDot}
          <Text color={colors.subtle}>
            {" " + statusLabel}
            {channel ? `  ·  ${channel.subscriber_count} member${channel.subscriber_count === 1 ? "" : "s"}` : ""}
            {channel && !channel.is_public ? "  ·  encrypted" : ""}
            {joinLabel ? `  ·  ${joinLabel}` : ""}
          </Text>
        </Box>
        <Text color={colors.subtle}>Enter to publish  ·  Esc to leave</Text>
      </Box>
    </Box>
  );
}
