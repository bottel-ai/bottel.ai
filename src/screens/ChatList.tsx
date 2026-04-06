import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getContacts, getChats, removeContact, createChat, type Contact, type Chat } from "../lib/api.js";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "??:??";
  }
}

export function ChatList() {
  const { state, dispatch, navigate, goBack } = useStore();
  const { selectedIndex } = state.chatList;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = isLoggedIn();
  const auth = getAuth();
  const fingerprint = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!loggedIn) return;
    setLoading(true);
    Promise.all([getContacts(fingerprint), getChats(fingerprint)])
      .then(([c, ch]) => {
        setContacts(c);
        setChats(ch);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loggedIn, fingerprint]);

  const totalItems = contacts.length + chats.length;

  useInput((input, key) => {
    if (!loggedIn) {
      if (key.escape) goBack();
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }

    if (key.upArrow) {
      dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.max(0, selectedIndex - 1) } });
      return;
    }

    if (key.downArrow) {
      dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: Math.min(totalItems - 1, selectedIndex + 1) } });
      return;
    }

    if (input === "a") {
      navigate({ name: "add-contact" });
      return;
    }

    if (input === "d") {
      if (selectedIndex < contacts.length && contacts.length > 0) {
        const contact = contacts[selectedIndex]!;
        removeContact(fingerprint, contact.contact)
          .then(() => {
            setContacts((prev) => prev.filter((c) => c.contact !== contact.contact));
            if (selectedIndex >= contacts.length - 1 && selectedIndex > 0) {
              dispatch({ type: "UPDATE_CHAT_LIST", state: { selectedIndex: selectedIndex - 1 } });
            }
          })
          .catch((err: Error) => setError(err.message));
      }
      return;
    }

    if (input === "n") {
      if (selectedIndex < contacts.length && contacts.length > 0) {
        const contact = contacts[selectedIndex]!;
        createChat(fingerprint, [contact.contact])
          .then((chat) => {
            navigate({ name: "chat-view", chatId: chat.id });
          })
          .catch((err: Error) => setError(err.message));
      }
      return;
    }

    if (key.return) {
      if (totalItems === 0) return;
      if (selectedIndex < contacts.length) {
        const contact = contacts[selectedIndex]!;
        createChat(fingerprint, [contact.contact])
          .then((chat) => {
            navigate({ name: "chat-view", chatId: chat.id });
          })
          .catch((err: Error) => setError(err.message));
      } else {
        const chatIdx = selectedIndex - contacts.length;
        const chat = chats[chatIdx]!;
        navigate({ name: "chat-view", chatId: chat.id });
      }
      return;
    }
  });

  if (!loggedIn) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Breadcrumb path={["Home", "Chat"]} />
        <Box paddingLeft={2}>
          <Text color={colors.error}>
            You must be logged in to use chat. Go to Auth to generate or import a key.
          </Text>
        </Box>
        <HelpFooter text="Esc back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Chat"]} />

      {loading && (
        <Box paddingLeft={2}>
          <Text dimColor>Loading...</Text>
        </Box>
      )}

      {error && (
        <Box paddingLeft={2}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      {!loading && (
        <>
          {/* Contacts Section */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.border}
            paddingX={1}
            marginBottom={1}
          >
            <Box marginBottom={0}>
              <Text bold color={colors.primary}>Contacts</Text>
            </Box>
            {contacts.length === 0 && (
              <Box paddingLeft={1}>
                <Text dimColor>No contacts yet. Press a to add one.</Text>
              </Box>
            )}
            {contacts.map((c, i) => {
              const displayName = c.profile_name || c.alias || c.contact.slice(0, 12) + "...";
              const isOnline = c.online === true;
              return (
                <Box key={`contact-${c.contact}`}>
                  <Cursor active={selectedIndex === i} />
                  <Text color={isOnline ? colors.success : undefined}>
                    {isOnline ? "\u25cf" : "\u25cb"}
                  </Text>
                  <Text> </Text>
                  <Text
                    color={selectedIndex === i ? colors.primary : undefined}
                    bold={selectedIndex === i}
                  >
                    {displayName}
                  </Text>
                  <Text>  </Text>
                  <Text dimColor>{isOnline ? "online" : "offline"}</Text>
                </Box>
              );
            })}
          </Box>

          {/* Recent Chats Section */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.border}
            paddingX={1}
          >
            <Box marginBottom={0}>
              <Text bold color={colors.primary}>Recent Chats</Text>
            </Box>
            {chats.length === 0 && (
              <Box paddingLeft={1}>
                <Text dimColor>No chats yet.</Text>
              </Box>
            )}
            {chats.map((ch, i) => {
              const idx = contacts.length + i;
              const typeLabel = ch.type === "group" ? `group, ${ch.member_count ?? 0}` : "direct";
              const isSelected = selectedIndex === idx;
              return (
                <Box key={`chat-${ch.id}`} flexDirection="column">
                  <Box>
                    <Cursor active={isSelected} />
                    <Text color={isSelected ? colors.primary : undefined} bold={isSelected}>
                      {ch.name} ({typeLabel})
                    </Text>
                  </Box>
                  {ch.last_message && (
                    <Box paddingLeft={5}>
                      <Text dimColor>
                        &quot;{ch.last_message.length > 35 ? ch.last_message.slice(0, 35) + "..." : ch.last_message}&quot;
                      </Text>
                      <Text>  </Text>
                      <Text dimColor>{formatTime(ch.created_at)}</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </>
      )}

      <HelpFooter text="n new \u00b7 a add contact \u00b7 Enter open \u00b7 Esc back" />
    </Box>
  );
}
