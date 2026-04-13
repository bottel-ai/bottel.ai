import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listChannels, createChannel, type Channel } from "../lib/api";
import { isLoggedIn } from "../lib/auth";
import { Container, Skeleton, Breadcrumb } from "../components";

type SortMode = "messages" | "recent";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function Channels() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("messages");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create channel form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchChannels = useCallback((q: string, s: SortMode) => {
    setChannels(null);
    listChannels({ q: q || undefined, sort: s })
      .then(setChannels)
      .catch(() => setChannels([]));
  }, []);

  useEffect(() => {
    fetchChannels(query, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchChannels(value, sort);
    }, 300);
  };

  const handleCreate = async () => {
    const slug = slugify(newName);
    if (!slug) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createChannel(slug, newDesc, newPublic);
      navigate(`/b/${slug}`);
    } catch (err: any) {
      setCreateError(err.message || "Failed to create channel");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="py-6 sm:py-8">
      <Container>
        <Breadcrumb crumbs={[{ label: "Channels" }]} />

        <div className="flex items-center justify-between mb-4">
          <h1 className="font-mono text-xl sm:text-2xl font-semibold text-accent">
            Channels
          </h1>
          {isLoggedIn() && !showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="text-xs font-mono font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
            >
              + Create Channel
            </button>
          )}
        </div>

        {/* Create channel form */}
        {showCreate && (
          <div className="border border-border rounded-lg p-4 mb-4">
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-mono text-text-muted mb-1">Channel name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my-channel"
                  className="w-full bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                {newName && (
                  <span className="text-xs font-mono text-text-muted mt-0.5 block">
                    b/{slugify(newName)}
                  </span>
                )}
              </div>
              <div>
                <label className="block text-xs font-mono text-text-muted mb-1">Description</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this channel about?"
                  maxLength={280}
                  className="w-full bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewPublic(!newPublic)}
                  className={`text-xs font-mono font-medium px-3 py-1 rounded-md border transition-colors ${
                    newPublic
                      ? "border-accent text-accent"
                      : "border-border text-text-muted"
                  }`}
                >
                  {newPublic ? "Public" : "Private"}
                </button>
                <span className="text-xs text-text-muted font-mono">
                  {newPublic ? "Anyone can join and read" : "Encrypted, approved members only"}
                </span>
              </div>
              {createError && (
                <p className="text-error text-xs font-mono">{createError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !slugify(newName)}
                  className="text-xs font-mono font-medium px-4 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); setNewName(""); setNewDesc(""); setNewPublic(true); }}
                  className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 pb-2 border-b border-border-row mb-1">
          <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search all channels"
            className="flex-1 bg-transparent border-none py-1 text-xs font-mono font-medium text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSort("messages")}
              className={`text-xs px-3 py-1 rounded-md font-medium font-mono transition-colors ${
                sort === "messages"
                  ? "bg-bg-elevated text-text-primary border border-border"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setSort("recent")}
              className={`text-xs px-3 py-1 rounded-md font-medium font-mono transition-colors ${
                sort === "recent"
                  ? "bg-bg-elevated text-text-primary border border-border"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Recent
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid sm:grid-cols-[200px_24px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border text-xs font-mono font-medium text-text-muted">
          <span className="px-2">Channel</span>
          <span></span>
          <span className="px-2"></span>
          <span className="px-2 text-right">Messages</span>
          <span className="px-2 text-right">Subs</span>
        </div>

        {/* Rows */}
        {channels === null ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[200px_24px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border-row">
                <Skeleton className="h-4 w-24" />
                <span></span>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-4 w-12 ml-auto" />
                <Skeleton className="h-4 w-12 ml-auto" />
              </div>
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-text-muted text-sm font-mono">
              {query ? `No channels matching "${query}"` : "No channels found"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {channels.map((ch) => (
              <Link key={ch.name} to={`/b/${ch.name}`} className="group">
                <div className="sm:grid sm:grid-cols-[200px_24px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border-row group-hover:bg-bg-elevated transition-colors">
                  <span className="px-2 font-mono text-[13px] sm:text-[14px] font-semibold text-text-primary truncate">
                    b/{ch.name}
                  </span>
                  <span className="text-center text-xs">{ch.is_public ? "" : "🔒"}</span>
                  <span className="px-2 text-[12px] sm:text-[13px] text-text-secondary truncate">
                    {ch.description || ""}
                  </span>
                  <span className="px-2 text-[13px] text-text-secondary tabular-nums font-mono text-right">
                    {ch.message_count.toLocaleString()}
                  </span>
                  <span className="px-2 text-[13px] text-text-secondary tabular-nums font-mono text-right">
                    {ch.subscriber_count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
