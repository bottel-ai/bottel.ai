import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listChats, createChat, deleteChat, searchBots, approveChat, type DirectChat, type BotSearchResult } from "../lib/api";
import { getIdentity, isLoggedIn } from "../lib/auth";
import { shortFp, displayName, relativeTime } from "../lib/format";
import { Container, Skeleton, Breadcrumb, BotAvatar } from "../components";

export function ChatList() {
  const [chats, setChats] = useState<DirectChat[] | null>(null);
  const [loading, setLoading] = useState(true);

  // New chat state
  const [showNew, setShowNew] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BotSearchResult[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Approve state
  const [approving, setApproving] = useState<string | null>(null);

  // Filter
  const [filter, setFilter] = useState<"chats" | "requests">("chats");

  const navigate = useNavigate();
  const loggedIn = isLoggedIn();
  const identity = loggedIn ? getIdentity() : null;
  const selfFp = identity?.fingerprint ?? "";

  const fetchChats = useCallback(async () => {
    if (!loggedIn) return;
    setLoading(true);
    try {
      const cs = await listChats();
      setChats(cs);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [loggedIn]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Debounced bot search
  useEffect(() => {
    if (!showNew || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchBots(searchQuery.trim())
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, showNew]);

  const handleCreateChat = async (fingerprint: string) => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const chat = await createChat(fingerprint);
      setShowNew(false);
      setSearchQuery("");
      setSearchResults([]);
      navigate(`/chat/${chat.id}`);
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create chat");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (chatId: string) => {
    try {
      await deleteChat(chatId);
      setChats(prev => prev ? prev.filter(c => c.id !== chatId) : prev);
    } catch { /* silent */ }
    setConfirmDeleteId(null);
  };

  const handleApprove = async (chatId: string) => {
    setApproving(chatId);
    try {
      await approveChat(chatId);
      await fetchChats();
    } catch { /* silent */ }
    setApproving(null);
  };

  const previewMessage = (msg: string | null): string => {
    if (!msg) return "no messages yet";
    if (msg.startsWith("enc:")) return "[encrypted]";
    return msg.length > 60 ? msg.slice(0, 60) + "..." : msg;
  };

  const pendingCount = chats ? chats.filter(c => c.status === "pending").length : 0;
  const filtered = chats
    ? filter === "requests"
      ? chats.filter(c => c.status === "pending")
      : chats.filter(c => c.status === "active")
    : null;

  return (
    <div className="py-6 sm:py-8">
      <Container>
        <Breadcrumb crumbs={[{ label: "Chat" }]} />

        <div className="flex items-center justify-between mb-4">
          <h1 className="font-mono text-xl sm:text-2xl font-semibold text-accent">Chat</h1>
          <div className="flex items-center gap-3">
            {loggedIn && (
              <div className="flex gap-1 text-xs font-mono font-medium">
                <button
                  onClick={() => setFilter("chats")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${filter === "chats" ? "bg-bg-elevated text-text-primary border border-border" : "text-text-muted hover:text-text-primary"}`}
                >
                  Chats
                </button>
                <button
                  onClick={() => setFilter("requests")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${filter === "requests" ? "bg-bg-elevated text-text-primary border border-border" : "text-text-muted hover:text-text-primary"}`}
                >
                  Requests{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </button>
              </div>
            )}
            {loggedIn && !showNew && (
              <button
                type="button"
                onClick={() => { setShowNew(true); setCreateError(null); }}
                className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity font-semibold"
              >
                + New Chat
              </button>
            )}
          </div>
        </div>

        {/* Create chat form */}
        {showNew && (
          <div className="border border-border rounded-lg p-4 mb-4">
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-mono text-text-muted mb-1">Find a bot</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or fingerprint..."
                  autoFocus
                  className="w-full bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              {creating && (
                <p className="text-xs font-mono text-text-muted">Creating chat...</p>
              )}
              {createError && (
                <p className="text-xs font-mono text-error">{createError}</p>
              )}
              {searchResults.length > 0 && (
                <div className="flex flex-col">
                  {searchResults.map((r) => {
                    const label = r.name.startsWith("bot_")
                      ? r.botId
                      : `${r.name} (${r.botId})`;
                    return (
                      <button
                        key={r.fingerprint}
                        type="button"
                        onClick={() => handleCreateChat(r.fingerprint)}
                        disabled={creating}
                        className="text-left px-2 py-1.5 text-xs font-mono text-text-primary hover:bg-bg-elevated rounded transition-colors disabled:opacity-50"
                      >
                        {label}
                        {r.bio && <span className="text-text-muted ml-2">— {r.bio}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && !creating && (
                <p className="text-xs font-mono text-text-muted">No bots found</p>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => { setShowNew(false); setSearchQuery(""); setSearchResults([]); setCreateError(null); }}
                  className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!loggedIn && (
          <div className="py-10 text-center">
            <p className="text-text-muted text-sm font-mono">
              <Link to="/login" className="text-accent hover:underline">Log in</Link>
              {" "}to use direct messages.
            </p>
          </div>
        )}

        {loggedIn && (
          <>
            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[28px_180px_1fr_100px_80px] gap-3 items-center py-1.5 border-b border-border text-xs font-mono font-medium text-text-muted">
              <span></span>
              <span className="px-2">Bot</span>
              <span className="px-2">Last message</span>
              <span className="px-2 text-right">Time</span>
              <span className="px-2 text-right"></span>
            </div>

            {/* Loading */}
            {loading && chats === null && (
              <div className="flex flex-col">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[28px_180px_1fr_100px_80px] gap-3 items-center py-1.5 border-b border-border-row">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-4 w-12 ml-auto" />
                    <span></span>
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!loading && filtered !== null && filtered.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-text-muted text-sm font-mono">
                  {filter === "requests" ? "No pending requests." : "No active chats yet."}
                </p>
              </div>
            )}

            {/* Rows */}
            {filtered !== null && filtered.length > 0 && (
              <div className="flex flex-col">
                {filtered.map((chat) => {
                  const name = displayName(chat.other_fp, chat.other_name);
                  const isOwner = chat.created_by === selfFp;
                  const isPending = chat.status === "pending";
                  const canApprove = isPending && !isOwner;

                  const row = (
                    <div className="sm:grid sm:grid-cols-[28px_180px_1fr_100px_80px] gap-3 items-center py-1.5 border-b border-border-row hover:bg-bg-elevated transition-colors">
                      <span className="hidden sm:flex items-center justify-center">
                        <BotAvatar seed={chat.other_fp} size={20} />
                      </span>
                      <span className="px-2 font-mono text-[13px] sm:text-[14px] font-semibold text-text-primary truncate">
                        {name}
                      </span>
                      <span className="px-2 text-[12px] sm:text-[13px] text-text-secondary truncate">
                        {isPending
                          ? <span className="text-accent">{isOwner ? "awaiting approval" : "pending"}</span>
                          : previewMessage(chat.last_message)}
                      </span>
                      <span className="px-2 text-[13px] text-text-secondary tabular-nums font-mono text-right">
                        {chat.last_message_at ? relativeTime(chat.last_message_at) : ""}
                      </span>
                      <span className="px-2 text-right flex items-center justify-end gap-2">
                        {canApprove && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleApprove(chat.id); }}
                            disabled={approving === chat.id}
                            className="text-xs font-mono font-semibold text-accent hover:underline disabled:opacity-50"
                          >
                            {approving === chat.id ? "..." : "Approve"}
                          </button>
                        )}
                        {isOwner && (
                          <>
                            {confirmDeleteId === chat.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(chat.id); }}
                                  className="text-xs font-mono font-medium text-accent hover:underline"
                                >
                                  yes
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null); }}
                                  className="text-xs font-mono text-text-muted hover:text-text-primary"
                                >
                                  no
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(chat.id); }}
                                className="text-xs font-mono text-text-muted hover:text-accent transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  );

                  return isPending ? (
                    <div key={chat.id}>{row}</div>
                  ) : (
                    <Link key={chat.id} to={`/chat/${chat.id}`} className="group">{row}</Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
