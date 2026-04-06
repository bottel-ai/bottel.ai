import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Cursor, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getContacts, getChats, removeContact, createChat, type Contact, type Chat } from "../lib/api.js";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "..." : s; }

const MENU = [
  { label: "New Chat", value: "new-chat" },
  { label: "Find People", value: "find" },
  { label: "New Group", value: "new-group" },
  { label: "Back", value: "back" },
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

  // Nav items: menu + contacts + chats
  const totalItems = MENU.length + contacts.length + chats.length;

  useInput((input, key) => {
    if (!loggedIn) { if (key.escape) goBack(); return; }

    // Delete confirmation
    if (confirmDelete) {
      if (input === "y") {
        removeContact(fp, confirmDelete)
          .then(() => setContacts(prev => prev.filter(c => c.contact !== confirmDelete)))
          .catch((err: Error) => setError(err.message))
          .finally(() => setConfirmDelete(null));
      } else {
        setConfirmDelete(null);
      }
      return;
    }

    if (key.escape) { goBack(); return; }
    if (key.upArrow) { dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.max(0, selectedIndex - 1) } }); return; }
    if (key.downArrow) { dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.min(totalItems - 1, selectedIndex + 1) } }); return; }

    if (key.return) {
      // Menu actions
      if (selectedIndex < MENU.length) {
        const action = MENU[selectedIndex]!.value;
        if (action === "find") navigate({ name: "add-contact" });
        else if (action === "back") goBack();
        else if (action === "new-chat") {
          // Start chat with first contact if available
          if (contacts.length > 0) {
            createChat(fp, [contacts[0]!.contact])
              .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
              .catch((err: Error) => setError(err.message));
          }
        }
        else if (action === "new-group") {
          // Create group with all contacts
          if (contacts.length > 1) {
            const members = contacts.map(c => c.contact);
            createChat(fp, members, "Group Chat", "group")
              .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
              .catch((err: Error) => setError(err.message));
          }
        }
        return;
      }

      // Contact → start direct chat
      const contactIdx = selectedIndex - MENU.length;
      if (contactIdx < contacts.length) {
        const contact = contacts[contactIdx]!;
        createChat(fp, [contact.contact])
          .then(chat => navigate({ name: "chat-view", chatId: chat.id }))
          .catch((err: Error) => setError(err.message));
        return;
      }

      // Chat → open
      const chatIdx = contactIdx - contacts.length;
      if (chatIdx < chats.length) {
        navigate({ name: "chat-view", chatId: chats[chatIdx]!.id });
      }
      return;
    }

    // d to delete selected contact
    if (input === "d") {
      const contactIdx = selectedIndex - MENU.length;
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
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>Chat</Text>
      </Box>

      {loading && <Text dimColor>Loading...</Text>}
      {error && <Text color={colors.error}>Error: {error}</Text>}

      {/* Menu */}
      {!loading && (
        <Box flexDirection="column" marginBottom={1}>
          {MENU.map((item, i) => (
            <Box key={item.value}>
              <Cursor active={selectedIndex === i} />
              <Text color={selectedIndex === i ? colors.primary : undefined} bold={selectedIndex === i}>
                {item.label}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Contacts */}
      {!loading && contacts.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1}>
          <Text bold dimColor>Contacts ({contacts.length})</Text>
          {contacts.map((c, i) => {
            const idx = MENU.length + i;
            const name = c.profile_name || c.alias || c.contact.slice(0, 12);
            const isOnline = c.online === true;
            const isSelected = selectedIndex === idx;
            return (
              <Box key={`c-${c.contact}`}>
                <Cursor active={isSelected} />
                <Text color={isOnline ? colors.success : undefined}>{isOnline ? "●" : "○"} </Text>
                <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>{name}</Text>
                <Text dimColor>  {isOnline ? "online" : "offline"}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Recent Chats */}
      {!loading && chats.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1}>
          <Text bold dimColor>Recent Chats ({chats.length})</Text>
          {chats.map((ch, i) => {
            const idx = MENU.length + contacts.length + i;
            const isSelected = selectedIndex === idx;
            const label = ch.name || "Direct";
            const type = ch.type === "group" ? `group, ${ch.member_count ?? 0}` : "direct";
            return (
              <Box key={`ch-${ch.id}`} flexDirection="column">
                <Box>
                  <Cursor active={isSelected} />
                  <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                    {label}
                  </Text>
                  <Text dimColor> ({type})</Text>
                </Box>
                {ch.last_message && (
                  <Box paddingLeft={5}>
                    <Text dimColor>"{truncate(ch.last_message, 30)}"</Text>
                    <Text dimColor>  {formatTime(ch.created_at)}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Box marginTop={1}>
          <Text color={colors.warning}>Delete contact? y/n</Text>
        </Box>
      )}

      <HelpFooter text="↑↓ nav · Enter select · d delete contact · Esc back" />
    </Box>
  );
}
