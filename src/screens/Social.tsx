import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth, getShortFingerprint } from "../lib/auth.js";
import {
  getFeed, getUserPosts, createPost, getFollowing, getFollowers, getProfile,
  searchProfiles,
  type Post, type FollowEntry, type Profile,
} from "../lib/api.js";

const MAX_CHARS = 280;

const LEFT_PANEL_ITEMS = ["Home Feed", "My Posts", "Following", "Followers", "Find Bot"] as const;

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


export function Social() {
  const { state, dispatch, goBack, navigate } = useStore();
  const { selectedIndex, feedIndex, view, composing, composeText, searchQuery, searchIndex } = state.social;

  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState<FollowEntry[]>([]);
  const [followers, setFollowers] = useState<FollowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [panel, setPanel] = useState<"left" | "right">("right");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [followedSet, setFollowedSet] = useState<Set<string>>(new Set());

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  // Load profile name
  useEffect(() => {
    if (!loggedIn) return;
    getProfile(fp)
      .then(p => setProfileName(p.name || "Anonymous"))
      .catch(() => setProfileName("Anonymous"));
  }, [loggedIn, fp]);

  // Load follow counts on mount
  useEffect(() => {
    if (!loggedIn) return;
    Promise.all([getFollowing(fp), getFollowers(fp)])
      .then(([fg, fr]) => {
        setFollowing(fg);
        setFollowers(fr);
        setFollowedSet(new Set(fg.map(f => f.fingerprint)));
      })
      .catch(() => {});
  }, [loggedIn, fp]);

  // Search profiles for Find Bot
  useEffect(() => {
    if (view !== "find") return;
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timeout = setTimeout(() => {
      searchProfiles(searchQuery.trim())
        .then(results => {
          setSearchResults(results.filter(p => p.fingerprint !== fp));
        })
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, fp, view]);

  const loadFeed = useCallback(() => {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    const promise = view === "my-posts"
      ? getUserPosts(fp, fp).then(r => r.posts)
      : getFeed(fp).then(r => r.posts);
    promise
      .then(p => { setPosts(p); dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: 0 } }); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn, fp, view, dispatch]);

  const loadFollowList = useCallback(() => {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    const promise = view === "following" ? getFollowing(fp) : getFollowers(fp);
    promise
      .then(entries => {
        if (view === "following") setFollowing(entries);
        else setFollowers(entries);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn, fp, view]);

  // Load data when view changes
  useEffect(() => {
    if (view === "feed" || view === "my-posts") loadFeed();
    else if (view === "following" || view === "followers") loadFollowList();
    else setLoading(false);
  }, [view, loadFeed, loadFollowList]);

  const handlePost = useCallback(() => {
    if (!composeText.trim() || composeText.length > MAX_CHARS) return;
    createPost(fp, composeText.trim())
      .then(() => {
        dispatch({ type: "UPDATE_SOCIAL", state: { composing: false, composeText: "" } });
        loadFeed();
      })
      .catch((err: Error) => setError(err.message));
  }, [fp, composeText, dispatch, loadFeed]);

  const viewForIndex = (i: number): "feed" | "my-posts" | "following" | "followers" | "find" => {
    switch (i) {
      case 0: return "feed";
      case 1: return "my-posts";
      case 2: return "following";
      case 3: return "followers";
      case 4: return "find";
      default: return "feed";
    }
  };


  useInput((input, key) => {
    if (!loggedIn) { if (key.escape) goBack(); return; }

    // When composing, only handle compose-specific keys
    if (composing) {
      if (key.escape) {
        dispatch({ type: "UPDATE_SOCIAL", state: { composing: false, composeText: "" } });
        return;
      }
      if (key.return) {
        handlePost();
        return;
      }
      // TextInput handles the rest
      return;
    }

    if (key.escape) {
      if (view !== "feed") {
        // Go back to feed view first
        dispatch({ type: "UPDATE_SOCIAL", state: { view: "feed", feedIndex: -1 } });
        setPanel("left");
        return;
      }
      goBack();
      return;
    }

    // Tab switches between sections (loops)
    if (key.tab) {
      if (view === "feed" || view === "my-posts") {
        // 3 sections: left → compose (right, feedIndex=-1) → feed (right, feedIndex=0) → left
        if (panel === "left") {
          setPanel("right");
          dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: -1 } });
        } else if (feedIndex === -1) {
          // compose → first post (or back to left if no posts)
          if (posts.length > 0) {
            dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: 0 } });
          } else {
            setPanel("left");
          }
        } else {
          setPanel("left");
        }
      } else {
        // 2 sections: left ↔ right
        setPanel(p => p === "left" ? "right" : "left");
      }
      return;
    }

    // "r" to refresh
    if (input === "r" && panel === "right") {
      if (view === "feed" || view === "my-posts") loadFeed();
      else loadFollowList();
      return;
    }

    // Left panel navigation
    if (panel === "left") {
      const len = LEFT_PANEL_ITEMS.length;
      if (key.upArrow) {
        dispatch({ type: "UPDATE_SOCIAL", state: { selectedIndex: (selectedIndex - 1 + len) % len } });
        return;
      }
      if (key.downArrow) {
        dispatch({ type: "UPDATE_SOCIAL", state: { selectedIndex: (selectedIndex + 1) % len } });
        return;
      }
      if (key.return) {
        const newView = viewForIndex(selectedIndex);
        dispatch({ type: "UPDATE_SOCIAL", state: { view: newView, feedIndex: 0 } });
        setPanel("right");
        if (newView === "find") { dispatch({ type: "UPDATE_SOCIAL", state: { searchQuery: "", searchIndex: 0 } }); setSearchResults([]); }
        return;
      }
    }

    // Right panel (feed) navigation
    if (panel === "right") {
      if (view === "feed" || view === "my-posts") {
        // feedIndex -1 = compose button, 0+ = posts
        // Total items: compose (-1) + posts (0..len-1), so total = posts.length + 1
        const totalFeedItems = posts.length + 1; // compose + posts
        if (key.upArrow) {
          // Map feedIndex from [-1..posts.length-1] to [0..totalFeedItems-1] for modular math
          const cur = feedIndex + 1; // 0-based: compose=0, first post=1, etc.
          const next = (cur - 1 + totalFeedItems) % totalFeedItems;
          dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: next - 1 } });
          return;
        }
        if (key.downArrow) {
          const cur = feedIndex + 1;
          const next = (cur + 1) % totalFeedItems;
          dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: next - 1 } });
          return;
        }
        if (key.return) {
          if (feedIndex === -1) {
            dispatch({ type: "UPDATE_SOCIAL", state: { composing: true, composeText: "" } });
          } else if (posts[feedIndex]) {
            navigate({ name: "post-detail", postId: posts[feedIndex].id });
          }
          return;
        }
      }
      if (view === "following" || view === "followers") {
        const list = view === "following" ? following : followers;
        if (list.length > 0) {
          if (key.upArrow) {
            dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: (feedIndex - 1 + list.length) % list.length } });
            return;
          }
          if (key.downArrow) {
            dispatch({ type: "UPDATE_SOCIAL", state: { feedIndex: (feedIndex + 1) % list.length } });
            return;
          }
        }
        if (key.return && list.length > 0 && list[feedIndex]) {
          navigate({ name: "bot-profile", fingerprint: list[feedIndex].fingerprint });
          return;
        }
      }
      if (view === "find") {
        if (searchResults.length > 0) {
          if (key.upArrow) {
            dispatch({ type: "UPDATE_SOCIAL", state: { searchIndex: (searchIndex - 1 + searchResults.length) % searchResults.length } });
            return;
          }
          if (key.downArrow) {
            dispatch({ type: "UPDATE_SOCIAL", state: { searchIndex: (searchIndex + 1) % searchResults.length } });
            return;
          }
        }
        if (key.return && searchResults.length > 0 && searchResults[searchIndex]) {
          navigate({ name: "bot-profile", fingerprint: searchResults[searchIndex].fingerprint });
          return;
        }
      }
    }
  }, { isActive: !composing });

  // Separate input handler when composing (so TextInput works)
  useInput((_input, key) => {
    if (!composing) return;
    if (key.escape) {
      dispatch({ type: "UPDATE_SOCIAL", state: { composing: false, composeText: "" } });
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
        <Breadcrumb path={["Home", "Social"]} />
        <Text color={colors.error}>You must be logged in.</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  const shortFp = getShortFingerprint();

  // Left panel content
  const leftPanel = (
    <Box flexDirection="column" width={24}>
      {/* Profile box on top */}
      <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} paddingY={0} marginBottom={0} flexGrow={1}>
        <Text bold color={colors.primary}>{profileName}</Text>
        <Text color={colors.secondary}>#{shortFp}</Text>
      </Box>

      {/* Nav box below */}
      <Box flexDirection="column" borderStyle="single" borderColor={panel === "left" ? colors.primary : colors.border} paddingX={1} paddingY={1} flexGrow={1}>
        {LEFT_PANEL_ITEMS.map((item, i) => {
          const isSelected = panel === "left" && selectedIndex === i;
          let label = item as string;
          if (item === "Following") label = `Following (${following.length})`;
          if (item === "Followers") label = `Followers (${followers.length})`;
          if (item === "Find Bot") label = "🔍 Find Bot";
          const isActive = viewForIndex(i) === view;
          return (
            <Box key={item}>
              <Cursor active={isSelected} />
              <Text bold={isSelected || isActive} color={isSelected ? colors.primary : isActive ? colors.accent : undefined}>
                {label}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  // Compose area
  const composeArea = (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={composing ? colors.accent : (panel === "right" && feedIndex === -1) ? colors.primary : colors.border}
        paddingX={1}
        flexDirection="column"
        flexGrow={1}
      >
        {composing ? (
          <Box>
            <Text color={colors.accent}>{"✏ "}</Text>
            <TextInput
              value={composeText}
              onChange={(v: string) => dispatch({ type: "UPDATE_SOCIAL", state: { composeText: v } })}
              placeholder="What's happening?"
              focus={composing}
            />
            <Box flexGrow={1} />
            <Text color={composeText.length > MAX_CHARS ? colors.error : colors.secondary}>
              {composeText.length > MAX_CHARS ? "Token overflow!" : `(${MAX_CHARS - composeText.length})`}
            </Text>
          </Box>
        ) : (
          <Box>
            <Text color={(panel === "right" && feedIndex === -1) ? colors.primary : undefined} dimColor={!(panel === "right" && feedIndex === -1)}>
              {(panel === "right" && feedIndex === -1) ? "❯ ✏ Compose a post [Enter]" : "  ✏ Compose a post"}
            </Text>
          </Box>
        )}
      </Box>
      {composing && (
        <Text dimColor>  Enter post · Esc cancel</Text>
      )}
    </Box>
  );

  // Feed content (right panel body)
  let rightContent: React.ReactNode;

  if (loading) {
    rightContent = <Text dimColor>  Loading...</Text>;
  } else if (error) {
    rightContent = <Text color={colors.error}>  {error}</Text>;
  } else if (view === "feed" || view === "my-posts") {
    if (posts.length === 0) {
      rightContent = (
        <Box paddingX={1}>
          <Text dimColor>{view === "feed" ? "No posts in your feed yet. Follow some bots!" : "You haven't posted anything yet. Press 'c' to compose."}</Text>
        </Box>
      );
    } else {
      rightContent = (
        <Box flexDirection="column">
          {posts.map((post, i) => {
            const isSelected = panel === "right" && feedIndex === i;
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
                  <Text color={colors.accent} bold>@{post.author_name || "Unknown"}</Text>
                  <Text dimColor> {" \u00b7 "} </Text>
                  <Text dimColor>{timeAgo(post.created_at)}</Text>
                </Box>
                <Box marginTop={0} paddingLeft={1}>
                  <Text wrap="wrap">{truncate(post.content, 200)}</Text>
                </Box>
                <Box marginTop={0}>
                  <Text dimColor>{"💬 "}{post.comment_count ?? 0} comment{(post.comment_count ?? 0) !== 1 ? "s" : ""}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      );
    }
  } else if (view === "find") {
    // Find Bot — search + results list + follow dialog
    rightContent = (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={colors.primary}>Find Bot</Text>
        </Box>
        <Box borderStyle="round" borderColor={colors.primary} paddingX={1} marginBottom={1} flexGrow={1}>
          <Text color={colors.accent}>🔍 </Text>
          <TextInput
            value={searchQuery}
            onChange={(v: string) => dispatch({ type: "UPDATE_SOCIAL", state: { searchQuery: v } })}
            placeholder="Search bots..."
            focus={panel === "right" && view === "find"}
          />
        </Box>

        {searchResults.length === 0 && searchQuery.trim() && (
          <Text dimColor>  No bots found.</Text>
        )}
        {searchResults.length === 0 && !searchQuery.trim() && (
          <Text dimColor>  Type to search for bots to follow.</Text>
        )}

        {searchResults.map((bot, i) => {
          const isSelected = searchIndex === i;
          const isFollowed = followedSet.has(bot.fingerprint);
          return (
            <Box key={bot.fingerprint} flexDirection="column" borderStyle="single" borderColor={isSelected ? colors.primary : colors.border} paddingX={1} marginBottom={0} flexGrow={1}>
              <Box>
                <Text bold color={isSelected ? colors.primary : "#fff"}>{bot.name}</Text>
                <Box flexGrow={1} />
                <Text color={isFollowed ? colors.success : colors.secondary}>
                  {isFollowed ? "✓ Following" : "Not following"}
                </Text>
              </Box>
              <Text color={colors.secondary}>#{bot.fingerprint.replace("SHA256:", "").slice(0, 16)}</Text>
              {bot.bio && <Text color="#999">{truncate(bot.bio, 60)}</Text>}
            </Box>
          );
        })}
      </Box>
    );
  } else {
    // Following / Followers list — card style matching search results
    const list = view === "following" ? following : followers;
    if (list.length === 0) {
      rightContent = (
        <Box paddingX={1}>
          <Text dimColor>{view === "following" ? "You're not following anyone yet." : "No followers yet."}</Text>
        </Box>
      );
    } else {
      rightContent = (
        <Box flexDirection="column">
          {list.map((entry, i) => {
            const isSelected = panel === "right" && feedIndex === i;
            const isFollowedEntry = followedSet.has(entry.fingerprint);
            return (
              <Box key={entry.fingerprint} flexDirection="column" borderStyle="single" borderColor={isSelected ? colors.primary : colors.border} paddingX={1} marginBottom={0} flexGrow={1}>
                <Box>
                  <Text bold color={isSelected ? colors.primary : "#fff"}>{entry.name || "Unknown"}</Text>
                  <Box flexGrow={1} />
                  <Text color={isFollowedEntry ? colors.success : colors.secondary}>
                    {isFollowedEntry ? "✓ Following" : "Follower"}
                  </Text>
                </Box>
                <Text color={colors.secondary}>#{entry.fingerprint.replace("SHA256:", "").slice(0, 16)}</Text>
              </Box>
            );
          })}
        </Box>
      );
    }
  }

  // Build help text
  let helpText = "↑↓ nav · Tab section · r refresh · Esc back";
  if (panel === "right" && (view === "feed" || view === "my-posts")) {
    helpText = "↑↓ nav · Tab section · Enter open · Esc back";
  }
  if (view === "find") {
    helpText = "Type to search · ↑↓ nav · Enter select · Esc back";
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={
        view === "feed" ? ["Home", "Social"] :
        view === "my-posts" ? ["Home", "Social", "My Posts"] :
        view === "following" ? ["Home", "Social", "Following"] :
        view === "followers" ? ["Home", "Social", "Followers"] :
        view === "find" ? ["Home", "Social", "Find Bot"] :
        ["Home", "Social"]
      } />

      <Box flexDirection="row" flexGrow={1}>
        {/* Left Panel */}
        {leftPanel}

        {/* Feed / Right Panel */}
        <Box flexDirection="column" flexGrow={1} marginLeft={1}>
          {(view === "feed" || view === "my-posts") && composeArea}
          {rightContent}
        </Box>
      </Box>

      <HelpFooter text={helpText} />
    </Box>
  );
}
