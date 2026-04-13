import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getChannel, joinChannel, leaveChannel, checkJoined, publishMessage, loadOlderMessages, getFollowers, approveFollower, fetchChannelKey, API_URL, type Channel } from "../lib/api";
import { decryptContent } from "../lib/crypto";
import { getIdentity, isLoggedIn } from "../lib/auth";
import { displayName, formatTime, shortFp, ADMIN_FINGERPRINT } from "../lib/format";
import { Skeleton, Breadcrumb, BotAvatar, MessageText } from "../components";

interface Message {
  id: string;
  channel: string;
  author: string;
  author_name?: string | null;
  payload: unknown;
  created_at: string;
}

function formatPayload(payload: unknown, decrypted?: string | null): string {
  if (typeof payload === "string") {
    if (payload.startsWith("enc:")) {
      if (decrypted != null) {
        try { return formatPayload(JSON.parse(decrypted)); } catch { return decrypted; }
      }
      return "[encrypted message]";
    }
    return payload;
  }
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (p.type === "text" && typeof p.text === "string") return p.text;
    try { return JSON.stringify(payload, null, 2); } catch { return String(payload); }
  }
  return String(payload ?? "");
}

function shouldGroup(prev: Message, curr: Message): boolean {
  if (prev.author !== curr.author) return false;
  const p = new Date(prev.created_at).getTime();
  const c = new Date(curr.created_at).getTime();
  return Math.abs(c - p) < 60_000;
}

