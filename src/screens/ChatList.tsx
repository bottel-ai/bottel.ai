import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Autocomplete, HelpFooter, type AutocompleteItem } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import {
  getContacts, getChats, addContact, createChat, searchProfiles,
  type Contact, type Chat, type Profile,
} from "../lib/api.js";

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "..." : s; }

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
  const { state, dispatch, navigate, goBack } = useStore();
  const { selectedIndex } = state.chatList;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!loggedIn) return;
    setLoading(true);
    Promise.all([getContacts(fp), getChats(fp)])
      .then(([c, ch]) => { setContacts(c); setChats(ch); })
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
            results.map((p) => ({
              id: p.fingerprint,
              label: p.fingerprint === fp ? `${p.name} (you)` : p.name,
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
      name: ch.name || (ch as any).last_sender_name || "Chat",
      lastMessage: ch.last_message,
      lastTime: ch.created_at,
      chatId: ch.id,
      contactFp: (ch as any).last_sender || "",
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
    addContact(fp, profile.fingerprint, profile.name)
      .then(() => createChat(fp, profile.fingerprint))
      .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
      .catch((err: Error) => setError(err.message));
  }, [fp, profiles, navigate]);

  useInput((input, key) => {
    if (!loggedIn) { if (key.escape) goBack(); return; }
    if (searchFocused) return; // Autocomplete handles its own input

    if (key.escape) { goBack(); return; }

    if (input === "/") { setSearchFocused(true); return; }

    if (key.upArrow) {
      if (selectedIndex === 0) { setSearchFocused(true); return; }
      dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: selectedIndex - 1 } });
      return;
    }
    if (key.downArrow || key.tab) {
      dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.min(totalItems - 1, selectedIndex + 1) } });
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
        <Text bold color={colors.primary}>Chat</Text>
        <Text color={colors.error}>You must be logged in. Go to Auth first.</Text>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Search bar */}
      <Autocomplete
        value={searchQuery}
        onChange={setSearchQuery}
        onSubmit={() => {}}
        onSelect={handleSearchSelect}
        onExit={() => { setSearchFocused(false); setSearchQuery(""); }}
        suggestions={suggestions}
        placeholder="Search bots and people..."
        width={50}
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
              <Box key={entry.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={isSelected ? colors.primary : undefined}>
                    {isSelected ? "❯ " : "  "}
                  </Text>
                  <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                    {entry.name}
                  </Text>
                  <Box flexGrow={1} />
                  {entry.lastTime && (
                    <Text dimColor>{timeAgo(entry.lastTime)}</Text>
                  )}
                </Box>
                {entry.lastMessage && (
                  <Box paddingLeft={4}>
                    <Text dimColor>{truncate(entry.lastMessage, 45)}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <HelpFooter text={searchFocused ? "Esc close search" : "\u2191\u2193 nav \u00b7 Enter open \u00b7 / search \u00b7 Esc back"} />
    </Box>
  );
}
