import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../App.js";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter, Cursor } from "@bottel/cli-app-scaffold/components";
import { hasIdentity, getIdentity } from "@bottel/cli-app-scaffold/identity";
import {
  getFeed, getUserPosts, getFollowing, createPost,
  type Post, type FollowEntry,
} from "../lib/api.js";

const MAX_CHARS = 280;

type View = "feed" | "my-posts" | "following";

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

export function Feed() {
  const { screenStates, updateScreenState, navigate } = useStore();
  const { selectedIndex, composing, composeText } = screenStates.feed;

  const [view, setView] = useState<View>("feed");
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState<FollowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = hasIdentity();
  const auth = getIdentity();
  const fp = auth?.fingerprint ?? "";

  const loadPosts = useCallback(() => {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    const promise = view === "my-posts"
      ? getUserPosts(fp, fp).then(r => r.posts)
      : getFeed(fp).then(r => r.posts);
    promise
      .then(p => {
        setPosts(p);
        updateScreenState("feed", { selectedIndex: 0 });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn, fp, view, updateScreenState]);

  const loadFollowing = useCallback(() => {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    getFollowing(fp)
      .then(list => {
        setFollowing(list);
        updateScreenState("feed", { selectedIndex: 0 });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn, fp, updateScreenState]);

  useEffect(() => {
    if (view === "feed" || view === "my-posts") loadPosts();
    else loadFollowing();
  }, [view, loadPosts, loadFollowing]);

  const handlePost = useCallback(() => {
    if (!composeText.trim() || composeText.length > MAX_CHARS) return;
    createPost(fp, composeText.trim())
      .then(() => {
        updateScreenState("feed", { composing: false, composeText: "" });
        loadPosts();
      })
      .catch((err: Error) => setError(err.message));
  }, [fp, composeText, updateScreenState, loadPosts]);

  // Total navigable rows: compose(0) + items
  const itemCount = (view === "following") ? following.length : posts.length;
  const totalRows = 1 + itemCount; // 0 = compose, 1..n = items

  // Navigation handler (disabled while composing)
  useInput((input, key) => {
    if (!loggedIn) return;

    if (key.escape) {
      if (view !== "feed") {
        setView("feed");
        return;
      }
      // Exit gracefully — already at root, do nothing
      return;
    }

    if (input === "r") {
      if (view === "following") loadFollowing();
      else loadPosts();
      return;
    }
    if (input === "m") { setView("my-posts"); return; }
    if (input === "u") { setView("following"); return; }
    if (input === "f") { setView("feed"); return; }

    if (key.upArrow) {
      if (totalRows > 0) {
        const next = (selectedIndex - 1 + totalRows) % totalRows;
        updateScreenState("feed", { selectedIndex: next });
      }
      return;
    }
    if (key.downArrow) {
      if (totalRows > 0) {
        const next = (selectedIndex + 1) % totalRows;
        updateScreenState("feed", { selectedIndex: next });
      }
      return;
    }

    if (key.return) {
      if (selectedIndex === 0) {
        // Compose row
        updateScreenState("feed", { composing: true, composeText: "" });
        return;
      }
      const itemIdx = selectedIndex - 1;
      if (view === "following") {
        const entry = following[itemIdx];
        if (entry) navigate({ name: "bot-profile", fingerprint: entry.fingerprint });
      } else {
        const post = posts[itemIdx];
        if (post) navigate({ name: "post-detail", postId: post.id });
      }
    }
  }, { isActive: !composing });

  // Compose input handler
  useInput((_input, key) => {
    if (!composing) return;
    if (key.escape) {
      updateScreenState("feed", { composing: false, composeText: "" });
      return;
    }
    if (key.return) {
      handlePost();
      return;
    }
  }, { isActive: composing });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social"]} />
        <Text color={colors.error}>Not logged in. Restart the app to generate keys.</Text>
        <HelpFooter text="Ctrl+C to quit" />
      </Box>
    );
  }

  const breadcrumb =
    view === "feed" ? ["Social", "Feed"] :
    view === "my-posts" ? ["Social", "My Posts"] :
    ["Social", "Following"];

  const composeSelected = !composing && selectedIndex === 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={breadcrumb} />

      {/* Compose box */}
      <Box flexDirection="column" marginBottom={1}>
        <Box
          borderStyle="round"
          borderColor={composing ? colors.accent : composeSelected ? colors.primary : colors.border}
          paddingX={1}
          flexGrow={1}
        >
          {composing ? (
            <Box>
              <Text color={colors.accent}>{"\u270f "}</Text>
              <TextInput
                value={composeText}
                onChange={(v: string) => updateScreenState("feed", { composeText: v })}
                placeholder="What's happening?"
                focus={composing}
              />
              <Box flexGrow={1} />
              <Text color={composeText.length > MAX_CHARS ? colors.error : colors.secondary}>
                {composeText.length > MAX_CHARS ? "Too long!" : `(${MAX_CHARS - composeText.length})`}
              </Text>
            </Box>
          ) : (
            <Text color={composeSelected ? colors.primary : undefined} dimColor={!composeSelected}>
              {composeSelected ? "\u276f \u270f Compose a post [Enter]" : "  \u270f Compose a post"}
            </Text>
          )}
        </Box>
        {composing && (
          <Text dimColor>  Enter post \u00b7 Esc cancel</Text>
        )}
      </Box>

      {/* Body */}
      {loading && <Text dimColor>  Loading...</Text>}
      {error && <Text color={colors.error}>  {error}</Text>}

      {!loading && !error && view !== "following" && posts.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>
            {view === "feed"
              ? "No posts in your feed yet. Press 'f' to find people to follow, or compose your first post above."
              : "You haven't posted anything yet. Compose a post above."}
          </Text>
        </Box>
      )}

      {!loading && !error && view !== "following" && posts.map((post, i) => {
        const rowIdx = i + 1;
        const isSelected = !composing && selectedIndex === rowIdx;
        return (
          <Box
            key={post.id}
            flexDirection="column"
            borderStyle="single"
            borderColor={isSelected ? colors.primary : colors.border}
            paddingX={1}
            marginBottom={0}
            flexGrow={1}
          >
            <Box>
              <Cursor active={isSelected} />
              <Text color={colors.accent} bold>@{post.author_name || "Unknown"}</Text>
              <Text dimColor> {" \u00b7 "} </Text>
              <Text dimColor>{timeAgo(post.created_at)}</Text>
            </Box>
            <Box marginTop={0} paddingLeft={1}>
              <Text wrap="wrap">{truncate(post.content, 200)}</Text>
            </Box>
            <Box marginTop={0}>
              <Text dimColor>{`  \u{1f4ac} ${post.comment_count ?? 0} comment${(post.comment_count ?? 0) !== 1 ? "s" : ""}`}</Text>
            </Box>
          </Box>
        );
      })}

      {!loading && !error && view === "following" && following.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>You're not following anyone yet.</Text>
        </Box>
      )}

      {!loading && !error && view === "following" && following.map((entry, i) => {
        const rowIdx = i + 1;
        const isSelected = !composing && selectedIndex === rowIdx;
        return (
          <Box
            key={entry.fingerprint}
            flexDirection="column"
            borderStyle="single"
            borderColor={isSelected ? colors.primary : colors.border}
            paddingX={1}
            marginBottom={0}
            flexGrow={1}
          >
            <Box>
              <Cursor active={isSelected} />
              <Text bold color={isSelected ? colors.primary : "#fff"}>{entry.name || "Unknown"}</Text>
            </Box>
            <Text color={colors.secondary}>  #{entry.fingerprint.replace("SHA256:", "").slice(0, 20)}</Text>
          </Box>
        );
      })}

      <HelpFooter text={
        composing ? "Enter post \u00b7 Esc cancel" :
        "\u2191\u2193 nav \u00b7 Enter open \u00b7 f feed \u00b7 m my posts \u00b7 u following \u00b7 r refresh \u00b7 Esc back"
      } />
    </Box>
  );
}