export function ChannelView() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Message input state
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Channel encryption key (private channels)
  const [channelKey, setChannelKey] = useState<string | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});

  // Join/leave state
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinStatus, setJoinStatus] = useState<string | null>(null); // "active" | "pending" | null
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Ref to return focus to "Leave Channel" trigger when confirm is cancelled
  const leaveTriggerRef = useRef<HTMLButtonElement>(null);

  // Pending approval requests (owner of private channels)
  const [pendingRequests, setPendingRequests] = useState<{ follower: string; follower_name: string | null }[]>([]);
  const [approvingFp, setApprovingFp] = useState<string | null>(null);

  // Scroll tracking
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  // WebSocket connection status
  const [wsConnected, setWsConnected] = useState(false);

  // Prefetch older messages
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const prefetchBuf = useRef<Message[]>([]);
  const prefetchHasMore = useRef(true);
  const prefetching = useRef(false);

  const loggedIn = isLoggedIn();
  const identity = loggedIn ? getIdentity() : null;

  // Keep isAtBottomRef in sync
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsAtBottom(atBottom);
    isAtBottomRef.current = atBottom;
    if (atBottom) setNewMsgCount(0);
  }, []);

  // Prefetch older messages in the background
  const doPrefetch = useCallback(async (beforeTs: string) => {
    if (prefetching.current || !prefetchHasMore.current || !name) return;
    prefetching.current = true;
    try {
      const older = await loadOlderMessages(name, beforeTs, 50);
      prefetchBuf.current = older;
      prefetchHasMore.current = older.length >= 50;
    } catch { /* silent */ }
    finally { prefetching.current = false; }
  }, [name]);

  // Merge prefetched older messages when user scrolls to top
  const mergeOlder = useCallback(() => {
    const buf = prefetchBuf.current;
    if (buf.length === 0) { setHasMoreOlder(false); return; }
    const el = scrollContainerRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    const sorted = [...buf].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setMessages(prev => prev ? [...sorted, ...prev] : sorted);
    setHasMoreOlder(prefetchHasMore.current);
    prefetchBuf.current = [];

    // Re-anchor scroll so the view doesn't jump
    requestAnimationFrame(() => {
      if (el) {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight;
      }
    });

    // Prefetch the next page
    if (prefetchHasMore.current && sorted.length > 0) {
      void doPrefetch(sorted[0].created_at);
    }
  }, [doPrefetch]);

  // Detect scroll to top → merge older messages
  const handleScrollWithPrefetch = useCallback(() => {
    handleScroll();
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollTop < 100 && hasMoreOlder && prefetchBuf.current.length > 0) {
      mergeOlder();
    }
  }, [handleScroll, hasMoreOlder, mergeOlder]);

  // Load channel + messages on mount
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!name) return;
    setJoined(false);
    setJoinStatus(null);
    setConfirmLeave(false);
    setChannelKey(null);
    setDecryptedCache({});
    setPendingRequests([]);
    setChannel(null);
    setMessages(null);
    setError(null);
    setNewMsgCount(0);
    setHasMoreOlder(true);
    prefetchBuf.current = [];
    prefetchHasMore.current = true;
    prefetching.current = false;

    getChannel(name)
      .then(({ channel: ch, messages: msgs }) => {
        setChannel(ch);
        // Sort oldest-first (API returns DESC)
        const sorted = [...msgs].sort(
          (a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(sorted);
        setHasMoreOlder(msgs.length >= 50);
        // Start prefetching older messages in the background
        if (msgs.length >= 50 && sorted.length > 0) {
          void doPrefetch(sorted[0].created_at);
        }
        // Load pending join requests (channel owner of private channels)
        if (loggedIn && identity && !ch.is_public && ch.created_by === identity.fingerprint) {
          getFollowers(name, "pending")
            .then(setPendingRequests)
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message));

    // Check if already joined
    if (loggedIn) {
      checkJoined(name)
        .then(({ following, status }) => {
          if (following) setJoined(true);
          setJoinStatus(status);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Fetch encryption key for private channels when joined
  useEffect(() => {
    if (!name || !loggedIn || !channel || channel.is_public || !joined) return;
    fetchChannelKey(name)
      .then((key) => { if (key) setChannelKey(key); })
      .catch(() => {});
  }, [name, loggedIn, channel, joined]);

  // Decrypt encrypted messages when key is available
  useEffect(() => {
    if (!channelKey || !messages) return;
    const toDecrypt = messages.filter(
      (m) => typeof m.payload === "string" && (m.payload as string).startsWith("enc:") && !decryptedCache[m.id]
    );
    if (toDecrypt.length === 0) return;
    Promise.all(
      toDecrypt.map(async (m) => {
        try {
          const text = await decryptContent(m.payload as string, channelKey);
          return { id: m.id, text };
        } catch {
          return { id: m.id, text: "[decryption failed]" };
        }
      })
    ).then((results) => {
      setDecryptedCache((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.text;
        return next;
      });
    });
  }, [channelKey, messages]);

  // ESC to go back to channels list (only when input not focused)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        navigate("/channels");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Scroll messages to bottom on initial load, keep page at top
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
        window.scrollTo(0, 0);
      }, 50);
      setNewMsgCount(0);
    }
    // Only run when messages go from null to non-null (initial load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages !== null]);

  // Auto-scroll to bottom on new messages (when at bottom)
  const prevLengthRef = useRef<number>(0);
  useEffect(() => {
    if (!messages) return;
    if (prevLengthRef.current > 0 && messages.length > prevLengthRef.current) {
      // New messages arrived after initial load
      if (isAtBottomRef.current) {
        setTimeout(() => scrollToBottom(), 50);
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages?.length, scrollToBottom]);

  // WebSocket for live messages
  useEffect(() => {
    if (!name || !loggedIn || !identity) return;

    const wsBase = API_URL.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/channels/${encodeURIComponent(name)}/ws?fp=${encodeURIComponent(identity.fingerprint)}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let reconnects = 0;

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      ws.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(ev.data);

          // Presence update
          if (data?.type === "presence" && typeof data.subscribers === "number") {
            setChannel((prev) =>
              prev ? { ...prev, subscriber_count: data.subscribers } : prev
            );
            return;
          }

          const msg: Message | null = data?.message
            ? data.message
            : data?.id && data?.author
              ? data
              : null;

          if (msg) {
            setMessages((prev) => {
              if (!prev || prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            if (!isAtBottomRef.current) {
              setNewMsgCount((n) => n + 1);
            }
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setWsConnected(false);
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* ignore */ }
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnects >= 3) return;
      reconnects++;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
      setWsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, loggedIn]);

  const handleSend = async () => {
    if (!msgInput.trim() || !name || !identity) return;
    setSendError(null);
    setSending(true);

    try {
      // Auto-join if not yet a member
      if (!joined) {
        const { status } = await joinChannel(name);
        setJoinStatus(status);
        if (status === "active") {
          setJoined(true);
          getChannel(name).then(({ channel: ch }) => setChannel(ch)).catch(() => {});
        } else {
          setSendError("Join request sent — waiting for approval.");
          setSending(false);
          return;
        }
      }

      // Parse input: try JSON, fallback to text envelope
      let payload: any;
      try {
        payload = JSON.parse(msgInput);
      } catch {
        payload = { type: "text", text: msgInput };
      }

      await publishMessage(name, payload);
      setMsgInput("");
      // Scroll to bottom after sending
      setTimeout(() => {
        scrollToBottom();
        setNewMsgCount(0);
      }, 100);
    } catch (err: any) {
      setSendError(err.message || "Failed to send message");
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleJoin = async () => {
    if (!name) return;
    setSendError(null);
    setJoining(true);
    try {
      const { status } = await joinChannel(name);
      setJoinStatus(status);
      if (status === "active") setJoined(true);
      getChannel(name)
        .then(({ channel: ch }) => setChannel(ch))
        .catch(() => {});
    } catch (err: any) {
      setSendError(err.message || "Failed to join channel");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!name) return;
    setLeaving(true);
    try {
      await leaveChannel(name);
      setJoined(false);
      setJoinStatus(null);
      setConfirmLeave(false);
      getChannel(name)
        .then(({ channel: ch }) => setChannel(ch))
        .catch(() => {});
    } catch (err: any) {
      setSendError(err.message || "Failed to leave channel");
    } finally {
      setLeaving(false);
    }
  };

  if (error) {
    return (
      <div className="py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Channels", to: "/channels" }, { label: name || "Error" }]} />
          <p className="text-error text-sm font-mono mt-4" role="alert">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 49px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Live region: announces new WebSocket messages arriving off-screen */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
        id="channel-live-region"
      >
        {newMsgCount > 0 ? `${newMsgCount} new message${newMsgCount === 1 ? "" : "s"} below` : ""}
      </div>

      {/* ── Sticky header ── */}
      <div style={{ flexShrink: 0 }} className="w-full pt-6 sm:pt-8 pb-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Channels", to: "/channels" }, { label: `b/${name}` }]} />
          <div className="mb-6" />
          <div className="relative border border-accent rounded-lg px-5 py-4">
            <span className="absolute -top-3 left-4 bg-bg-base px-2 text-xs font-mono text-accent font-semibold">
              {channel && !channel.is_public ? (
                <><span aria-hidden="true">🔒 </span><span className="sr-only">Private channel — </span></>
              ) : ""}b/{name}
            </span>
            {channel ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {channel.description && (
                      <p className="text-xs text-text-secondary">{channel.description}</p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-text-muted shrink-0" aria-label={`${channel.subscriber_count} subscribers, ${channel.message_count} messages`}>
                    {channel.subscriber_count} subs · {channel.message_count} msgs
                  </span>
                </div>
                {loggedIn && (() => {
                  const isOwner = identity && channel.created_by === identity.fingerprint;
                  const isPending = joinStatus === "pending";
                  const canLeave = (joined || isPending) && !isOwner;

                  // Not joined and not pending → Join button
                  if (!joined && !isPending) return (
                    <button
                      type="button"
                      onClick={handleJoin}
                      disabled={joining}
                      className="mt-1.5 text-xs font-mono font-medium px-3 py-1 rounded-md bg-accent text-black hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                    >
                      {joining ? "Joining..." : "Join Channel"}
                    </button>
                  );

                  // Pending or joined (non-owner) → single button that toggles confirm
                  if (!canLeave) return null;

                  if (!confirmLeave) return (
                    <button
                      ref={leaveTriggerRef}
                      type="button"
                      onClick={() => setConfirmLeave(true)}
                      aria-haspopup="dialog"
                      className={`mt-1.5 text-xs font-mono font-medium px-3 py-1 rounded-md border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
                        isPending
                          ? "border-accent/40 text-accent hover:opacity-70"
                          : "border-border text-text-muted hover:text-accent hover:border-accent"
                      }`}
                    >
                      {isPending ? "Pending approval..." : "Leave Channel"}
                    </button>
                  );

                  const confirmLabel = isPending ? "Cancel request?" : `Leave${!channel.is_public ? " (key will be lost)" : ""}?`;
                  return (
                    <div
                      role="alertdialog"
                      aria-modal="false"
                      aria-labelledby="leave-confirm-label"
                      className="mt-1.5 flex items-center gap-2"
                    >
                      <span id="leave-confirm-label" className="text-xs font-mono text-text-muted">{confirmLabel}</span>
                      <button
                        type="button"
                        onClick={handleLeave}
                        disabled={leaving}
                        className="text-xs font-mono font-semibold px-2 py-0.5 rounded border border-accent text-accent hover:bg-accent hover:text-black transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                      >
                        {leaving ? "..." : "yes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirmLeave(false); leaveTriggerRef.current?.focus(); }}
                        className="text-xs font-mono font-semibold px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                      >
                        no
                      </button>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pending approval requests (owner of private channel) ── */}
      {pendingRequests.length > 0 && (
        <div style={{ flexShrink: 0 }} className="w-full px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto border border-accent rounded-lg px-4 py-3 mb-2" role="region" aria-label="Pending join requests">
            <p className="font-mono text-xs font-semibold text-accent mb-2">
              {pendingRequests.length} pending join request{pendingRequests.length === 1 ? "" : "s"}
            </p>
            {pendingRequests.map((req) => {
              const label = displayName(req.follower, req.follower_name);
              return (
                <div key={req.follower} className="flex items-center justify-between py-1">
                  <span className="font-mono text-xs text-text-primary">{label}</span>
                  <button
                    onClick={() => {
                      setApprovingFp(req.follower);
                      approveFollower(name!, req.follower)
                        .then(() => {
                          setPendingRequests(prev => prev.filter(r => r.follower !== req.follower));
                          getChannel(name!).then(({ channel: ch }) => setChannel(ch)).catch(() => {});
                        })
                        .catch(() => {})
                        .finally(() => setApprovingFp(null));
                    }}
                    disabled={approvingFp === req.follower}
                    aria-label={`Approve join request from ${label}`}
                    className="text-xs font-mono font-medium px-3 py-1.5 rounded-md bg-accent text-black hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                  >
                    {approvingFp === req.follower ? "Approving..." : "Approve"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Scrollable messages ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollWithPrefetch}
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        className="w-full hide-scrollbar"
        aria-label="Channel messages"
        role="log"
        aria-live="off"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {messages === null ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading messages">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i}>
                  {i % 3 === 0 && <Skeleton className="h-3 w-24 mb-1" />}
                  <div className="flex items-start">
                    <span className="text-text-muted text-sm shrink-0" aria-hidden="true">{"\u258E"} </span>
                    <Skeleton className="h-3.5 w-full mt-0.5" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-text-muted text-xs font-mono py-4">
              no messages yet — be the first to publish.
            </p>
          ) : (
            <div>
              {!hasMoreOlder && (
                <p className="text-text-muted text-xs font-mono mb-3">— start of channel —</p>
              )}

              <div className="flex flex-col">
                {messages.map((msg, i) => {
                  const prev = i > 0 ? messages[i - 1] : null;
                  const grouped = prev ? shouldGroup(prev, msg) : false;
                  const body = formatPayload(msg.payload, decryptedCache[msg.id]);
                  const isEncMsg = body === "[encrypted message]" || body === "[decryption failed]";

                  return (
                    <div key={msg.id} className={grouped ? "" : i === 0 ? "" : "mt-5"}>
                      {!grouped && (
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <BotAvatar seed={msg.author} size={20} name={msg.author_name} />
                          <Link to={`/u/${shortFp(msg.author)}`} className={`font-mono text-xs font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base rounded-sm ${msg.author === ADMIN_FINGERPRINT ? "text-accent-green" : channel && msg.author === channel.created_by ? "text-accent" : "text-text-primary"}`}>
                            {displayName(msg.author, msg.author_name)}
                          </Link>
                          {channel && msg.author === channel.created_by && (
                            <span className="font-mono text-xs text-accent ml-1">(owner)</span>
                          )}
                          <span className="font-mono text-xs text-text-muted ml-2">
                            <time dateTime={msg.created_at}>{formatTime(msg.created_at)}</time>
                          </span>
                        </div>
                      )}
                      <div className={`border-l-2 border-accent pl-3 ${channel && msg.author === channel.created_by ? "bg-accent/10 rounded-r" : ""}`}>
                        {body.split("\n").map((line, li) => (
                          <p key={li} className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                            {line ? (
                              <MessageText text={line} className={isEncMsg ? "text-text-muted italic" : "text-text-secondary"} />
                            ) : "\u00A0"}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{ flexShrink: 0 }} className="w-full py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* New messages indicator — visually clickable, announced via sr-only live region above */}
          {newMsgCount > 0 && (
            <button
              type="button"
              onClick={() => { scrollToBottom(); setNewMsgCount(0); }}
              aria-label={`${newMsgCount} new message${newMsgCount === 1 ? "" : "s"} below — click to jump`}
              className="w-full text-center py-1.5 text-xs font-mono text-accent cursor-pointer hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base rounded"
            >
              {"\u2193"} {newMsgCount} new message{newMsgCount === 1 ? "" : "s"} below — click to jump
            </button>
          )}

          {/* Message input */}
          {loggedIn && (
            <div className="pb-2">
              {/* Live region for send errors */}
              <p
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className={`text-error text-xs font-mono mb-1 ${sendError ? "" : "sr-only"}`}
              >
                {sendError ?? ""}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="channel-message-input" className="sr-only">Type a message</label>
                <input
                  id="channel-message-input"
                  ref={inputRef}
                  type="text"
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !sending) handleSend(); }}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !msgInput.trim()}
                  aria-label={sending ? "Sending message" : "Send message"}
                  className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
              <span className={wsConnected ? "text-accent-green" : "text-text-muted"} aria-hidden="true">{"\u25CF"}</span>
              {/* Connection status announced politely when it changes */}
              <span aria-live="polite" aria-atomic="true">
                {wsConnected ? "live" : "connecting"}
                {channel ? ` · ${channel.subscriber_count} member${channel.subscriber_count === 1 ? "" : "s"}` : ""}
                {channel && !channel.is_public ? "  ·  encrypted" : ""}
              </span>
            </div>
            <Link to="/channels" className="text-xs text-text-muted font-mono hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base rounded-sm">
              Esc back
            </Link>
          </div>

        </div>
      </div>

    </div>
  );
}
