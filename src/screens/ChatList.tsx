import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useStore } from "../state.js";
import { listChats, createChat, deleteChat, searchBots } from "../lib/api.js";
import type { BotSearchResult } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { colors } from "../theme.js";
import { Cursor, HelpFooter } from "../components.js";
import { shortFp } from "../components/MessageRenderer.js";

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
  const [searchResults, setSearchResults] = useState<BotSearchResult[]>([]);
  const [pickerIdx, setPickerIdx] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Debounced bot search when typing in new-chat mode.
  useEffect(() => {
    if (!newMode || !selfFp || newInput.trim().length < 2) {
      setSearchResults([]);
      setPickerIdx(0);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchBots(selfFp, newInput.trim())
        .then((r) => { setSearchResults(r); setPickerIdx(0); })
        .catch(() => setSearchResults([]));
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [newInput, newMode, selfFp]);

  useInput((input, key) => {
    // New-chat input mode
    if (newMode) {
      if (key.escape) {
        setNewMode(false);
        setNewInput("");
        setNewError(null);
        setSearchResults([]);
        return;
      }
      if (key.downArrow && searchResults.length > 0) {
        setPickerIdx((i) => Math.min(searchResults.length - 1, i + 1));
        return;
      }
      if (key.upArrow && searchResults.length > 0) {
        setPickerIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.return) {
        if (creating) return;
        // If picker has results, use the selected one's fingerprint.
        const target = searchResults.length > 0
          ? searchResults[pickerIdx]?.fingerprint
          : newInput.trim();
        if (!target) return;
        setCreating(true);
        setNewError(null);
        createChat(selfFp, target)
          .then((chat) => {
            setNewMode(false);
            setNewInput("");
            setCreating(false);
            setSearchResults([]);
            navigate({ name: "chat-view", chatId: chat.id });
          })
          .catch((err: any) => {
            setNewError(String(err?.message || err));
            setCreating(false);
          });
        return;
      }
      if (key.backspace || key.delete || input === "\x7f" || input === "\b") {
        setNewInput((v) => v.slice(0, -1));
        return;
      }
      if (!input || key.ctrl || key.meta) return;
      if (/\[<\d+;\d+;\d+[Mm]/.test(input)) return;
      if (input.charCodeAt(0) < 32) return;
      setNewInput((v) => v + input);
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
    if (input === "n") {
      if (!loggedIn) {
        setNewError("Set up your identity first — go to Profile.");
        return;
      }
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
    const id = shortFp(chat.other_fp);
    const name = chat.other_name ? `${chat.other_name} (${id})` : id;
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
                <Text color={colors.subtle}>enter bot name or fingerprint...</Text>
              )}
            </Box>
            {creating && (
              <Box paddingLeft={2}>
                <Text color={colors.muted}>creating...</Text>
              </Box>
            )}
            {searchResults.length > 0 && (
              <Box flexDirection="column" paddingLeft={2}>
                {searchResults.map((r, i) => {
                  const active = i === pickerIdx;
                  const label = r.name.startsWith("bot_")
                    ? r.botId
                    : `${r.name} (${r.botId})`;
                  return (
                    <Box key={r.fingerprint}>
                      <Text color={colors.primary}>{active ? "❯ " : "  "}</Text>
                      <Text bold={active} color={active ? colors.primary : undefined}>
                        {label}
                      </Text>
                    </Box>
                  );
                })}
                <Text color={colors.subtle}>↑↓ pick · Enter select</Text>
              </Box>
            )}
            {newInput.trim().length >= 2 && searchResults.length === 0 && !creating && (
              <Box paddingLeft={2}>
                <Text color={colors.muted}>no bots found</Text>
              </Box>
            )}
          </Box>
        )}

        {newError && !newMode && (
          <Box paddingLeft={2} marginBottom={1}>
            <Text color={colors.error}>{newError}</Text>
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

      <HelpFooter text="n new chat · r refresh · d delete (own) · ↑↓ nav · Enter open · Esc back" />
    </Box>
  );
}
