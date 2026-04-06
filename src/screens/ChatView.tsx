import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { Breadcrumb, HelpFooter } from "../cli_app_components.js";
import { isLoggedIn, getAuth } from "../lib/auth.js";
import { getMessages, sendMessage, type Message } from "../lib/api.js";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "??:??";
  }
}

function shortenFp(fp: string): string {
  return fp.length > 12 ? fp.slice(0, 12) + "..." : fp;
}

export function ChatView({ chatId }: { chatId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { inputText } = state.chatView;
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = getAuth();
  const fingerprint = auth?.fingerprint ?? "";

  // Fetch messages on mount
  useEffect(() => {
    if (!fingerprint) return;
    getMessages(fingerprint, chatId)
      .then((msgs) => setMessages(msgs))
      .catch((err: Error) => setError(err.message));
  }, [fingerprint, chatId]);

  // Poll for new messages every 2 seconds
  useEffect(() => {
    if (!fingerprint) return;
    const interval = setInterval(() => {
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
      const since = lastMsg?.created_at;
      getMessages(fingerprint, chatId, since)
        .then((newMsgs) => {
          if (newMsgs.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [fingerprint, chatId, messages]);

  useInput((_input, key) => {
    if (key.escape) {
      goBack();
      return;
    }

    if (key.return && inputText.trim() && !sending) {
      setSending(true);
      setError(null);
      const text = inputText.trim();
      dispatch({ type: "UPDATE_CHAT_VIEW", state: { inputText: "" } });
      sendMessage(fingerprint, chatId, text)
        .then((msg) => {
          setMessages((prev) => [...prev, msg]);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setSending(false));
      return;
    }
  }, { isActive: true });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Chat", chatId.slice(0, 8)]} />

      {/* Chat header */}
      <Box
        borderStyle="single"
        borderColor={colors.border}
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color={colors.primary}>Chat with {chatId.slice(0, 12)}...</Text>
      </Box>

      {error && (
        <Box paddingLeft={2}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      {/* Messages area */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={colors.border}
        paddingX={1}
        paddingY={1}
        marginBottom={1}
        minHeight={6}
      >
        {messages.length === 0 && (
          <Text dimColor>No messages yet. Say hello!</Text>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender === fingerprint;
          const senderLabel = isMe ? "You" : (msg.sender_name || shortenFp(msg.sender));
          const time = formatTime(msg.created_at);

          if (isMe) {
            // Right-aligned own messages
            return (
              <Box key={msg.id} flexDirection="column" marginBottom={1} alignItems="flex-end">
                <Box>
                  <Text color={colors.success} bold>{senderLabel}</Text>
                  <Text dimColor>  {time}</Text>
                </Box>
                <Box
                  borderStyle="round"
                  borderColor={colors.success}
                  paddingX={1}
                >
                  <Text>{msg.content}</Text>
                </Box>
              </Box>
            );
          }

          // Left-aligned other messages
          return (
            <Box key={msg.id} flexDirection="column" marginBottom={1} alignItems="flex-start">
              <Box>
                <Text color={colors.secondary} bold>{senderLabel}</Text>
                <Text dimColor>  {time}</Text>
              </Box>
              <Box
                borderStyle="round"
                borderColor={colors.secondary}
                paddingX={1}
              >
                <Text>{msg.content}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Input box */}
      <Box paddingLeft={2}>
        <Box borderStyle="round" borderColor={colors.primary} paddingX={1} width={50}>
          <TextInput
            value={inputText}
            onChange={(v) => dispatch({ type: "UPDATE_CHAT_VIEW", state: { inputText: v } })}
            placeholder="Type a message..."
            focus={true}
          />
        </Box>
      </Box>

      {sending && (
        <Box paddingLeft={2}>
          <Text dimColor>Sending...</Text>
        </Box>
      )}

      <HelpFooter text="Enter send \u00b7 Esc back" />
    </Box>
  );
}
