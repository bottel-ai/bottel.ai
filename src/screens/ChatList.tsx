import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, Cursor, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getContacts, getChats, removeContact, createChat, type Contact, type Chat } from "../lib/api.js";

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
        // Open/create direct chat with contact
        const contact = contacts[selectedIndex]!;
        createChat(fingerprint, [contact.contact])
          .then((chat) => {
            navigate({ name: "chat-view", chatId: chat.id });
          })
          .catch((err: Error) => setError(err.message));
      } else {
        // Open existing chat
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

      <Box paddingLeft={2} marginBottom={1}>
        <Text bold color={colors.primary}>Chat</Text>
      </Box>

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
          <Box paddingLeft={2} marginBottom={0}>
            <Text bold>Contacts:</Text>
          </Box>
          {contacts.length === 0 && (
            <Box paddingLeft={4}>
              <Text dimColor>No contacts yet. Press a to add one.</Text>
            </Box>
          )}
          {contacts.map((c, i) => (
            <Box key={`contact-${c.contact}`} paddingLeft={2}>
              <Cursor active={selectedIndex === i} />
              <Text color={selectedIndex === i ? colors.primary : undefined} bold={selectedIndex === i}>
                {c.alias} ({c.contact.slice(0, 12)}...)
              </Text>
            </Box>
          ))}

          <Box paddingLeft={2} marginTop={1} marginBottom={0}>
            <Text bold>Recent Chats:</Text>
          </Box>
          {chats.length === 0 && (
            <Box paddingLeft={4}>
              <Text dimColor>No chats yet.</Text>
            </Box>
          )}
          {chats.map((ch, i) => {
            const idx = contacts.length + i;
            const typeLabel = ch.type === "group" ? `group, ${ch.member_count ?? 0}` : "direct";
            return (
              <Box key={`chat-${ch.id}`} paddingLeft={2}>
                <Cursor active={selectedIndex === idx} />
                <Box width={30}>
                  <Text color={selectedIndex === idx ? colors.primary : undefined} bold={selectedIndex === idx}>
                    {ch.name} ({typeLabel})
                  </Text>
                </Box>
                {ch.last_message && (
                  <Text dimColor>
                    Last: &quot;{ch.last_message.length > 30 ? ch.last_message.slice(0, 30) + "..." : ch.last_message}&quot;
                  </Text>
                )}
              </Box>
            );
          })}
        </>
      )}

      <HelpFooter text="n new chat \u00b7 a add contact \u00b7 d delete contact \u00b7 Enter open \u00b7 Esc back" />
    </Box>
  );
}
