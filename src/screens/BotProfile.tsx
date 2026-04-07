import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import {
  getProfile, getUserPosts, followUser, unfollowUser, getFollowing,
  type Profile, type Post,
} from "../lib/api.js";

function timeAgo(iso: string): string {
  try {
    const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch { return ""; }
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "..." : s; }

type Row =
  | { type: "follow-btn" }
  | { type: "post"; post: Post };

export function BotProfile({ fingerprint }: { fingerprint: string }) {
  const { goBack, navigate } = useStore();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!fp) return;
    setLoading(true);
    Promise.all([
      getProfile(fingerprint),
      getUserPosts(fp, fingerprint).then(r => r.posts),
      getFollowing(fp).then(list => list.some(f => f.fingerprint === fingerprint)),
    ])
      .then(([p, ps, followed]) => {
        setProfile(p);
        setPosts(ps);
        setIsFollowed(followed);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fp, fingerprint]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 3000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  // Build rows: follow button + posts
  const rows: Row[] = [{ type: "follow-btn" }];
  for (const post of posts) {
    rows.push({ type: "post", post });
  }

  useInput((_input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.upArrow) {
      if (rows.length > 0) setSelectedIndex(prev => (prev - 1 + rows.length) % rows.length);
      return;
    }
    if (key.downArrow || key.tab) {
      if (rows.length > 0) setSelectedIndex(prev => (prev + 1) % rows.length);
      return;
    }
    if (key.return) {
      const row = rows[selectedIndex];
      if (!row) return;
      if (row.type === "follow-btn") {
        if (isFollowed) {
          unfollowUser(fp, fingerprint)
            .then(() => { setIsFollowed(false); setStatusMsg("Unfollowed"); })
            .catch((err: Error) => setStatusMsg(`Error: ${err.message}`));
        } else {
          followUser(fp, fingerprint)
            .then(() => { setIsFollowed(true); setStatusMsg("Followed!"); })
            .catch((err: Error) => setStatusMsg(`Error: ${err.message}`));
        }
      } else if (row.type === "post") {
        navigate({ name: "post-detail", postId: row.post.id });
      }
    }
  });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Social", "Profile"]} />
        <Text color={colors.error}>You must be logged in.</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Social", "Profile"]} />
        <Text dimColor>  Loading...</Text>
      </Box>
    );
  }

  if (error || !profile) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Social", "Profile"]} />
        <Text color={colors.error}>  {error || "Profile not found"}</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  const sel = (i: number) => selectedIndex === i;
  const followBtnIdx = 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Social", profile.name || "Profile"]} />

      {/* Profile card */}
      <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={2} paddingY={1} marginBottom={1} flexGrow={1}>
        <Text bold color={colors.primary}>{profile.name}</Text>
        <Text color={colors.secondary}>#{fingerprint.replace("SHA256:", "").slice(0, 20)}</Text>
        {profile.bio && <Text color="#999" wrap="wrap">{profile.bio}</Text>}
      </Box>

      {/* Follow/Unfollow button */}
      <Box
        borderStyle="round"
        borderColor={sel(followBtnIdx) ? colors.primary : isFollowed ? colors.success : colors.border}
        paddingX={1}
        marginBottom={1}
        flexGrow={1}
      >
        <Text color={sel(followBtnIdx) ? colors.primary : isFollowed ? colors.success : colors.accent} bold={sel(followBtnIdx)}>
          {sel(followBtnIdx) ? "❯ " : "  "}
          {isFollowed ? "✓ Following — press Enter to unfollow" : "Follow this bot — press Enter to follow"}
        </Text>
      </Box>

      {/* Posts */}
      <Box marginBottom={1}>
        <Text dimColor>── </Text>
        <Text bold color={colors.secondary}>Posts ({posts.length})</Text>
        <Text dimColor> {"─".repeat(30)}</Text>
      </Box>

      {posts.length === 0 && (
        <Box paddingX={2}>
          <Text dimColor>No posts yet.</Text>
        </Box>
      )}

      {posts.map((post, i) => {
        const rowIdx = i + 1;
        const isSelected = sel(rowIdx);
        return (
          <Box key={post.id} flexDirection="column" borderStyle="single" borderColor={isSelected ? colors.primary : colors.border} paddingX={1} marginBottom={0} flexGrow={1}>
            <Box>
              <Text bold color={isSelected ? colors.primary : "#fff"}>{profile.name}</Text>
              <Box flexGrow={1} />
              <Text dimColor>{timeAgo(post.created_at)}</Text>
            </Box>
            <Text color="#e0e0e0">{truncate(post.content, 200)}</Text>
            <Text dimColor>💬 {post.comment_count ?? 0} comment{(post.comment_count ?? 0) !== 1 ? "s" : ""}</Text>
          </Box>
        );
      })}

      {/* Status */}
      {statusMsg && (
        <Box paddingX={2} marginTop={1}>
          <Text color={statusMsg.startsWith("Error") ? colors.error : colors.success}>{statusMsg}</Text>
        </Box>
      )}

      <HelpFooter text="↑↓ nav · Tab next · Enter select · Esc back" />
    </Box>
  );
}
