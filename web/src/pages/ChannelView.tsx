import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getChannel, joinChannel, checkJoined, publishMessage, loadOlderMessages, API_URL, type Channel } from "../lib/api";
import { getIdentity, isLoggedIn } from "../lib/auth";
import { displayName, formatTime } from "../lib/format";
import { Skeleton, Breadcrumb } from "../components";

interface Message {
  id: string;
  channel: string;
  author: string;
  author_name?: string | null;
  payload: unknown;
  created_at: string;
}

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") {
    if (payload.startsWith("enc:")) return "[encrypted message]";
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
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Message input state
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Join state
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

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
  const [loadingOlder, setLoadingOlder] = useState(false);
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
    if (!name) return;
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
      })
      .catch((err) => setError(err.message));

    // Check if already joined
    if (loggedIn) {
      checkJoined(name)
        .then(({ following }) => { if (following) setJoined(true); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages && messages.length > 0) {
      // Use instant scroll on first load
      setTimeout(() => scrollToBottom(), 50);
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
    if (!joined) {
      setSendError("Join this channel first before posting.");
      return;
    }
    setSendError(null);
    setSending(true);

    try {
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
    }
  };

  const handleJoin = async () => {
    if (!name) return;
    setSendError(null);
    setJoining(true);
    try {
      await joinChannel(name);
      setJoined(true);
      // Reload channel info
      getChannel(name)
        .then(({ channel: ch }) => setChannel(ch))
        .catch(() => {});
    } catch (err: any) {
      setSendError(err.message || "Failed to join channel");
    } finally {
      setJoining(false);
    }
  };

  if (error) {
    return (
      <div className="py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Channels", to: "/channels" }, { label: name || "Error" }]} />
          <p className="text-error text-sm font-mono mt-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 49px)", display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ── */}
      <div style={{ flexShrink: 0 }} className="w-full pt-6 sm:pt-8 pb-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Channels", to: "/channels" }, { label: `b/${name}` }]} />
          <div className="mb-4" />
          <div className="border border-border rounded-lg px-5 py-2">
            {channel ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-accent">
                    {!channel.is_public && "\u{1F512} "}b/{channel.name}
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    {channel.subscriber_count} subs · {channel.message_count} msgs
                  </span>
                </div>
                {channel.description && (
                  <p className="text-xs text-text-secondary mt-0.5">{channel.description}</p>
                )}
                {!channel.is_public && (
                  <p className="text-xs text-text-muted mt-1">Private · encrypted · approved members only</p>
                )}
                {loggedIn && !joined && (
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={joining}
                    className="mt-1.5 text-xs font-mono font-medium px-3 py-1 rounded-md bg-accent text-bg-primary hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {joining ? "Joining..." : "Join Channel"}
                  </button>
                )}
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

      {/* ── Scrollable messages ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollWithPrefetch}
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        className="w-full hide-scrollbar"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {messages === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i}>
                  {i % 3 === 0 && <Skeleton className="h-3 w-24 mb-1" />}
                  <div className="flex items-start">
                    <span className="text-text-muted text-sm shrink-0">{"\u258E"} </span>
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
            <div className="flex flex-col">
              {loadingOlder && (
                <p className="text-text-muted text-xs font-mono mb-3">loading older messages...</p>
              )}
              {!hasMoreOlder && (
                <p className="text-text-muted text-xs font-mono mb-3">— start of channel —</p>
              )}

              {messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const grouped = prev ? shouldGroup(prev, msg) : false;
                const body = formatPayload(msg.payload);
                const isEncMsg = body === "[encrypted message]" || body === "[decryption failed]";

                return (
                  <div key={msg.id} className={grouped ? "" : i === 0 ? "" : "mt-5"}>
                    {!grouped && (
                      <div className="mb-0.5">
                        <span className={`font-mono text-xs font-bold ${channel && msg.author === channel.created_by ? "text-accent" : "text-text-primary"}`}>
                          {displayName(msg.author, msg.author_name)}
                        </span>
                        {channel && msg.author === channel.created_by && (
                          <span className="font-mono text-xs text-accent ml-1">(owner)</span>
                        )}
                        <span className="font-mono text-xs text-text-muted ml-2">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    )}
                    {body.split("\n").map((line, li) => (
                      <div key={li} className="flex">
                        <span className="text-accent/60 text-sm shrink-0 select-none">{"\u258E"} </span>
                        <span className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${isEncMsg ? "text-text-muted italic" : "text-text-secondary"}`}>
                          {line || "\u00A0"}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{ flexShrink: 0 }} className="w-full py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* New messages indicator */}
          {newMsgCount > 0 && (
            <div
              onClick={() => { scrollToBottom(); setNewMsgCount(0); }}
              className="text-center py-1.5 text-xs font-mono text-accent cursor-pointer hover:text-text-primary transition-colors"
            >
              {"\u2193"} {newMsgCount} new message{newMsgCount === 1 ? "" : "s"} below — click to jump
            </div>
          )}

          {/* Message input */}
          {loggedIn && (
            <div className="pb-2">
              {sendError && (
                <p className="text-error text-xs font-mono mb-1">{sendError}</p>
              )}
              <div className="flex items-center gap-2">
                <input
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
                  className="text-xs font-mono font-medium px-3 py-1.5 rounded-md bg-accent text-bg-primary hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
              <span className={wsConnected ? "text-accent-green" : "text-text-muted"}>{"\u25CF"}</span>
              <span>
                {wsConnected ? "live" : "connecting"}
                {channel ? ` · ${channel.subscriber_count} member${channel.subscriber_count === 1 ? "" : "s"}` : ""}
                {channel && !channel.is_public ? "  ·  encrypted" : ""}
              </span>
            </div>
            <Link to="/channels" className="text-xs text-text-muted font-mono hover:text-text-primary transition-colors">
              Esc back
            </Link>
          </div>

        </div>
      </div>

    </div>
  );
}
