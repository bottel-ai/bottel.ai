import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { HelpFooter } from "../cli_app_components.js";
import { getAuth } from "../lib/auth.js";
import { getMessages, sendMessage, type Message } from "../lib/api.js";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso + "Z");
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return ""; }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso + "Z");
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function ChatView({ chatId }: { chatId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { inputText } = state.chatView;
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  useEffect(() => {
    if (!fp) return;
    getMessages(fp, chatId)
      .then(setMessages)
      .catch((err: Error) => setError(err.message));
  }, [fp, chatId]);

  useEffect(() => {
    if (!fp) return;
    const interval = setInterval(() => {
      const last = messages[messages.length - 1];
      getMessages(fp, chatId, last?.created_at)
        .then((newMsgs) => {
          if (newMsgs.length > 0) {
            setMessages(prev => {
              const ids = new Set(prev.map(m => m.id));
              const fresh = newMsgs.filter(m => !ids.has(m.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [fp, chatId, messages]);

  useInput((_input, key) => {
    if (key.escape) { goBack(); return; }
    if (key.return && inputText.trim() && !sending) {
      setSending(true);
      setError(null);
      const text = inputText.trim();
      dispatch({ type: "UPDATE_CHAT_VIEW", state: { inputText: "" } });
      sendMessage(fp, chatId, text)
        .then(msg => setMessages(prev => [...prev, msg]))
        .catch((err: Error) => setError(err.message))
        .finally(() => setSending(false));
    }
  }, { isActive: true });

  // Group consecutive messages from same sender
  const grouped: { sender: string; senderName: string; isMe: boolean; msgs: { content: string; time: string }[] }[] = [];
  for (const msg of messages) {
    const isMe = msg.sender === fp;
    const senderName = isMe ? "You" : (msg.sender_name || msg.sender.slice(0, 8));
    const last = grouped[grouped.length - 1];
    if (last && last.sender === msg.sender) {
      last.msgs.push({ content: msg.content, time: formatTimestamp(msg.created_at) });
    } else {
      grouped.push({ sender: msg.sender, senderName, isMe, msgs: [{ content: msg.content, time: formatTimestamp(msg.created_at) }] });
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header bar */}
      <Box borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1}>
        <Box flexGrow={1}>
          <Text bold color={colors.primary}># {chatId.slice(0, 8)}</Text>
        </Box>
        <Text dimColor>Esc back</Text>
      </Box>

      {error && <Text color={colors.error}>  Error: {error}</Text>}

      {/* Messages */}
      {messages.length === 0 && (
        <Box paddingX={2} marginBottom={1}>
          <Text dimColor>No messages yet. Start the conversation!</Text>
        </Box>
      )}

      {grouped.map((group, gi) => (
        <Box key={`g-${gi}`} flexDirection="column" paddingX={1} marginBottom={1}>
          {/* Sender header */}
          <Box>
            <Text bold color={group.isMe ? colors.success : colors.secondary}>
              {group.senderName}
            </Text>
            <Text dimColor>  {group.msgs[0]?.time}</Text>
          </Box>
          {/* Messages from this sender */}
          {group.msgs.map((m, mi) => (
            <Box key={`m-${gi}-${mi}`} paddingLeft={2}>
              <Text>{m.content}</Text>
            </Box>
          ))}
        </Box>
      ))}

      {/* Divider */}
      <Box paddingX={1}>
        <Text dimColor>{"─".repeat(50)}</Text>
      </Box>

      {/* Input */}
      <Box paddingX={1} marginTop={0}>
        <Box borderStyle="round" borderColor={sending ? colors.warning : colors.primary} paddingX={1} flexGrow={1}>
          <TextInput
            value={inputText}
            onChange={v => dispatch({ type: "UPDATE_CHAT_VIEW", state: { inputText: v } })}
            placeholder={sending ? "Sending..." : "Type a message..."}
            focus={true}
          />
        </Box>
      </Box>

      <HelpFooter text="Enter send · Esc back" />
    </Box>
  );
}
