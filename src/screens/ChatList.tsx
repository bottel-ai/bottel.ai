import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Cursor, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getContacts, getChats, removeContact, createChat, type Contact, type Chat } from "../lib/api.js";

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "..." : s; }

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso + "Z");
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  } catch { return ""; }
}

const ACTIONS = [
  { icon: "💬", label: "New Chat", value: "new-chat" },
  { icon: "🔍", label: "Find People", value: "find" },
  { icon: "👥", label: "New Group", value: "new-group" },
];

export function ChatList() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { selectedIndex } = state.chatList;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  // Layout: actions + chats + contacts
  const totalItems = ACTIONS.length + chats.length + contacts.length;

  useInput((input, key) => {
    if (!loggedIn) { if (key.escape) goBack(); return; }
    if (confirmDelete) {
      if (input === "y") {
        removeContact(fp, confirmDelete)
          .then(() => setContacts(prev => prev.filter(c => c.contact !== confirmDelete)))
          .catch((err: Error) => setError(err.message))
          .finally(() => setConfirmDelete(null));
      } else { setConfirmDelete(null); }
      return;
    }

    if (key.escape) { goBack(); return; }
    if (key.upArrow) { dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.max(0, selectedIndex - 1) } }); return; }
    if (key.downArrow) { dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.min(totalItems - 1, selectedIndex + 1) } }); return; }

    if (key.return) {
      // Actions
      if (selectedIndex < ACTIONS.length) {
        const action = ACTIONS[selectedIndex]!.value;
        if (action === "find") navigate({ name: "add-contact" });
        else if (action === "new-chat" && contacts.length > 0) {
          createChat(fp, [contacts[0]!.contact])
            .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
            .catch((err: Error) => setError(err.message));
        }
        else if (action === "new-group" && contacts.length > 1) {
          createChat(fp, contacts.map(c => c.contact), "Group Chat", "group")
            .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
            .catch((err: Error) => setError(err.message));
        }
        return;
      }

      // Chats
      const chatIdx = selectedIndex - ACTIONS.length;
      if (chatIdx < chats.length) {
        navigate({ name: "chat-view", chatId: chats[chatIdx]!.id });
        return;
      }

      // Contacts → start direct chat
      const contactIdx = chatIdx - chats.length;
      if (contactIdx < contacts.length) {
        createChat(fp, [contacts[contactIdx]!.contact])
          .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
          .catch((err: Error) => setError(err.message));
      }
      return;
    }

    if (input === "d") {
      const contactIdx = selectedIndex - ACTIONS.length - chats.length;
      if (contactIdx >= 0 && contactIdx < contacts.length) {
        setConfirmDelete(contacts[contactIdx]!.contact);
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
      {/* Header */}
      <Box borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1}>
        <Text bold color={colors.primary}>Chat</Text>
        <Text dimColor>  —  {contacts.length} contacts · {chats.length} conversations</Text>
      </Box>

      {loading && <Text dimColor>  Loading...</Text>}
      {error && <Text color={colors.error}>  {error}</Text>}

      {!loading && (
        <>
          {/* Quick actions */}
          <Box marginBottom={1} gap={2} paddingX={1}>
            {ACTIONS.map((a, i) => {
              const isSelected = selectedIndex === i;
              return (
                <Box key={a.value} borderStyle={isSelected ? "round" : "single"} borderColor={isSelected ? colors.primary : colors.border} paddingX={1}>
                  <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                    {a.icon} {a.label}
                  </Text>
                </Box>
              );
            })}
          </Box>

          {/* Recent Chats */}
          {chats.length > 0 && (
            <Box flexDirection="column" paddingX={1} marginBottom={1}>
              <Text bold dimColor>RECENT</Text>
              {chats.map((ch, i) => {
                const idx = ACTIONS.length + i;
                const isSelected = selectedIndex === idx;
                const name = ch.name || "Direct";
                const memberInfo = ch.type === "group" ? ` · ${ch.member_count} members` : "";
                return (
                  <Box key={`ch-${ch.id}`} flexDirection="column">
                    <Box>
                      <Cursor active={isSelected} />
                      <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                        {ch.type === "group" ? "👥 " : "💬 "}{name}
                      </Text>
                      <Text dimColor>{memberInfo}</Text>
                      {ch.last_message && <Text dimColor>  · {timeAgo(ch.created_at)}</Text>}
                    </Box>
                    {ch.last_message && (
                      <Box paddingLeft={5}>
                        <Text dimColor>{truncate(ch.last_message, 40)}</Text>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Contacts */}
          {contacts.length > 0 && (
            <Box flexDirection="column" paddingX={1}>
              <Text bold dimColor>CONTACTS</Text>
              {contacts.map((c, i) => {
                const idx = ACTIONS.length + chats.length + i;
                const isSelected = selectedIndex === idx;
                const name = c.profile_name || c.alias || c.contact.slice(0, 12);
                const isOnline = c.online === true;
                return (
                  <Box key={`c-${c.contact}`}>
                    <Cursor active={isSelected} />
                    <Text color={isOnline ? colors.success : colors.border}>
                      {isOnline ? "●" : "○"}
                    </Text>
                    <Text> </Text>
                    <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                      {name}
                    </Text>
                    <Text dimColor>  {isOnline ? "online" : "offline"}</Text>
                  </Box>
                );
              })}
            </Box>
          )}

          {contacts.length === 0 && chats.length === 0 && (
            <Box paddingX={1}>
              <Text dimColor>No contacts or chats yet. Use "Find People" to get started.</Text>
            </Box>
          )}
        </>
      )}

      {confirmDelete && (
        <Box marginTop={1} paddingX={1}>
          <Text color={colors.warning}>Remove contact? (y/n)</Text>
        </Box>
      )}

      <HelpFooter text="↑↓ nav · Enter select · d remove contact · Esc back" />
    </Box>
  );
}
