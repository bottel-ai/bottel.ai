import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useStore } from "../state.js";
import { listChats, createChat, deleteChat } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { colors } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";

// ─── Helpers ────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

function truncate(s: string, len: number): string {
  if (!s) return "";
  return s.length > len ? s.slice(0, Math.max(0, len - 1)) + "\u2026" : s;
}

// ─── Screen ─────────────────────────────────────────────────────

export function ChatList() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { chats, selectedIndex, loading } = state.chatList;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [newInput, setNewInput] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const auth = getAuth();
  const selfFp = auth?.fingerprint ?? "";
  const loggedIn = isLoggedIn();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const innerWidth = Math.max(40, termWidth - 4);

  type Slice = typeof state.chatList;
  const update = (s: Partial<Slice> | ((cur: Slice) => Partial<Slice>)) =>
    dispatch({ type: "UPDATE_CHAT_LIST", state: s });

  const fetchChats = () => {
    if (!loggedIn || !selfFp) return;
    update({ loading: true });
    listChats(selfFp)
      .then((cs) => update({ chats: cs, loading: false, selectedIndex: 0 }))
      .catch(() => update({ chats: [], loading: false }));
  };

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((input, key) => {
    // New-chat input mode
    if (newMode) {
      if (key.escape) {
        setNewMode(false);
        setNewInput("");
        setNewError(null);
        return;
      }
      if (key.return) {
        if (!newInput.trim() || creating) return;
        setCreating(true);
        setNewError(null);
        createChat(selfFp, newInput.trim())
          .then((chat) => {
            setNewMode(false);
            setNewInput("");
            setCreating(false);
            navigate({ name: "chat-view", chatId: chat.id });
          })
          .catch((err: any) => {
            setNewError(String(err?.message || err));
            setCreating(false);
          });
        return;
      }
      if (key.backspace || key.delete) {
        setNewInput((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNewInput((v) => v + input);
      }
      return;
    }

    // Delete confirm intercept
    if (confirmDelete) {
      if (input === "y" || input === "Y") {
        deleteChat(selfFp, confirmDelete).catch(() => {});
        setConfirmDelete(null);
        setTimeout(() => fetchChats(), 300);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setConfirmDelete(null);
        return;
      }
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }
    if (key.upArrow) {
      update((cur) =>
        cur.chats.length > 0
          ? { selectedIndex: (cur.selectedIndex - 1 + cur.chats.length) % cur.chats.length }
          : {}
      );
      return;
    }
    if (key.downArrow) {
      update((cur) =>
        cur.chats.length > 0
          ? { selectedIndex: (cur.selectedIndex + 1) % cur.chats.length }
          : {}
      );
      return;
    }
    if (key.return) {
      const chat = chats[selectedIndex];
      if (chat) navigate({ name: "chat-view", chatId: chat.id });
      return;
    }
    if (input === "n" && loggedIn) {
      setNewMode(true);
      setNewInput("");
      setNewError(null);
      return;
    }
    if (input === "r") {
      fetchChats();
      return;
    }
    if (input === "d" && loggedIn) {
      const chat = chats[selectedIndex];
      if (chat && chat.created_by === selfFp) {
        setConfirmDelete(chat.id);
      }
      return;
    }
  });

  const renderRow = (chat: typeof chats[number], i: number) => {
    const active = i === selectedIndex;
    const name = chat.other_name || chat.other_fp.slice(0, 16);
    const preview = chat.last_message ? truncate(chat.last_message, innerWidth - 20) : "";
    const rel = chat.last_message_at ? relativeTime(chat.last_message_at) : "";
    const isOwner = chat.created_by === selfFp;
    const showDelete = confirmDelete === chat.id;

    return (
      <Box key={chat.id} flexDirection="column" marginBottom={1}>
        <Box>
          <Cursor active={active} />
          <Text bold color={active ? colors.primary : undefined}>
            {name}
          </Text>
        </Box>
        {preview && (
          <Box paddingLeft={3} justifyContent="space-between" width={innerWidth - 4}>
            <Text color={colors.muted}>{preview}</Text>
            {rel && <Text color={colors.subtle}>{rel}</Text>}
          </Box>
        )}
        {showDelete && (
          <Box paddingLeft={3}>
            <Text color={colors.error}>
              Delete this chat?  All messages will be removed.  </Text>
            <Text bold color={colors.error}>y</Text>
            <Text color={colors.muted}> yes  </Text>
            <Text bold color={colors.success}>n</Text>
            <Text color={colors.muted}> no</Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        paddingY={1}
        width={innerWidth}
      >
        <Box marginBottom={1} justifyContent="space-between">
          <Text bold color={colors.primary}>
            Direct Messages
          </Text>
        </Box>

        {newMode && (
          <Box flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={colors.primary} bold>{"new chat > "}</Text>
              {newInput.length > 0 ? (
                <>
                  <Text>{newInput}</Text>
                  <Text color={colors.primary}>{"\u258f"}</Text>
                </>
              ) : (
                <Text color={colors.subtle}>enter fingerprint or name...</Text>
              )}
            </Box>
            {creating && (
              <Box paddingLeft={2}>
                <Text color={colors.muted}>creating...</Text>
              </Box>
            )}
            {newError && (
              <Box paddingLeft={2}>
                <Text color={colors.error}>{newError}</Text>
              </Box>
            )}
          </Box>
        )}

        {!loggedIn && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            <Text color={colors.warning}>
              Set up your identity first -- go to Profile from the home menu.
            </Text>
          </Box>
        )}

        {loggedIn && loading && (
          <Box>
            <Text color={colors.muted}>loading chats...</Text>
          </Box>
        )}

        {loggedIn && !loading && chats.length === 0 && !newMode && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            <Text color={colors.muted}>No chats yet.</Text>
            <Box marginTop={1}>
              <Text color={colors.muted}>
                Press{" "}
                <Text bold color={colors.primary}>
                  n
                </Text>{" "}
                to start a new chat.
              </Text>
            </Box>
          </Box>
        )}

        {loggedIn && !loading && chats.length > 0 && (
          <Box flexDirection="column">
            {chats.map((chat, i) => renderRow(chat, i))}
          </Box>
        )}
      </Box>

      <HelpFooter text="n new chat \u00b7 r refresh \u00b7 d delete (own) \u00b7 \u2191\u2193 nav \u00b7 Enter open \u00b7 Esc back" />
    </Box>
  );
}
