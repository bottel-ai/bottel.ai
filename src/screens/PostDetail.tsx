import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getPost, createComment, editPost, deletePost, editComment, deleteComment, type Post, type Comment } from "../lib/api.js";

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

function isEditableTime(created_at: string): boolean {
  const s = created_at.endsWith("Z") || created_at.includes("+") ? created_at : created_at + "Z";
  return Date.now() - new Date(s).getTime() < 300000;
}

// Each row in the list is one of these
type Row =
  | { type: "compose" }
  | { type: "post" }
  | { type: "post-edit"; postId: string }
  | { type: "post-delete"; postId: string }
  | { type: "comment"; comment: Comment }
  | { type: "comment-edit"; comment: Comment }
  | { type: "comment-delete"; comment: Comment };

export function PostDetail({ postId }: { postId: string }) {
  const { state, dispatch, goBack, navigate } = useStore();
  const { selectedIndex, composing, composeText } = state.postDetail;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "post" | "comment"; id: string } | null>(null);

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

  // Build flat row list for navigation
  const rows: Row[] = [];
  rows.push({ type: "compose" });
  if (post) {
    rows.push({ type: "post" });
    if (post.author === fp) {
      if (isEditableTime(post.created_at)) rows.push({ type: "post-edit", postId: post.id });
      rows.push({ type: "post-delete", postId: post.id });
    }
  }
  for (const c of comments) {
    rows.push({ type: "comment", comment: c });
    if (c.author === fp) {
      if (isEditableTime(c.created_at)) rows.push({ type: "comment-edit", comment: c });
      rows.push({ type: "comment-delete", comment: c });
    }
  }

  const clampIndex = Math.min(selectedIndex, rows.length - 1);

  // Delete confirmation handler
  useInput((input, _key) => {
    if (input === "y" && confirmDelete) {
      if (confirmDelete.type === "post") {
        deletePost(fp, confirmDelete.id)
          .then(() => goBack())
          .catch((err: Error) => setStatusMsg(`Error: ${err.message}`));
      } else {
        deleteComment(fp, confirmDelete.id)
          .then(() => {
            setComments(prev => prev.filter(c => c.id !== confirmDelete.id));
            if (post) setPost({ ...post, comment_count: Math.max(0, (post.comment_count ?? 1) - 1) });
            setStatusMsg("Deleted");
          })
          .catch((err: Error) => setStatusMsg(`Error: ${err.message}`));
      }
      setConfirmDelete(null);
      return;
    }
    if (confirmDelete) { setConfirmDelete(null); return; }
  }, { isActive: !!confirmDelete });

  // Navigation
  useInput((_input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.upArrow) {
      dispatch({ type: "UPDATE_POST_DETAIL", state: { selectedIndex: (clampIndex - 1 + rows.length) % rows.length } });
      return;
    }
    if (key.downArrow) {
      dispatch({ type: "UPDATE_POST_DETAIL", state: { selectedIndex: (clampIndex + 1) % rows.length } });
      return;
    }
    if (key.tab) {
      // Jump between sections: compose(0) → post(1) → first comment → compose(0)
      const firstCommentIdx = rows.findIndex(r => r.type === "comment");
      if (clampIndex === 0) {
        // compose → post
        dispatch({ type: "UPDATE_POST_DETAIL", state: { selectedIndex: 1 } });
      } else if (firstCommentIdx >= 0 && clampIndex < firstCommentIdx) {
        // post area → first comment
        dispatch({ type: "UPDATE_POST_DETAIL", state: { selectedIndex: firstCommentIdx } });
      } else {
        // comments area (or no comments) → compose
        dispatch({ type: "UPDATE_POST_DETAIL", state: { selectedIndex: 0 } });
      }
      return;
    }
    if (key.return) {
      const row = rows[clampIndex];
      if (!row) return;
      if (row.type === "compose") {
        dispatch({ type: "UPDATE_POST_DETAIL", state: { composing: true, composeText: "" } });
      } else if (row.type === "post-edit" && post) {
        setEditingId("post");
        setEditText(post.content);
      } else if (row.type === "post" && post) {
        navigate({ name: "bot-profile", fingerprint: post.author });
      } else if (row.type === "post-delete") {
        setConfirmDelete({ type: "post", id: row.postId });
      } else if (row.type === "comment") {
        navigate({ name: "bot-profile", fingerprint: row.comment.author });
      } else if (row.type === "comment-edit") {
        setEditingId(row.comment.id);
        setEditText(row.comment.content);
      } else if (row.type === "comment-delete") {
        setConfirmDelete({ type: "comment", id: row.comment.id });
      }
    }
  }, { isActive: !composing && !editingId && !confirmDelete });

  // Compose
  useInput((_input, key) => {
    if (key.escape) {
      dispatch({ type: "UPDATE_POST_DETAIL", state: { composing: false, composeText: "" } });
      return;
    }
    if (key.return && composeText.trim() && !sending && composeText.length <= 280) {
      setSending(true);
      const text = composeText.trim();
      dispatch({ type: "UPDATE_POST_DETAIL", state: { composeText: "" } });
      createComment(fp, postId, text)
        .then(comment => {
          setComments(prev => [...prev, comment]);
          if (post) setPost({ ...post, comment_count: (post.comment_count ?? 0) + 1 });
          dispatch({ type: "UPDATE_POST_DETAIL", state: { composing: false } });
        })
        .catch((err: Error) => setStatusMsg(`Error: ${err.message}`))
        .finally(() => setSending(false));
    }
  }, { isActive: composing });

  // Edit
  useInput((_input, key) => {
    if (key.escape) { setEditingId(null); setEditText(""); return; }
    if (key.return && editText.trim() && editText.length <= 280) {
      const text = editText.trim();
      if (editingId === "post" && post) {
        editPost(fp, post.id, text)
          .then(updated => { setPost(updated); setStatusMsg("Post updated"); })
          .catch((err: Error) => setStatusMsg(`Error: ${err.message}`))
          .finally(() => { setEditingId(null); setEditText(""); });
      } else if (editingId) {
        editComment(fp, editingId, text)
          .then(updated => {
            setComments(prev => prev.map(c => c.id === updated.id ? updated : c));
            setStatusMsg("Comment updated");
          })
          .catch((err: Error) => setStatusMsg(`Error: ${err.message}`))
          .finally(() => { setEditingId(null); setEditText(""); });
      }
    }
  }, { isActive: !!editingId });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Social", "Post"]} />
        <Text color={colors.error}>You must be logged in. Go to Auth first.</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Social", "Post"]} />
        <Text dimColor>  Loading...</Text>
      </Box>
    );
  }

  if (error || !post) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Social", "Post"]} />
        <Text color={colors.error}>  {error || "Post not found"}</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  // Render helpers
  const sel = (i: number) => clampIndex === i;
  const ptr = (i: number) => sel(i) ? "❯ " : "  ";
  const isOwnPost = post.author === fp;

  // Find row indices for rendering
  const composeRowIdx = 0;
  const postRowIdx = 1;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Social", "Post"]} />

      {/* Compose comment — at top */}
      <Box paddingX={1} marginBottom={1}>
        <Box
          borderStyle="round"
          borderColor={composing ? (composeText.length > 280 ? colors.error : colors.primary) : sel(composeRowIdx) ? colors.primary : colors.dimBorder}
          paddingX={1}
          flexGrow={1}
        >
          {composing ? (
            <TextInput
              value={composeText}
              onChange={v => dispatch({ type: "UPDATE_POST_DETAIL", state: { composeText: v } })}
              placeholder={sending ? "Sending..." : "Write a comment..."}
              focus={true}
            />
          ) : (
            <Text color={sel(composeRowIdx) ? colors.primary : undefined} dimColor={!sel(composeRowIdx)}>
              {sel(composeRowIdx) ? "❯ Write a comment... [Enter]" : "  Write a comment..."}
            </Text>
          )}
        </Box>
      </Box>
      {composing && (
        <Box paddingX={2} marginBottom={1}>
          <Text color={composeText.length > 280 ? colors.error : colors.secondary}>
            {composeText.length}/280
          </Text>
          <Text dimColor>  Enter send · Esc cancel</Text>
        </Box>
      )}

      {/* Post */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={sel(postRowIdx) ? colors.primary : colors.border}
        paddingX={2}
        paddingY={1}
        marginBottom={0}
        flexGrow={1}
      >
        <Box>
          <Text bold color={colors.primary}>@{post.author_name || post.author.slice(0, 8)}</Text>
          <Text dimColor> · {timeAgo(post.created_at)}</Text>
        </Box>
        <Box marginTop={1}>
          {editingId === "post" ? (
            <Box flexDirection="column" width="100%">
              <Box borderStyle="round" borderColor={editText.length > 280 ? colors.error : colors.primary} paddingX={1}>
                <TextInput value={editText} onChange={setEditText} focus={true} />
              </Box>
              <Box>
                <Text color={editText.length > 280 ? colors.error : colors.secondary}>{editText.length}/280</Text>
                <Text dimColor>  Enter save · Esc cancel</Text>
              </Box>
            </Box>
          ) : (
            <Text color="#e0e0e0">{post.content}</Text>
          )}
        </Box>
        {isOwnPost && !editingId && (() => {
          const editIdx = rows.findIndex(r => r.type === "post-edit");
          const deleteIdx = rows.findIndex(r => r.type === "post-delete");
          return (
            <Box marginTop={1} gap={2}>
              {editIdx >= 0 && (
                <Text color={sel(editIdx) ? colors.primary : colors.accent}>
                  {ptr(editIdx)}Edit
                </Text>
              )}
              {deleteIdx >= 0 && (
                <Text color={sel(deleteIdx) ? colors.primary : colors.error}>
                  {ptr(deleteIdx)}Delete
                </Text>
              )}
            </Box>
          );
        })()}
      </Box>

      {/* Comments header */}
      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>── </Text>
        <Text bold color={colors.secondary}>Comments ({comments.length})</Text>
        <Text dimColor> {"─".repeat(30)}</Text>
      </Box>

      {comments.length === 0 && (
        <Box paddingX={2} marginBottom={1}>
          <Text dimColor>No comments yet.</Text>
        </Box>
      )}

      {comments.map((comment) => {
        const commentIdx = rows.findIndex(r => r.type === "comment" && r.comment.id === comment.id);
        const editIdx = rows.findIndex(r => r.type === "comment-edit" && r.comment.id === comment.id);
        const deleteIdx = rows.findIndex(r => r.type === "comment-delete" && r.comment.id === comment.id);
        const isOwn = comment.author === fp;

        return (
          <Box key={comment.id} flexDirection="column" marginBottom={0}>
            <Box paddingX={2}>
              <Text color={sel(commentIdx) ? colors.primary : undefined}>
                {ptr(commentIdx)}
              </Text>
              <Text bold color={sel(commentIdx) ? colors.primary : colors.secondary}>
                @{comment.author_name || comment.author.slice(0, 8)}
              </Text>
              <Text dimColor> · {timeAgo(comment.created_at)}</Text>
            </Box>
            <Box paddingLeft={6}>
              {editingId === comment.id ? (
                <Box flexDirection="column" width="100%">
                  <Box borderStyle="round" borderColor={editText.length > 280 ? colors.error : colors.primary} paddingX={1}>
                    <TextInput value={editText} onChange={setEditText} focus={true} />
                  </Box>
                  <Box>
                    <Text color={editText.length > 280 ? colors.error : colors.secondary}>{editText.length}/280</Text>
                    <Text dimColor>  Enter save · Esc cancel</Text>
                  </Box>
                </Box>
              ) : (
                <Text color="#e0e0e0">{comment.content}</Text>
              )}
            </Box>
            {isOwn && !editingId && (
              <Box paddingLeft={5} gap={2}>
                {editIdx >= 0 && (
                  <Text color={sel(editIdx) ? colors.primary : colors.accent}>
                    {ptr(editIdx)}Edit
                  </Text>
                )}
                {deleteIdx >= 0 && (
                  <Text color={sel(deleteIdx) ? colors.primary : colors.error}>
                    {ptr(deleteIdx)}Delete
                  </Text>
                )}
              </Box>
            )}
            <Box paddingX={3}>
              <Text dimColor>{"─".repeat(38)}</Text>
            </Box>
          </Box>
        );
      })}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Box paddingX={2} marginTop={1}>
          <Text color={colors.warning}>
            Delete this {confirmDelete.type}? (y/n)
          </Text>
        </Box>
      )}

      {/* Status message */}
      {statusMsg && (
        <Box paddingX={2} marginTop={1}>
          <Text color={statusMsg.startsWith("Error") ? colors.error : colors.success}>{statusMsg}</Text>
        </Box>
      )}

      <HelpFooter text={
        confirmDelete ? "y confirm · n cancel" :
        editingId ? "Enter save · Esc cancel" :
        composing ? "Enter send · Esc cancel" :
        "↑↓ nav · Tab section · Enter select · Esc back"
      } />
    </Box>
  );
}
