import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { listChannels, type Channel } from "../lib/api";
import { Container, Input, Skeleton } from "../components";

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
    <div className="min-h-screen bg-bg-base py-10 sm:py-14">
      <Container>
        {/* Page heading */}
        <div className="mb-10">
          <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-accent uppercase">
            Find Channels
          </h1>
          <p className="mt-2 text-text-secondary">
            Browse and search the full channel directory.
          </p>
        </div>

        {/* Search + sort controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1">
            <Input
              placeholder="Search channels by name or topic..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="text-base py-2.5"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSort("messages")}
              className={`text-sm px-4 py-2 rounded-full font-medium font-mono transition-colors ${
                sort === "messages"
                  ? "bg-white text-black"
                  : "bg-transparent text-text-secondary border border-border hover:text-text-primary"
              }`}
            >
              Most Active
            </button>
            <button
              type="button"
              onClick={() => setSort("recent")}
              className={`text-sm px-4 py-2 rounded-full font-medium font-mono transition-colors ${
                sort === "recent"
                  ? "bg-white text-black"
                  : "bg-transparent text-text-secondary border border-border hover:text-text-primary"
              }`}
            >
              Most Recent
            </button>
          </div>
        </div>

        {/* Table */}
        {channels === null ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-1.5 border-t border-border-row"
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-text-muted text-sm font-mono">
              {query ? `No channels matching "${query}"` : "No channels found"}
            </p>
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[minmax(120px,1fr)_2fr_auto_auto] gap-3 pb-2 text-xs text-text-muted font-mono font-medium uppercase tracking-wider">
              <span>Channel</span>
              <span>Description</span>
              <span className="text-right w-20">Messages &darr;</span>
              <span className="text-right w-24">Subscribers</span>
            </div>

            {/* Rows */}
            {channels.map((ch) => (
              <Link
                key={ch.name}
                to={`/b/${ch.name}`}
                className="block group"
              >
                <div className="sm:grid sm:grid-cols-[minmax(120px,1fr)_2fr_auto_auto] gap-3 py-1.5 border-t border-border-row items-center group-hover:bg-bg-surface transition-colors -mx-3 px-3 rounded">
                  <span className="font-mono text-sm font-bold text-text-primary">
                    b/{ch.name}
                  </span>
                  <span className="text-sm text-text-secondary line-clamp-1 mt-1 sm:mt-0">
                    {ch.description || "\u2014"}
                  </span>
                  <span className="text-sm text-accent tabular-nums text-right w-20 hidden sm:block font-mono">
                    {ch.message_count}
                  </span>
                  <span className="text-sm text-accent tabular-nums text-right w-24 hidden sm:block font-mono">
                    {ch.subscriber_count}
                  </span>
                  {/* Mobile stats line */}
                  <div className="sm:hidden mt-2 flex items-center gap-3 text-xs text-text-muted tabular-nums font-mono">
                    <span>{ch.message_count} msgs</span>
                    <span>&middot;</span>
                    <span>{ch.subscriber_count} subs</span>
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
