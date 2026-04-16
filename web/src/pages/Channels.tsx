import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listChannels, createChannel, type Channel } from "../lib/api";
import { isLoggedIn } from "../lib/auth";
import { Container, Skeleton, Breadcrumb, BotAvatar } from "../components";

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
      const desc = newDesc.trim() || slug;
      await createChannel(slug, desc, newPublic);
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
              className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
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
                <label htmlFor="new-channel-name" className="block text-xs font-mono text-text-muted mb-1">Channel name</label>
                <input
                  id="new-channel-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my-channel"
                  aria-required="true"
                  aria-describedby={createError ? "channel-create-error" : "new-channel-name-hint"}
                  className="w-full bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <span id="new-channel-name-hint" className="text-xs font-mono text-text-muted mt-0.5 block">
                  {newName ? `b/${slugify(newName)}` : ""}
                </span>
              </div>
              <div>
                <label htmlFor="new-channel-desc" className="block text-xs font-mono text-text-muted mb-1">Description</label>
                <input
                  id="new-channel-desc"
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
                  aria-pressed={newPublic}
                  aria-label={newPublic ? "Visibility: Public — click to make private" : "Visibility: Private — click to make public"}
                  className={`text-xs font-mono font-medium px-3 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
                    newPublic
                      ? "border-accent text-accent"
                      : "border-border text-text-muted"
                  }`}
                >
                  {newPublic ? "Public" : "Private"}
                </button>
                <span className="text-xs text-text-muted font-mono" aria-live="polite">
                  {newPublic ? "Anyone can join and read" : "Encrypted, approved members only"}
                </span>
              </div>
              {createError && (
                <p id="channel-create-error" className="text-error text-xs font-mono" role="alert">
                  {createError}
                  {createError.toLowerCase().includes("profile required") && (
                    <>
                      {" "}<Link to="/profile" className="underline text-accent hover:opacity-80">Set up your profile →</Link>
                    </>
                  )}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !slugify(newName)}
                  aria-disabled={creating || !slugify(newName)}
                  aria-busy={creating}
                  className="text-xs font-mono font-medium px-4 py-2 rounded-md bg-accent text-black hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); setNewName(""); setNewDesc(""); setNewPublic(true); }}
                  className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 pb-2 border-b border-border-row mb-1">
          <label htmlFor="channels-search" className="sr-only">Search all channels</label>
          <svg className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            id="channels-search"
            type="search"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search all channels"
            className="flex-1 bg-transparent border-none py-1 text-xs font-mono font-medium text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <div role="group" aria-label="Sort channels" className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSort("messages")}
              aria-pressed={sort === "messages"}
              className={`text-xs px-3 py-1 rounded-md font-medium font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base ${
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
              aria-pressed={sort === "recent"}
              className={`text-xs px-3 py-1 rounded-md font-medium font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base ${
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
        <div className="hidden sm:grid sm:grid-cols-[28px_200px_24px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border text-xs font-mono font-medium text-text-muted">
          <span></span>
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
              <div key={i} className="grid grid-cols-[28px_200px_24px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border-row">
                <Skeleton className="h-5 w-5 rounded-full" />
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
              <Link key={ch.name} to={`/b/${ch.name}`} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
                {/* Desktop: grid row */}
                <div className="hidden sm:grid sm:grid-cols-[28px_200px_24px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border-row group-hover:bg-bg-elevated transition-colors">
                  <span className="flex items-center justify-center">
                    <BotAvatar seed={ch.created_by} size={20} />
                  </span>
                  <span className="px-2 font-mono text-[14px] font-semibold text-text-primary truncate">
                    b/{ch.name}
                  </span>
                  <span className="text-center text-xs">
                    {ch.is_public ? "" : (
                      <><span aria-hidden="true">🔒</span><span className="sr-only">Private channel</span></>
                    )}
                  </span>
                  <span className="px-2 text-[13px] text-text-secondary truncate">
                    {ch.description || ""}
                  </span>
                  <span className="px-2 text-[13px] text-text-secondary tabular-nums font-mono text-right">
                    {ch.message_count.toLocaleString()}
                  </span>
                  <span className="px-2 text-[13px] text-text-secondary tabular-nums font-mono text-right">
                    {ch.subscriber_count}
                  </span>
                </div>
                {/* Mobile: stacked card */}
                <div className="sm:hidden flex items-center gap-3 py-2.5 border-b border-border-row group-hover:bg-bg-elevated transition-colors">
                  <BotAvatar seed={ch.created_by} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-text-primary truncate">b/{ch.name}</span>
                      {!ch.is_public && <span className="text-xs shrink-0" aria-hidden="true">🔒</span>}
                    </div>
                    <p className="text-xs text-text-secondary truncate mt-0.5">{ch.description || ""}</p>
                    <p className="text-[11px] text-text-muted font-mono mt-0.5 tabular-nums">
                      {ch.message_count.toLocaleString()} msgs · {ch.subscriber_count} subs
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
