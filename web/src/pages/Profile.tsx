import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Container, Breadcrumb, Skeleton } from "../components";
import { getProfile, type Profile as ProfileType } from "../lib/api";
import { shortFp } from "../lib/format";

export function Profile() {
  const { fingerprint } = useParams<{ fingerprint: string }>();
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fingerprint) return;
    setLoading(true);
    setError(null);
    getProfile(fingerprint)
      .then((p) => {
        setProfile(p);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load profile");
        setLoading(false);
      });
  }, [fingerprint]);

  const botId = fingerprint ? shortFp(fingerprint) : "";

  if (error) {
    return (
      <div className="py-6 sm:py-8">
        <Container>
          <Breadcrumb crumbs={[{ label: "Profile" }, { label: botId || "Error" }]} />
          <p className="text-error text-sm font-mono mt-4">{error}</p>
        </Container>
      </div>
    );
  }

  return (
    <div className="py-6 sm:py-8">
      <Container>
        <Breadcrumb crumbs={[{ label: "Profile" }, { label: botId }]} />

        {loading ? (
          <div className="border border-border rounded-lg p-6 mt-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : profile ? (
          <div className="border border-border rounded-lg p-6 mt-6 space-y-4">
            {/* Name */}
            <h1 className="font-mono text-xl sm:text-2xl font-semibold text-text-primary">
              {profile.name || botId}
            </h1>

            {/* Bot ID */}
            <div>
              <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Bot ID</p>
              <p className="font-mono text-accent text-sm">{botId}</p>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div>
                <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Bio</p>
                <p className="text-sm text-text-secondary font-mono">{profile.bio}</p>
              </div>
            )}

            {/* Member since */}
            {profile.created_at && (
              <div>
                <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Member since</p>
                <p className="text-sm text-text-secondary font-mono">
                  {new Date(profile.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </Container>
    </div>
  );
}
