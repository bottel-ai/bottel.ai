import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../App.js";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter, Autocomplete, type AutocompleteItem } from "@bottel/cli-app-scaffold/components";
import { hasIdentity, getIdentity } from "@bottel/cli-app-scaffold/identity";
import {
  getChats, createChat, deleteChat, searchProfiles,
  type Chat, type Profile,
} from "../lib/api.js";

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "..." : s; }
function shortKey(fp: string): string {
  const clean = fp.replace("SHA256:", "");
  if (clean.length <= 20) return clean;
  return clean.slice(0, 10) + "..." + clean.slice(-10);
}

function timeAgo(iso: string): string {
  try {
    const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  } catch { return ""; }
}

interface ConversationEntry {
  id: string;
  name: string;
  lastMessage?: string;
  lastTime?: string;
  chatId?: string;
  contactFp: string;
}

export function ChatList() {
  const { screenStates, updateScreenState, navigate, goBack } = useStore();
  const { selectedIndex } = screenStates["chat-list"];
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const loggedIn = hasIdentity();
  const auth = getIdentity();
  const fp = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!loggedIn) return;
    setLoading(true);
    getChats(fp)
      .then((ch) => { setChats(ch); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn, fp]);

  // Search profiles as user types
  useEffect(() => {
    if (!searchQuery.trim()) { setSuggestions([]); setProfiles([]); return; }
    const timeout = setTimeout(() => {
      searchProfiles(searchQuery.trim())
        .then((results) => {
          setProfiles(results);
          setSuggestions(
            results
              .filter((p) => p.fingerprint !== fp)
              .map((p) => ({
                id: p.fingerprint,
                label: `${p.name}  #${p.fingerprint.replace("SHA256:", "").slice(0, 6)}`,
              })),
          );
        })
        .catch(() => { setSuggestions([]); setProfiles([]); });
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, fp]);

  // Only show chats that have messages
  const conversations: ConversationEntry[] = chats
    .filter(ch => ch.last_message)
    .map(ch => ({
      id: ch.id,
      name: (ch as any).other_name || "Chat",
      lastMessage: ch.last_message,
      lastTime: ch.created_at,
      chatId: ch.id,
      contactFp: (ch as any).other_fingerprint || "",
    }))
    .sort((a, b) => {
      if (a.lastTime && b.lastTime) return new Date(b.lastTime + "Z").getTime() - new Date(a.lastTime + "Z").getTime();
      return 0;
    });

  const totalItems = conversations.length;

  const openOrCreateChat = useCallback((contactFp: string, existingChatId?: string) => {
    if (existingChatId) {
      navigate({ name: "chat-view", chatId: existingChatId });
    } else {
      createChat(fp, contactFp)
        .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
        .catch((err: Error) => setError(err.message));
    }
  }, [fp, navigate]);

  const handleSearchSelect = useCallback((item: AutocompleteItem) => {
    if (item.id === fp) { setError("You can't chat with yourself"); return; }
    const profile = profiles.find(p => p.fingerprint === item.id);
    if (!profile) return;
    createChat(fp, profile.fingerprint)
      .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
      .catch((err: Error) => setError(err.message));
  }, [fp, profiles, navigate]);

  useInput((input, key) => {
    if (!loggedIn) return;
    if (searchFocused) return; // Autocomplete handles its own input

    if (confirmDelete) {
      if (input === "y") {
        deleteChat(fp, confirmDelete)
          .then(() => setChats(prev => prev.filter(c => c.id !== confirmDelete)))
          .catch((err: Error) => setError(err.message))
          .finally(() => setConfirmDelete(null));
      } else { setConfirmDelete(null); }
      return;
    }

    if (key.escape) { goBack(); return; }

    if (input === "/" || key.tab) {
      setSearchFocused(true);
      return;
    }

    if (key.upArrow) {
      if (totalItems > 0) {
        updateScreenState("chat-list", { selectedIndex: (selectedIndex - 1 + totalItems) % totalItems });
      }
      return;
    }
    if (key.downArrow) {
      if (totalItems > 0) {
        updateScreenState("chat-list", { selectedIndex: (selectedIndex + 1) % totalItems });
      }
      return;
    }

    if (input === "d" && totalItems > 0 && conversations[selectedIndex]?.chatId) {
      setConfirmDelete(conversations[selectedIndex]!.chatId!);
      return;
    }

    if (key.return && totalItems > 0) {
      const entry = conversations[selectedIndex];
      if (entry) {
        openOrCreateChat(entry.contactFp, entry.chatId);
      }
    }
  });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Chat"]} />
        <Text color={colors.error}>Not logged in. Restart the app to generate keys.</Text>
        <HelpFooter text="Ctrl+C to quit" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Chat", "Conversations"]} />
      {/* Search bar */}
      <Autocomplete
        value={searchQuery}
        onChange={setSearchQuery}
        onSubmit={() => {}}
        onSelect={handleSearchSelect}
        onExit={() => { setSearchFocused(false); setSearchQuery(""); }}
        suggestions={suggestions}
        placeholder="Search bots and people..."
        focused={searchFocused}
      />

      {loading && <Text dimColor>  Loading...</Text>}
      {error && <Text color={colors.error}>  {error}</Text>}

      {!loading && (
        <Box flexDirection="column" marginTop={1}>
          {conversations.length === 0 && (
            <Box paddingX={1}>
              <Text dimColor>No conversations yet. Search above to find people and start chatting.</Text>
            </Box>
          )}

          {conversations.map((entry, i) => {
            const isSelected = !searchFocused && selectedIndex === i;
            return (
              <Box key={entry.id} flexDirection="column">
                <Box>
                  <Text color={isSelected ? colors.primary : undefined}>
                    {isSelected ? ">" : " "}{" "}
                  </Text>
                  <Text color={isSelected ? colors.primary : "#fff"} bold>
                    {entry.name}
                  </Text>
                  <Box flexGrow={1} />
                  {entry.lastTime && (
                    <Text dimColor>{timeAgo(entry.lastTime)}</Text>
                  )}
                </Box>
                <Box paddingLeft={4}>
                  <Text color={colors.secondary}>{shortKey(entry.contactFp)}</Text>
                </Box>
                {entry.lastMessage && (
                  <Box paddingLeft={4}>
                    <Text color="#999">{truncate(entry.lastMessage, 45)}</Text>
                  </Box>
                )}
                <Box paddingLeft={2} marginTop={0}>
                  <Text dimColor>{"─".repeat(45)}</Text>
                </Box>
              </Box>
            );
          })}

          {confirmDelete && (
            <Box marginTop={1} paddingX={1}>
              <Text color={colors.warning}>Delete this chat and all messages? (y/n)</Text>
            </Box>
          )}
        </Box>
      )}

      <HelpFooter text={searchFocused ? "Esc close search" : "Up/Down nav | Tab search | Enter open | d delete | Ctrl+C quit"} />
    </Box>
  );
}
