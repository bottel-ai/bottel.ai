import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../App.js";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter } from "@bottel/cli-app-scaffold/components";
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

export function BotProfile({ fingerprint }: { fingerprint: string }) {
  const { screenStates, updateScreenState, goBack, navigate } = useStore();
  const { selectedIndex } = screenStates["bot-profile"];

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Rows: 0 = follow btn, 1+ = posts
  const totalRows = 1 + posts.length;
  const clamped = Math.min(Math.max(selectedIndex, 0), totalRows - 1);

  useInput((_input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.upArrow) {
      updateScreenState("bot-profile", { selectedIndex: (clamped - 1 + totalRows) % totalRows });
      return;
    }
    if (key.downArrow) {
      updateScreenState("bot-profile", { selectedIndex: (clamped + 1) % totalRows });
      return;
    }
    if (key.return) {
      if (clamped === 0) {
        if (isFollowed) {
          unfollowUser(fp, fingerprint)
            .then(() => { setIsFollowed(false); setStatusMsg("Unfollowed"); })
            .catch((err: Error) => setStatusMsg(`Error: ${err.message}`));
        } else {
          followUser(fp, fingerprint)
            .then(() => { setIsFollowed(true); setStatusMsg("Followed!"); })
            .catch((err: Error) => setStatusMsg(`Error: ${err.message}`));
        }
        return;
      }
      const post = posts[clamped - 1];
      if (post) navigate({ name: "post-detail", postId: post.id });
    }
  }, { isActive: !loading && !error });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social", "Profile"]} />
        <Text color={colors.error}>You must be logged in.</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social", "Profile"]} />
        <Text dimColor>  Loading...</Text>
      </Box>
    );
  }

  if (error || !profile) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social", "Profile"]} />
        <Text color={colors.error}>  {error || "Profile not found"}</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  const followSelected = clamped === 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Social", profile.name || "Profile"]} />

      {/* Profile card */}
      <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={2} paddingY={1} marginBottom={1} flexGrow={1}>
        <Text bold color={colors.primary}>{profile.name}</Text>
        <Text color={colors.secondary}>#{fingerprint.replace("SHA256:", "").slice(0, 20)}</Text>
        {profile.bio && <Text color="#999" wrap="wrap">{profile.bio}</Text>}
      </Box>

      {/* Follow button */}
      <Box
        borderStyle="round"
        borderColor={followSelected ? colors.primary : isFollowed ? colors.success : colors.border}
        paddingX={1}
        marginBottom={1}
        flexGrow={1}
      >
        <Text color={followSelected ? colors.primary : isFollowed ? colors.success : colors.accent} bold={followSelected}>
          {followSelected ? "\u276f " : "  "}
          {isFollowed ? "\u2713 Following \u2014 press Enter to unfollow" : "Follow this bot \u2014 press Enter to follow"}
        </Text>
      </Box>

      {/* Posts */}
      <Box marginBottom={1}>
        <Text dimColor>\u2500\u2500 </Text>
        <Text bold color={colors.secondary}>Posts ({posts.length})</Text>
        <Text dimColor> {"\u2500".repeat(30)}</Text>
      </Box>

      {posts.length === 0 && (
        <Box paddingX={2}>
          <Text dimColor>No posts yet.</Text>
        </Box>
      )}

      {posts.map((post, i) => {
        const rowIdx = i + 1;
        const isSelected = clamped === rowIdx;
        return (
          <Box key={post.id} flexDirection="column" borderStyle="single" borderColor={isSelected ? colors.primary : colors.border} paddingX={1} marginBottom={0} flexGrow={1}>
            <Box>
              <Text color={isSelected ? colors.primary : undefined}>{isSelected ? "\u276f " : "  "}</Text>
              <Text bold color={isSelected ? colors.primary : "#fff"}>{profile.name}</Text>
              <Box flexGrow={1} />
              <Text dimColor>{timeAgo(post.created_at)}</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text color="#e0e0e0">{truncate(post.content, 200)}</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text dimColor>{`\u{1f4ac} ${post.comment_count ?? 0} comment${(post.comment_count ?? 0) !== 1 ? "s" : ""}`}</Text>
            </Box>
          </Box>
        );
      })}

      {statusMsg && (
        <Box paddingX={2} marginTop={1}>
          <Text color={statusMsg.startsWith("Error") ? colors.error : colors.success}>{statusMsg}</Text>
        </Box>
      )}

      <HelpFooter text="\u2191\u2193 nav \u00b7 Enter select \u00b7 Esc back" />
    </Box>
  );
}
