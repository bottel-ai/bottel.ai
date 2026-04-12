import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getChannel, type Channel } from "../lib/api";
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

  useEffect(() => {
    if (!name) return;
    getChannel(name)
      .then(({ channel: ch, messages: msgs }) => {
        setChannel(ch);
        setMessages(msgs);
      })
      .catch((err) => setError(err.message));
  }, [name]);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb crumbs={[{ label: "Channels", to: "/channels" }, { label: name || "Error" }]} />
        <p className="text-error text-sm font-mono mt-4">{error}</p>
      </div>
    );
  }

  return (
    <div style={{ height: "calc(100vh - 49px)", display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ── */}
      <div style={{ flexShrink: 0 }} className="w-full pt-3 pb-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[{ label: "Channels", to: "/channels" }, { label: `b/${name}` }]} />
          <div className="mb-4" />
          <div className="border border-border rounded-lg px-5 py-2">
            {channel ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-accent">
                    {!channel.is_public && "🔒 "}b/{channel.name}
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
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {messages === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i}>
                  {i % 3 === 0 && <Skeleton className="h-3 w-24 mb-1" />}
                  <div className="flex items-start">
                    <span className="text-text-muted text-sm shrink-0">▎ </span>
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
              <p className="text-text-muted text-xs font-mono mb-3">— start of channel —</p>

              {messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const grouped = prev ? shouldGroup(prev, msg) : false;
                const body = formatPayload(msg.payload);
                const isEncMsg = body === "[encrypted message]" || body === "[decryption failed]";

                return (
                  <div key={msg.id} className={grouped ? "" : i === 0 ? "" : "mt-5"}>
                    {!grouped && (
                      <div className="mb-0.5">
                        <span className="font-mono text-xs font-bold text-text-primary">
                          {displayName(msg.author, msg.author_name)}
                        </span>
                        <span className="font-mono text-xs text-text-muted ml-2">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    )}
                    {body.split("\n").map((line, li) => (
                      <div key={li} className="flex">
                        <span className="text-accent/60 text-sm shrink-0 select-none">▎ </span>
                        <span className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${isEncMsg ? "text-text-muted italic" : "text-text-secondary"}`}>
                          {line || "\u00A0"}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{ flexShrink: 0 }} className="w-full py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between border-t border-border pt-2">
          <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono">
            <span className="text-accent-green">●</span>
            <span>
              {channel ? `${channel.subscriber_count} member${channel.subscriber_count === 1 ? "" : "s"}` : ""}
              {channel && !channel.is_public ? "  ·  encrypted" : ""}
            </span>
          </div>
          <Link to="/channels" className="text-xs text-text-muted font-mono hover:text-text-primary transition-colors">
            Esc back
          </Link>
        </div>
      </div>

    </div>
  );
}
