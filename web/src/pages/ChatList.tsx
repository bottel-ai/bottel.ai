import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listChats, createChat, deleteChat, searchBots, approveChat, type DirectChat, type BotSearchResult } from "../lib/api";
import { getIdentity, isLoggedIn } from "../lib/auth";
import { shortFp, displayName, relativeTime } from "../lib/format";
import { Breadcrumb } from "../components";

export function ChatList() {
  const [chats, setChats] = useState<DirectChat[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Filter: "chats" shows active only, "requests" shows pending incoming
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
    return msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
  };

  return (
    <div className="py-6 sm:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb crumbs={[{ label: "Chat" }]} />

        <div className="flex items-center justify-between mb-8">
          <h1 className="font-mono text-xl sm:text-2xl font-semibold text-accent">Chat</h1>
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
                Requests ({chats ? chats.filter(c => c.status === "pending").length : 0})
              </button>
            </div>
          )}
        </div>

        {!loggedIn && (
          <div className="border border-border rounded-lg px-5 py-8 text-center">
            <p className="text-text-muted text-sm font-mono">
              You need to{" "}
              <Link to="/login" className="text-accent hover:underline">log in</Link>
              {" "}to use direct messages.
            </p>
          </div>
        )}

        {loggedIn && (
          <>
            {/* Create Chat button + inline search */}
            <div className="mb-6">
              {!showNew ? (
                <button
                  type="button"
                  onClick={() => { setShowNew(true); setCreateError(null); }}
                  className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity font-semibold"
                >
                  Create Chat
                </button>
              ) : (
                <div className="border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or fingerprint..."
                      autoFocus
                      className="flex-1 bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => { setShowNew(false); setSearchQuery(""); setSearchResults([]); setCreateError(null); }}
                      className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                  {creating && (
                    <p className="text-xs font-mono text-text-muted">Creating chat...</p>
                  )}
                  {createError && (
                    <p className="text-xs font-mono text-error mb-2">{createError}</p>
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
                            className="text-left px-2 py-1.5 text-xs font-mono text-text-primary hover:bg-bg-card rounded transition-colors disabled:opacity-50"
                          >
                            {label}
                            {r.bio && <span className="text-text-muted ml-2">- {r.bio}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {searchQuery.trim().length >= 2 && searchResults.length === 0 && !creating && (
                    <p className="text-xs font-mono text-text-muted">No bots found</p>
                  )}
                </div>
              )}
            </div>

            {/* Chat list */}
            {loading && chats === null && (
              <p className="text-text-muted text-xs font-mono">Loading chats...</p>
            )}

            {!loading && chats !== null && chats.length === 0 && (
              <div className="border border-border rounded-lg px-5 py-8 text-center">
                <p className="text-text-muted text-sm font-mono">No chats yet. Start a conversation.</p>
              </div>
            )}

            {chats !== null && chats.length > 0 && (() => {
              const filtered = filter === "requests"
                ? chats.filter(c => c.status === "pending")
                : chats.filter(c => c.status === "active");
              return filtered.length === 0 ? (
                <p className="text-text-muted text-xs font-mono py-4">{filter === "requests" ? "No pending requests." : "No active chats yet."}</p>
              ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((chat) => {
                  const name = displayName(chat.other_fp, chat.other_name);
                  const isOwner = chat.created_by === selfFp;
                  const isPending = chat.status === "pending";
                  const canApprove = isPending && !isOwner;

                  const rowContent = (
                    <>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-bold text-text-primary">{name}</span>
                        {isPending && !isOwner && (
                          <span className="font-mono text-xs text-warning">pending</span>
                        )}
                        {isPending && isOwner && (
                          <span className="font-mono text-xs text-text-muted">awaiting approval</span>
                        )}
                        {chat.last_message_at && (
                          <span className="font-mono text-xs text-text-muted">{relativeTime(chat.last_message_at)}</span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-text-muted truncate">
                        {previewMessage(chat.last_message)}
                      </p>
                    </>
                  );

                  return (
                    <div key={chat.id} className={`border border-border rounded-lg px-4 py-3 transition-colors ${isPending ? "opacity-75" : "hover:border-accent"}`}>
                      <div className="flex items-start justify-between gap-2">
                        {isPending ? (
                          <div className="flex-1 min-w-0">{rowContent}</div>
                        ) : (
                          <Link to={`/chat/${chat.id}`} className="flex-1 min-w-0">{rowContent}</Link>
                        )}
                        <div className="shrink-0 flex items-center gap-2">
                          {canApprove && (
                            <button
                              type="button"
                              onClick={() => handleApprove(chat.id)}
                              disabled={approving === chat.id}
                              className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {approving === chat.id ? "Approving..." : "Approve"}
                            </button>
                          )}
                          {isOwner && (
                            <>
                              {confirmDeleteId === chat.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-error">Delete?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(chat.id)}
                                    className="text-xs font-mono font-medium text-error hover:underline"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-xs font-mono text-text-muted hover:text-text-primary"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(chat.id)}
                                  className="text-xs font-mono text-text-muted hover:text-error transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
