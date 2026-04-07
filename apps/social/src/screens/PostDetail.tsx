import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../App.js";
import { colors } from "../../../../packages/cli-app-scaffold/src/theme.js";
import { Breadcrumb, HelpFooter } from "../../../../packages/cli-app-scaffold/src/components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getPost, createComment, type Post, type Comment } from "../lib/api.js";

function timeAgo(iso: string): string {
  try {
    const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch { return ""; }
}

// Row navigation: 0 = compose, 1 = post, 2+ = comments
export function PostDetail({ postId }: { postId: string }) {
  const { screenStates, updateScreenState, goBack, navigate } = useStore();
  const { selectedIndex } = screenStates["post-detail"];

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!fp) return;
    setLoading(true);
    getPost(fp, postId)
      .then(({ post: p, comments: c }) => { setPost(p); setComments(c); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fp, postId]);

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 3000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  // Total rows: compose(0) + post(1) + comments
  const totalRows = 2 + comments.length;
  const clamped = Math.min(Math.max(selectedIndex, 0), totalRows - 1);

  // Navigation
  useInput((_input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.upArrow) {
      updateScreenState("post-detail", { selectedIndex: (clamped - 1 + totalRows) % totalRows });
      return;
    }
    if (key.downArrow) {
      updateScreenState("post-detail", { selectedIndex: (clamped + 1) % totalRows });
      return;
    }
    if (key.return) {
      if (clamped === 0) {
        setComposing(true);
        setComposeText("");
      } else if (clamped === 1 && post) {
        navigate({ name: "bot-profile", fingerprint: post.author });
      } else {
        const c = comments[clamped - 2];
        if (c) navigate({ name: "bot-profile", fingerprint: c.author });
      }
    }
  }, { isActive: !composing && !loading && !error });

  // Compose input
  useInput((_input, key) => {
    if (!composing) return;
    if (key.escape) {
      setComposing(false);
      setComposeText("");
      return;
    }
    if (key.return && composeText.trim() && !sending && composeText.length <= 280) {
      setSending(true);
      const text = composeText.trim();
      setComposeText("");
      createComment(fp, postId, text)
        .then(comment => {
          setComments(prev => [...prev, comment]);
          if (post) setPost({ ...post, comment_count: (post.comment_count ?? 0) + 1 });
          setComposing(false);
        })
        .catch((err: Error) => setStatusMsg(`Error: ${err.message}`))
        .finally(() => setSending(false));
    }
  }, { isActive: composing });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social", "Post"]} />
        <Text color={colors.error}>You must be logged in.</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social", "Post"]} />
        <Text dimColor>  Loading...</Text>
      </Box>
    );
  }

  if (error || !post) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Social", "Post"]} />
        <Text color={colors.error}>  {error || "Post not found"}</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  const composeSelected = !composing && clamped === 0;
  const postSelected = !composing && clamped === 1;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Social", "Post"]} />

      {/* Compose comment */}
      <Box paddingX={1} marginBottom={1}>
        <Box
          borderStyle="round"
          borderColor={composing ? (composeText.length > 280 ? colors.error : colors.primary) : composeSelected ? colors.primary : colors.border}
          paddingX={1}
          flexGrow={1}
        >
          {composing ? (
            <TextInput
              value={composeText}
              onChange={setComposeText}
              placeholder={sending ? "Sending..." : "Write a comment..."}
              focus={true}
            />
          ) : (
            <Text color={composeSelected ? colors.primary : undefined} dimColor={!composeSelected}>
              {composeSelected ? "\u276f Write a comment... [Enter]" : "  Write a comment..."}
            </Text>
          )}
        </Box>
      </Box>
      {composing && (
        <Box paddingX={2} marginBottom={1}>
          <Text color={composeText.length > 280 ? colors.error : colors.secondary}>
            {composeText.length}/280
          </Text>
          <Text dimColor>  Enter send \u00b7 Esc cancel</Text>
        </Box>
      )}

      {/* Post */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={postSelected ? colors.primary : colors.border}
        paddingX={2}
        paddingY={1}
        marginBottom={1}
        flexGrow={1}
      >
        <Box>
          <Text bold color={colors.primary}>@{post.author_name || post.author.slice(0, 8)}</Text>
          <Text dimColor> \u00b7 {timeAgo(post.created_at)}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="#e0e0e0">{post.content}</Text>
        </Box>
      </Box>

      {/* Comments header */}
      <Box marginBottom={1}>
        <Text dimColor>\u2500\u2500 </Text>
        <Text bold color={colors.secondary}>Comments ({comments.length})</Text>
        <Text dimColor> {"\u2500".repeat(30)}</Text>
      </Box>

      {comments.length === 0 && (
        <Box paddingX={2} marginBottom={1}>
          <Text dimColor>No comments yet.</Text>
        </Box>
      )}

      {comments.map((comment, i) => {
        const rowIdx = i + 2;
        const isSelected = !composing && clamped === rowIdx;
        return (
          <Box key={comment.id} flexDirection="column" marginBottom={0}>
            <Box paddingX={2}>
              <Text color={isSelected ? colors.primary : undefined}>
                {isSelected ? "\u276f " : "  "}
              </Text>
              <Text bold color={isSelected ? colors.primary : colors.secondary}>
                @{comment.author_name || comment.author.slice(0, 8)}
              </Text>
              <Text dimColor> \u00b7 {timeAgo(comment.created_at)}</Text>
            </Box>
            <Box paddingLeft={6}>
              <Text color="#e0e0e0">{comment.content}</Text>
            </Box>
            <Box paddingX={3}>
              <Text dimColor>{"\u2500".repeat(38)}</Text>
            </Box>
          </Box>
        );
      })}

      {statusMsg && (
        <Box paddingX={2} marginTop={1}>
          <Text color={statusMsg.startsWith("Error") ? colors.error : colors.success}>{statusMsg}</Text>
        </Box>
      )}

      <HelpFooter text={
        composing ? "Enter send \u00b7 Esc cancel" :
        "\u2191\u2193 nav \u00b7 Enter open \u00b7 Esc back"
      } />
    </Box>
  );
}
