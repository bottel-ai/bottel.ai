import { useEffect, useRef, useState } from "react";
import { Box, Text, useStdin } from "ink";
import Spinner from "ink-spinner";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { useStore } from "../state.js";
import type { Channel, ChannelMessage } from "../state.js";
import { getChannel, publishMessage, openChannelWs, loadOlderMessages, joinChannel, checkJoined, fetchChannelKey, getFollowers, approveFollower, banUser } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { getChannelKey, saveChannelKey, hasChannelKey } from "../lib/keys.js";
import { minePow } from "../lib/pow.js";
import { colors } from "../theme.js";
import { MessageRenderer, formatPayload } from "../components/MessageRenderer.js";
import { useReplyInput, unescapeInput, ReplyBox } from "../components/ReplyBox.js";
import { useWebSocket } from "../components/useWebSocket.js";
import { StatusBar } from "../components/StatusBar.js";

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

  // Prefetch buffer — older messages fetched in the background before the
  // user scrolls to the top. Merging is instant (no network, no spinner).
  const prefetchBuf = useRef<ChannelMessage[]>([]);
  const prefetchHasMore = useRef(true);
  const prefetching = useRef(false);

  // Pending scroll anchor — set by mergeOlder so that onContentHeightChange
  // can re-anchor the viewport after React actually renders the new items.
  const pendingAnchor = useRef<number | null>(null);

  // New-message indicator — instead of auto-scrolling to bottom on every
  // WS message, show "N new messages below" and let the user jump manually.
  const [newMsgCount, setNewMsgCount] = useState(0);
  const isAtBottom = useRef(true);

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
  const [showBanPicker, setShowBanPicker] = useState(false);
  const [banList, setBanList] = useState<{ follower: string; follower_name: string | null }[]>([]);
  const [banIdx, setBanIdx] = useState(0);
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
    // Reset pagination + prefetch state.
    update({ loading: true, loadingOlder: false, hasMoreOlder: true });
    prefetchBuf.current = [];
    prefetchHasMore.current = true;
    prefetching.current = false;
    setNewMsgCount(0);
    isAtBottom.current = true;
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
          // Start prefetching the next page in the background.
          if (msgs.length >= 50 && sorted.length > 0) {
            void doPrefetch(sorted[0]!.created_at);
          }
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);

  // ─── Scroll-up to load older messages ─────────────────────────
  // ─── Prefetch + instant merge ───────────────────────────────
  //
  // After initial load, prefetch the next page in the background. When
  // the user scrolls to the top, merge the buffer instantly (no network,
  // no spinner, no flash). Then start prefetching the next page.

  const doPrefetch = async (beforeTs: string) => {
    if (prefetching.current || !prefetchHasMore.current) return;
    prefetching.current = true;
    try {
      const older = await loadOlderMessages(channelName, beforeTs, 50);
      if (unmountedRef.current) return;
      prefetchBuf.current = older;
      prefetchHasMore.current = older.length >= 50;
    } catch {
      // Prefetch failure is silent — user can still trigger a live fetch.
    } finally {
      prefetching.current = false;
    }
  };

  const mergeOlder = () => {
    const buf = prefetchBuf.current;
    if (buf.length === 0) {
      update({ hasMoreOlder: false });
      return;
    }
    // Record the current scroll offset so onContentHeightChange can
    // re-anchor the viewport after React renders the prepended items.
    pendingAnchor.current = msgScrollRef.current?.getScrollOffset() ?? 0;

    dispatch({ type: "PREPEND_CHANNEL_MESSAGES", messages: buf });
    update({ hasMoreOlder: prefetchHasMore.current });
    prefetchBuf.current = [];

    // Start prefetching the next page from the new oldest message.
    if (prefetchHasMore.current) {
      const sorted = [...buf].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      if (sorted.length > 0) {
        void doPrefetch(sorted[0]!.created_at);
      }
    }
  };

  // Re-anchor scroll position after content height changes from a merge.
  const handleContentHeightChange = (height: number, previousHeight: number) => {
    if (pendingAnchor.current !== null && msgScrollRef.current) {
      const delta = height - previousHeight;
      msgScrollRef.current.scrollTo(pendingAnchor.current + delta);
      pendingAnchor.current = null;
    }
  };

  // Track whether the user is at the bottom of the scroll. If they are,
  // auto-scroll on new messages. If not, show a "N new messages" indicator.
  const lastMsgId = messages[messages.length - 1]?.id ?? null;
  const prevMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevMsgIdRef.current === null) {
      // First load — always scroll to bottom.
      prevMsgIdRef.current = lastMsgId;
      const t = setTimeout(() => {
        const bottom = msgScrollRef.current?.getBottomOffset() ?? 0;
        msgScrollRef.current?.scrollTo(bottom);
      }, 0);
      return () => clearTimeout(t);
    }
    if (lastMsgId !== prevMsgIdRef.current) {
      prevMsgIdRef.current = lastMsgId;
      if (isAtBottom.current) {
        // User is at the bottom — auto-scroll silently.
        const t = setTimeout(() => {
          const bottom = msgScrollRef.current?.getBottomOffset() ?? 0;
          msgScrollRef.current?.scrollTo(bottom);
        }, 0);
        return () => clearTimeout(t);
      }
      // User has scrolled up — don't jump, just increment the counter.
      setNewMsgCount((n) => n + 1);
    }
  }, [lastMsgId]);

  // Update isAtBottom whenever the user scrolls.
  const checkIfAtBottom = () => {
    if (!msgScrollRef.current) return;
    const offset = msgScrollRef.current.getScrollOffset();
    const bottom = msgScrollRef.current.getBottomOffset();
    isAtBottom.current = offset >= bottom - 2; // within 2 lines of bottom
  };

  const jumpToBottom = () => {
    const bottom = msgScrollRef.current?.getBottomOffset() ?? 0;
    msgScrollRef.current?.scrollTo(bottom);
    isAtBottom.current = true;
    setNewMsgCount(0);
  };

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
          checkIfAtBottom();
          // At the top? Merge prefetched older messages.
          if (offset <= 3 && hasMoreOlder && prefetchBuf.current.length > 0) {
            mergeOlder();
          }
        } else if ((button & 0x43) === 0x41) {
          // Wheel down
          msgScrollRef.current.scrollTo(Math.min(bottom, offset + 3));
          checkIfAtBottom();
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin]);

  // ─── WebSocket (shared hook) ───────────────────────────────

  useWebSocket({
    id: channelName,
    enabled: loggedIn && !!selfFp,
    createWs: () => openChannelWs(channelName, selfFp),
    onOpen: () => update({ wsConnected: true }),
    onClose: () => update({ wsConnected: false }),
    onMessage: (raw) => {
      const data = JSON.parse(raw);

      // Live presence update — DO broadcasts these on every join/leave.
      if (data?.type === "presence" && typeof data.subscribers === "number") {
        setChannel((prev) =>
          prev ? { ...prev, subscriber_count: data.subscribers } : prev
        );
        return;
      }

      const incoming: ChannelMessage | null = data?.message
        ? data.message
        : data?.id && data?.author
          ? data
          : null;
      if (incoming) dispatch({ type: "APPEND_CHANNEL_MESSAGE", message: incoming });
    },
  });

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

  const handleJoin = async () => {
    if (!loggedIn || !selfFp) return;
    try {
      const { status } = await joinChannel(selfFp, channelName);
      setJoinState(status === "pending" ? "pending" : true);
      setShowJoinPrompt(false);
      const result = await getChannel(channelName);
      if (result) setChannel(result.channel);
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

  // ─── Submit handler ───────────────────────────────────────

  const handleSubmit = async (text: string, pasted: string | null) => {
    if (submitting || !loggedIn || !selfFp) return;
    setSendError(null);
    setSubmitting(true);

    const unescaped = unescapeInput(text, pasted);

    // Try to parse as JSON object; otherwise wrap as text.
    let payload: any;
    try {
      const parsed = JSON.parse(text);
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
      setSubmitting(false);
      return;
    }

    try {
      const pow = await minePow(channelName, selfFp, payload);
      await publishMessage(selfFp, channelName, payload, undefined, pow);
      update({ input: "" });
      jumpToBottom();
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

  // ─── Input handling (shared hook) ─────────────────────────

  const { inputBufRef } = useReplyInput({
    input,
    flushInput: (value) => update({ input: value }),
    onSubmit: handleSubmit,
    onEscape: goBack,
    onKeyBefore: (char, key) => {
      // Ban picker panel
      if (showBanPicker) {
        if (key.upArrow) { setBanIdx(i => Math.max(0, i - 1)); return true; }
        if (key.downArrow) { setBanIdx(i => Math.min(banList.length - 1, i + 1)); return true; }
        if (key.return && banList.length > 0) {
          const target = banList[banIdx];
          if (target && selfFp) {
            banUser(selfFp, channelName, target.follower)
              .then(() => {
                setBanList(prev => prev.filter((_, idx) => idx !== banIdx));
                setBanIdx(idx => Math.max(0, idx - 1));
                if (banList.length <= 1) setShowBanPicker(false);
                // Refresh channel to update subscriber count
                getChannel(channelName).then((r) => r && setChannel(r.channel)).catch(() => {});
              })
              .catch(() => {});
          }
          return true;
        }
        if (key.escape) { setShowBanPicker(false); return true; }
        return true;
      }

      // Pending requests panel
      if (showPending && pendingRequests.length > 0) {
        if (key.upArrow) { setPendingIdx((i: number) => Math.max(0, i - 1)); return true; }
        if (key.downArrow) { setPendingIdx((i: number) => Math.min(pendingRequests.length - 1, i + 1)); return true; }
        if (key.return) {
          const req = pendingRequests[pendingIdx];
          if (req && selfFp) {
            approveFollower(selfFp, channelName, req.follower)
              .then(() => {
                setPendingRequests((prev) => {
                  const next = prev.filter((_: any, i: number) => i !== pendingIdx);
                  if (next.length === 0) setShowPending(false);
                  return next;
                });
                setPendingIdx((i: number) => Math.max(0, i - 1));
                getChannel(channelName).then((r) => r && setChannel(r.channel)).catch(() => {});
              })
              .catch(() => {});
          }
          return true;
        }
        if (key.escape) { setShowPending(false); return true; }
        return true; // swallow all keys while panel is open
      }

      // Join prompt
      if (showJoinPrompt) {
        if (char === "y" || char === "Y") { void handleJoin(); return true; }
        if (char === "n" || char === "N" || key.escape) { setShowJoinPrompt(false); return true; }
        return true;
      }

      // Scroll-up-to-load-more
      if ((key.upArrow || key.pageUp) && hasMoreOlder) {
        if ((msgScrollRef.current?.getScrollOffset() ?? 0) <= 0) {
          if (prefetchBuf.current.length > 0) mergeOlder();
          return true;
        }
      }

      // Scroll
      if (key.upArrow) { msgScrollRef.current?.scrollBy(-1); checkIfAtBottom(); return true; }
      if (key.downArrow) { msgScrollRef.current?.scrollBy(1); checkIfAtBottom(); return true; }
      if (key.pageUp) { msgScrollRef.current?.scrollBy(-10); checkIfAtBottom(); return true; }
      if (key.pageDown) { msgScrollRef.current?.scrollBy(10); checkIfAtBottom(); return true; }

      // g = jump to bottom
      if ((char === "g" || char === "G") && !inputBufRef.current && newMsgCount > 0) {
        jumpToBottom();
        return true;
      }

      // b = ban picker (owner only)
      if ((char === "b" || char === "B") && !inputBufRef.current && channel?.created_by === selfFp) {
        getFollowers(channelName, "active")
          .then((list) => {
            const filtered = list.filter(f => f.follower !== selfFp);
            setBanList(filtered);
            setBanIdx(0);
            setShowBanPicker(true);
          })
          .catch(() => {});
        return true;
      }

      return false;
    },
  });

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
            <Text color={colors.primary}><Spinner type="dots" /></Text>
            <Text color={colors.muted}> loading older messages...</Text>
          </Box>
        )}
        {!loadingOlder && !hasMoreOlder && (
          <Box paddingX={1}>
            <Text color={colors.subtle}>— start of channel —</Text>
          </Box>
        )}
        <MessageRenderer
          messages={messages.map(m => ({
            id: m.id,
            author: m.author,
            author_name: m.author_name,
            content: formatPayload(m.payload, channelKey),
            created_at: m.created_at,
          }))}
          selfFingerprint={selfFp}
          paneWidth={paneWidth}
          ownerFingerprint={channel?.created_by}
        />
      </Box>
    );
  };

  // Dynamic scroll height: subtract all fixed chrome + conditional notices.
  let chromeLines = 3 + 3 + 1 + 5; // header + input + footer + margins
  if (showJoinPrompt) chromeLines += 3;
  if (joinState === "pending" && !showJoinPrompt) chromeLines += 1;
  if (showPending && pendingRequests.length > 0) chromeLines += pendingRequests.length + 3;
  if (showBanPicker) chromeLines += banList.length + 3;
  if (channel && !channel.is_public) chromeLines += 1;
  if (newMsgCount > 0) chromeLines += 1;
  const scrollHeight = Math.max(5, termHeight - chromeLines);

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
            const fpClean = req.follower.replace("SHA256:", "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 8);
            const fId = `bot_${fpClean}`;
            const label = req.follower_name ? `${req.follower_name} (${fId})` : fId;
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
          <Text color={colors.muted}>{"\u{1F512}"} Private · encrypted · approved members only</Text>
        </Box>
      )}

      {/* Ban picker — visible only to the channel owner */}
      {showBanPicker && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.error}
          paddingX={2}
          paddingY={0}
          marginTop={1}
          width={paneWidth}
        >
          <Box marginBottom={1}>
            <Text bold color={colors.error}>
              Ban a user from b/{channelName}
            </Text>
          </Box>
          {banList.length === 0 ? (
            <Text color={colors.muted}>No members to ban.</Text>
          ) : (
            banList.map((member, i) => {
              const active = i === banIdx;
              const fpClean = member.follower.replace("SHA256:", "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 8);
              const fId = `bot_${fpClean}`;
              const label = member.follower_name ? `${member.follower_name} (${fId})` : fId;
              return (
                <Box key={member.follower}>
                  <Text color={colors.error}>{active ? "\u276F " : "  "}</Text>
                  <Text bold={active} color={active ? colors.error : undefined}>
                    {label}
                  </Text>
                </Box>
              );
            })
          )}
          <Box marginTop={1}>
            <Text color={colors.muted}>{"\u2191\u2193"} nav {"\u00B7"} Enter ban {"\u00B7"} Esc cancel</Text>
          </Box>
        </Box>
      )}

      {/* Scrollable messages area — only this part scrolls */}
      <ScrollView ref={msgScrollRef} height={scrollHeight} onContentHeightChange={handleContentHeightChange}>
        {renderMessages()}
      </ScrollView>

      {/* New messages indicator — shown when the user has scrolled up */}
      {newMsgCount > 0 && (
        <Box paddingX={2} marginTop={1}>
          <Text color={colors.primary} bold>
            ↓ {newMsgCount} new message{newMsgCount === 1 ? "" : "s"} below
          </Text>
          <Text color={colors.subtle}>  — press </Text>
          <Text bold color={colors.primary}>g</Text>
          <Text color={colors.subtle}> to jump to latest</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <ReplyBox
          input={input}
          submitting={submitting}
          loggedIn={loggedIn}
          paneWidth={paneWidth}
          sendError={sendError}
          placeholder={`Reply on b/${channelName}...   (use \\n for newline, or paste)`}
          notLoggedInText="generate a key in Profile to publish"
          showSpinner={true}
        />
      </Box>
      <StatusBar
        connected={wsConnected}
        extra={[
          channel ? `${channel.subscriber_count} member${channel.subscriber_count === 1 ? "" : "s"}` : "",
          channel && !channel.is_public ? "encrypted" : "",
          joinLabel,
        ].filter(Boolean).join("  ·  ")}
        hint={channel?.created_by === selfFp
          ? "Enter to publish  \u00B7  b ban  \u00B7  Esc to leave"
          : "Enter to publish  \u00B7  Esc to leave"
        }
      />
    </Box>
  );
}
