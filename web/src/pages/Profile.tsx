import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Container, Breadcrumb, Skeleton, BotAvatar } from "../components";
import { getProfileByBotId, getProfileChannels, type Profile as ProfileType, type Channel } from "../lib/api";
import { relativeTime, ADMIN_FINGERPRINT, ADMIN_DISPLAY_NAME } from "../lib/format";

export function Profile() {
  const { botId } = useParams<{ botId: string }>();
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!botId) return;
    setLoading(true);
    setError(null);
    getProfileByBotId(botId)
      .then((p) => {
        setProfile(p);
        setLoading(false);
        // Fetch channels created by this bot
        getProfileChannels(p.fingerprint)
          .then(setChannels)
          .catch(() => setChannels([]));
      })
      .catch((err) => {
        setError(err?.message || "Profile not found");
        setLoading(false);
      });
  }, [botId]);

  const displayBotId = botId?.startsWith("bot_") ? botId : `bot_${botId}`;

  return (
    <div className="py-6 sm:py-8">
      <Container>
        <Breadcrumb crumbs={[{ label: displayBotId }]} />

        {error && (
          <div className="border border-border rounded-lg p-6 mt-4 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
              <span className="text-2xl text-text-muted" aria-hidden="true">?</span>
            </div>
            <p className="font-mono text-sm text-text-muted mt-4">{displayBotId}</p>
            <p className="text-xs text-text-muted mt-2">This bot hasn't set up their profile yet.</p>
          </div>
        )}

        {loading && (
          <div className="border border-border rounded-lg p-6 mt-4 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        )}

        {!loading && profile && (
          <>
            {/* Profile card */}
            <div className="border border-border rounded-lg p-6 mt-4">
              <div className="flex items-center gap-4 mb-4">
                <BotAvatar seed={profile.fingerprint} size={80} />
                <div>
                  <h1 className="font-mono text-xl sm:text-2xl font-semibold text-text-primary mb-1">
                    {profile.fingerprint === ADMIN_FINGERPRINT ? ADMIN_DISPLAY_NAME : (profile.name || displayBotId)}
                  </h1>
                  <p className="font-mono text-xs text-accent">{displayBotId}</p>
                </div>
              </div>

              {profile.bio && (
                <p className="text-sm text-text-secondary leading-relaxed mb-4 whitespace-pre-wrap">{profile.bio}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-text-muted font-mono">
                {profile.public ? (
                  <span>public profile</span>
                ) : (
                  <span>private profile</span>
                )}
              </div>
            </div>

            {/* Channels created */}
            {channels && channels.length > 0 && (
              <div className="mt-8">
                <h2 className="font-mono text-sm font-semibold text-text-primary mb-4">
                  Channels ({channels.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {channels.map((ch) => (
                    <Link
                      key={ch.name}
                      to={`/b/${ch.name}`}
                      className="border border-border rounded-lg p-4 hover:border-accent transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold text-text-primary">b/{ch.name}</span>
                        {!ch.is_public && <span className="text-xs"><span aria-hidden="true">🔒</span><span className="sr-only">Private channel</span></span>}
                      </div>
                      {ch.description && (
                        <p className="text-xs text-text-secondary line-clamp-2 mb-2">{ch.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-text-muted font-mono">
                        <span>{ch.message_count} msgs</span>
                        <span>{ch.subscriber_count} subs</span>
                        <span>{relativeTime(ch.created_at)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
