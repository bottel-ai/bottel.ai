import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getChatMessages, sendDirectMessage, fetchChatKey, API_URL, type DirectMessage } from "../lib/api";
import { getIdentity, isLoggedIn } from "../lib/auth";
import { displayName, formatTime, shortFp, ADMIN_FINGERPRINT } from "../lib/format";
import { isEncrypted, decryptContent } from "../lib/crypto";
import { Breadcrumb, Skeleton, BotAvatar, MessageText } from "../components";

function shouldGroup(prev: DirectMessage, curr: DirectMessage): boolean {
  if (prev.sender !== curr.sender) return false;
  const p = new Date(prev.created_at).getTime();
  const c = new Date(curr.created_at).getTime();
  return Math.abs(c - p) < 60_000;
}

export function ChatView() {
  const { id: chatId } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Message input
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll tracking
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  // WebSocket
  const [wsConnected, setWsConnected] = useState(false);

  // Encryption key
  const [chatKey, setChatKey] = useState<string | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});

  const loggedIn = isLoggedIn();
  const identity = loggedIn ? getIdentity() : null;
  const selfFp = identity?.fingerprint ?? "";

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

  // Track if chat is pending approval
  const [pending, setPending] = useState(false);

  // Fetch chat key + messages on mount
  const loadChat = useCallback(() => {
    if (!chatId || !loggedIn) return;

    fetchChatKey(chatId)
      .then((k) => {
        if (k) {
          setChatKey(k);
          setPending(false);
          setError(null);
          // Fetch messages now that we have the key
          getChatMessages(chatId)
            .then((msgs) => {
              const sorted = [...msgs].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              setMessages(sorted);
            })
            .catch((err) => setError(err?.message || "Failed to load messages"));
        }
      })
      .catch((err) => {
        const msg = err?.message || "";
        if (msg.includes("403") || msg.toLowerCase().includes("pending") || msg.toLowerCase().includes("approved")) {
          setPending(true);
        } else {
          setError(msg || "Failed to load chat");
        }
      });
  }, [chatId, loggedIn]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  // Poll for approval when chat is pending (every 5 seconds)
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      loadChat();
    }, 5000);
    return () => clearInterval(interval);
  }, [pending, loadChat]);

  // Decrypt messages when key becomes available or messages change
  useEffect(() => {
    if (!chatKey || !messages) return;
    let cancelled = false;

    const decrypt = async () => {
      const newCache: Record<string, string> = { ...decryptedCache };
      let updated = false;
      for (const msg of messages) {
        if (newCache[msg.id] !== undefined) continue;
        if (isEncrypted(msg.content)) {
          try {
            newCache[msg.id] = await decryptContent(msg.content, chatKey);
            updated = true;
          } catch {
            newCache[msg.id] = "[decryption failed]";
            updated = true;
          }
        }
      }
      if (updated && !cancelled) {
        setDecryptedCache(newCache);
      }
    };
    decrypt();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatKey, messages]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
        window.scrollTo(0, 0);
      }, 50);
      setNewMsgCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages !== null]);

  // Auto-scroll on new messages
  const prevLengthRef = useRef<number>(0);
  useEffect(() => {
    if (!messages) return;
    if (prevLengthRef.current > 0 && messages.length > prevLengthRef.current) {
      if (isAtBottomRef.current) {
        setTimeout(() => scrollToBottom(), 50);
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages?.length, scrollToBottom]);

  // WebSocket for live messages
  useEffect(() => {
    if (!chatId || !loggedIn || !identity) return;

    const wsBase = API_URL.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/chat/${encodeURIComponent(chatId)}/ws?fp=${encodeURIComponent(identity.fingerprint)}`;

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
          const incoming: DirectMessage | null = data?.message
            ? data.message
            : data?.id && data?.sender
              ? data
              : null;

          if (incoming) {
            setMessages((prev) => {
              if (!prev || prev.some((m) => m.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
            if (!isAtBottomRef.current) {
              setNewMsgCount((n) => n + 1);
            }
          }
        } catch { /* ignore */ }
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
      if (cancelled || reconnects >= 3) return;
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
  }, [chatId, loggedIn]);

  const handleSend = async () => {
    if (!msgInput.trim() || !chatId || !identity) return;
    setSendError(null);
    setSending(true);

    try {
      await sendDirectMessage(chatId, msgInput);
      setMsgInput("");
      setTimeout(() => {
        scrollToBottom();
        setNewMsgCount(0);
      }, 100);
    } catch (err: any) {
      setSendError(err?.message || "Failed to send message");
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // Derive other participant name from messages
  const otherName = (() => {
    if (!messages) return "Direct Message";
    const otherMsg = messages.find((m) => m.sender !== selfFp);
    if (otherMsg?.sender_name) return displayName(otherMsg.sender, otherMsg.sender_name);
    if (otherMsg) return displayName(otherMsg.sender, null);
    return "Direct Message";
  })();

  const getDisplayContent = (msg: DirectMessage): string => {
    if (decryptedCache[msg.id] !== undefined) return decryptedCache[msg.id];
    if (isEncrypted(msg.content)) return "[encrypted message]";
    return msg.content;
  };

  if (pending) {
    return (
      <div className="py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Chat", to: "/chat" }, { label: "Pending" }]} />
          <div className="border border-accent rounded-lg p-6 mt-4 text-center">
            <p className="font-mono text-sm text-accent mb-2">Waiting for approval</p>
            <p className="text-xs text-text-muted">The other participant needs to approve this chat request. This page will update automatically.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Chat", to: "/chat" }, { label: "Error" }]} />
          <p className="text-error text-sm font-mono mt-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 49px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Sticky header */}
      <div style={{ flexShrink: 0 }} className="w-full pt-6 sm:pt-8 pb-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Chat", to: "/chat" }, { label: otherName }]} />
          <div className="mb-4" />
          <div className="border border-border rounded-lg px-5 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-accent">{otherName}</span>
              <span className="font-mono text-xs text-text-muted">direct message</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        className="w-full hide-scrollbar"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {messages === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
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
              No messages yet — say hello!
            </p>
          ) : (
            <div>
              <div className="flex flex-col">
                {messages.map((msg, i) => {
                  const prev = i > 0 ? messages[i - 1] : null;
                  const grouped = prev ? shouldGroup(prev, msg) : false;
                  const body = getDisplayContent(msg);
                  const isEncMsg = body === "[encrypted message]" || body === "[decryption failed]";

                  return (
                    <div key={msg.id} className={grouped ? "" : i === 0 ? "" : "mt-5"}>
                      {!grouped && (
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <BotAvatar seed={msg.sender} size={20} />
                          <Link to={`/u/${shortFp(msg.sender)}`} className={`font-mono text-xs font-bold hover:underline ${msg.sender === ADMIN_FINGERPRINT ? "text-accent-green" : msg.sender === selfFp ? "text-accent" : "text-text-primary"}`}>
                            {displayName(msg.sender, msg.sender_name)}
                          </Link>
                          {msg.sender === selfFp && (
                            <span className="font-mono text-xs text-accent ml-1">(you)</span>
                          )}
                          <span className="font-mono text-xs text-text-muted ml-2">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <div className="border-l-2 border-accent pl-3">
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

      {/* Sticky footer */}
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
                  className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-2">
            <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
              <span className={wsConnected ? "text-accent-green" : "text-text-muted"}>{"\u25CF"}</span>
              <span>{wsConnected ? "live" : "connecting"}</span>
            </div>
            <Link to="/chat" className="text-xs text-text-muted font-mono hover:text-text-primary transition-colors">
              Back to chats
            </Link>
          </div>

        </div>
      </div>

    </div>
  );
}
