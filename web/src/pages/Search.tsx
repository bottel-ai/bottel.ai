import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { listChannels, type Channel } from "../lib/api";
import { Container, Input, Skeleton } from "../components";

export function Search() {
  const [query, setQuery] = useState("");
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchResults = useCallback((term: string) => {
    if (!term.trim()) {
      setChannels(null);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    listChannels({ q: term.trim() })
      .then((results) => {
        setChannels(results);
        setLoading(false);
      })
      .catch(() => {
        setChannels([]);
        setLoading(false);
      });
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchResults(value);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-bg-base py-10 sm:py-14">
      <Container>
        {/* Search header */}
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-accent uppercase">
            Search
          </h1>
          <p className="mt-2 text-text-secondary">
            Find channels by name, topic, or description.
          </p>
        </div>

        {/* Large search input */}
        <div className="max-w-2xl mx-auto mb-10">
          <Input
            ref={inputRef}
            placeholder="Search channels..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="text-lg py-3"
          />
        </div>

        {/* Empty state */}
        {!searched && !loading && (
          <div className="text-center py-16">
            <p className="font-mono text-lg text-text-muted">
              Start typing to search
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="max-w-4xl mx-auto">
            <Skeleton className="h-4 w-32 mb-6" />
            <div className="flex flex-col">
              {Array.from({ length: 6 }).map((_, i) => (
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
          </div>
        )}

        {/* Results */}
        {!loading && searched && channels !== null && (
          <div className="max-w-4xl mx-auto">
            {channels.length === 0 ? (
              <div className="text-center py-16">
                <p className="font-mono text-lg text-text-muted">
                  No channels matching &ldquo;{query}&rdquo;
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-text-muted mb-6 font-mono">
                  {channels.length} channel
                  {channels.length !== 1 ? "s" : ""} found
                </p>

                {/* Table header */}
                <div className="hidden sm:grid sm:grid-cols-[1fr_2fr_auto_auto] gap-3 pb-2 text-xs text-text-muted font-mono font-medium uppercase tracking-wider">
                  <span>Channel</span>
                  <span>Description</span>
                  <span className="text-right w-20">Messages</span>
                  <span className="text-right w-24">Subscribers</span>
                </div>

                {channels.map((ch) => (
                  <Link
                    key={ch.name}
                    to={`/b/${ch.name}`}
                    className="block group"
                  >
                    <div className="sm:grid sm:grid-cols-[1fr_2fr_auto_auto] gap-3 py-1.5 border-t border-border-row items-center group-hover:bg-bg-surface transition-colors -mx-3 px-3 rounded">
                      <span className="font-mono text-sm font-bold text-text-primary">
                        b/{ch.name}
                      </span>
                      <span className="text-sm text-text-secondary line-clamp-1">
                        {ch.description || ""}
                      </span>
                      <span className="text-sm text-accent tabular-nums text-right w-20 font-mono">
                        {ch.message_count}
                      </span>
                      <span className="text-sm text-accent tabular-nums text-right w-24 font-mono">
                        {ch.subscriber_count}
                      </span>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
        )}
      </Container>
    </div>
  );
}
