import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getChannel, type Channel } from "../lib/api";
import { displayName, relativeTime, formatTime } from "../lib/format";
import { Container, Badge, Skeleton } from "../components";

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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!name) return;
    getChannel(name)
      .then(({ channel: ch, messages: msgs }) => {
        setChannel(ch);
        setMessages(msgs);
      })
      .catch((err) => setError(err.message));
  }, [name]);

  useEffect(() => {
    if (messages) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages]);

  if (error) {
    return (
      <div className="min-h-screen bg-bg-base py-10 sm:py-14">
        <Container>
          <p className="text-error text-sm font-mono">{error}</p>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Channel header */}
      <section className="pt-10 pb-8 sm:pt-14 sm:pb-10 border-b border-border">
        <Container>
          <Link
            to="/channels"
            className="text-sm text-text-muted hover:text-text-primary transition-colors mb-4 inline-block font-mono"
          >
            &larr; All channels
          </Link>

          {channel ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-text-primary">
                  b/{channel.name}
                </h1>
                <Badge variant={channel.is_public ? "success" : "default"}>
                  {channel.is_public ? "public" : "private"}
                </Badge>
              </div>
              {channel.description && (
                <p className="mt-3 text-text-secondary leading-relaxed max-w-2xl">
                  {channel.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Badge variant="accent">{channel.message_count} messages</Badge>
                <Badge variant="accent">{channel.subscriber_count} subscribers</Badge>
                <span className="text-xs text-text-muted font-mono">
                  created {relativeTime(channel.created_at)}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <Skeleton className="h-8 w-48 mb-3" />
              <Skeleton className="h-5 w-full max-w-md mb-5" />
              <div className="flex gap-4">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            </div>
          )}
        </Container>
      </section>

      {/* Messages */}
      <section className="bg-bg-surface min-h-[50vh] py-8 sm:py-10">
        <Container>
          {messages === null ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-3 py-2">
                  <div className="w-0.5 shrink-0 rounded-full bg-border" />
                  <div className="flex-1">
                    {i % 3 === 0 && (
                      <Skeleton className="h-3 w-28 mb-2" />
                    )}
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-text-muted text-sm font-mono">No messages yet</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const grouped = prev ? shouldGroup(prev, msg) : false;

                return (
                  <div key={msg.id} className="flex gap-3">
                    {/* Accent bar */}
                    <div className="w-0.5 shrink-0 rounded-full bg-accent/40" />

                    <div
                      className={`flex-1 min-w-0 ${
                        grouped
                          ? "py-0.5"
                          : i === 0
                            ? "pt-0 pb-0.5"
                            : "pt-5 pb-0.5"
                      }`}
                    >
                      {/* Author header */}
                      {!grouped && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-medium text-accent font-mono truncate">
                            {displayName(msg.author, msg.author_name)}
                          </span>
                          <span className="text-[11px] text-text-muted tabular-nums shrink-0 font-mono">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
                        {formatPayload(msg.payload)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </Container>
      </section>
    </div>
  );
}
