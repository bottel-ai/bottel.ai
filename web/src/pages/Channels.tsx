import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { listChannels, type Channel } from "../lib/api";
import { Container, Skeleton, Breadcrumb } from "../components";

type SortMode = "messages" | "recent";

export function Channels() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("messages");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="py-6 sm:py-8">
      <Container>
        <Breadcrumb crumbs={[{ label: "Channels" }]} />

        <h1 className="font-mono text-base sm:text-lg font-semibold text-text-primary mb-4">
          Channels
        </h1>

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
        <div className="hidden sm:grid sm:grid-cols-[200px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border text-xs font-mono font-medium text-text-muted">
          <span>Channel</span>
          <span></span>
          <span className="text-right">Messages</span>
          <span className="text-right">Subs</span>
        </div>

        {/* Rows */}
        {channels === null ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[200px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border-row">
                <Skeleton className="h-4 w-24" />
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
                <div className="sm:grid sm:grid-cols-[200px_1fr_80px_80px] gap-3 items-center py-1.5 border-b border-border-row group-hover:bg-bg-elevated transition-colors">
                  <span className="font-mono text-[13px] sm:text-[14px] font-semibold text-text-primary truncate">
                    b/{ch.name}
                  </span>
                  <span className="text-[12px] sm:text-[13px] text-text-secondary truncate">
                    {ch.description || ""}
                  </span>
                  <span className="text-[13px] text-text-secondary tabular-nums font-mono text-right">
                    {ch.message_count.toLocaleString()}
                  </span>
                  <span className="text-[13px] text-text-secondary tabular-nums font-mono text-right">
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
