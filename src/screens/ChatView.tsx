import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../cli_app_state.js";
import { colors } from "../cli_app_theme.js";
import { HelpFooter } from "../cli_app_components.js";
import { getAuth } from "../lib/auth.js";
import { getMessages, sendMessage, getChats, type Message } from "../lib/api.js";

function formatTimestamp(iso: string): string {
  try {
    const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return ""; }
}

export function ChatView({ chatId }: { chatId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { inputText } = state.chatView;
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactOnline, setContactOnline] = useState(false);

  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  // Fetch chat info to get contact name
  useEffect(() => {
    if (!fp) return;
    getChats(fp).then(chats => {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        setContactName((chat as any).last_sender_name || chat.name || chatId.slice(0, 8));
      }
    }).catch(() => {});
  }, [fp, chatId]);

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

  // Derive contact name from messages if not set
  useEffect(() => {
    if (contactName) return;
    const otherMsg = messages.find(m => m.sender !== fp);
    if (otherMsg) {
      setContactName(otherMsg.sender_name || otherMsg.sender.slice(0, 8));
    }
  }, [messages, fp, contactName]);

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
  function parseTime(iso: string): number {
    const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    return new Date(s).getTime() || 0;
  }

  const grouped: { sender: string; senderName: string; isMe: boolean; time: string; rawTime: number; msgs: string[] }[] = [];
  for (const msg of messages) {
    const isMe = msg.sender === fp;
    const senderName = isMe ? "You" : (msg.sender_name || msg.sender.slice(0, 8));
    const last = grouped[grouped.length - 1];
    if (last && last.sender === msg.sender) {
      last.msgs.push(msg.content);
    } else {
      grouped.push({ sender: msg.sender, senderName, isMe, time: formatTimestamp(msg.created_at), rawTime: parseTime(msg.created_at), msgs: [msg.content] });
    }
  }

  const displayName = contactName || chatId.slice(0, 8);
  const otherFp = messages.find(m => m.sender !== fp)?.sender || "";
  const shortFp = otherFp ? (otherFp.length > 20 ? otherFp.replace("SHA256:", "").slice(0, 10) + "..." + otherFp.replace("SHA256:", "").slice(-10) : otherFp) : "";

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1} flexDirection="column">
        <Text bold color={colors.primary}>{displayName}</Text>
        {shortFp && <Text dimColor>{shortFp}</Text>}
        <Text> </Text>
        <Text color={contactOnline ? colors.success : colors.border}>
          {contactOnline ? "\u25cf" : "\u25cb"}
        </Text>
      </Box>

      {error && <Text color={colors.error}>  Error: {error}</Text>}

      {/* Messages */}
      {messages.length === 0 && (
        <Box paddingX={2} marginBottom={1}>
          <Text dimColor>No messages yet. Start the conversation!</Text>
        </Box>
      )}

      {grouped.map((group, gi) => {
        const prev = gi > 0 ? grouped[gi - 1] : null;
        const gap = prev ? group.rawTime - prev.rawTime : Infinity;
        const showTime = gap > 300000; // 5 minutes

        return (
          <Box key={`g-${gi}`} flexDirection="column" paddingX={1} marginBottom={0}>
            <Box>
              <Text bold color={group.isMe ? colors.success : colors.secondary}>
                {group.senderName}
              </Text>
              {showTime && <Text dimColor> · {group.time}</Text>}
            </Box>
            {group.msgs.map((content, mi) => (
              <Box key={`m-${gi}-${mi}`} paddingLeft={2}>
                <Text>{content}</Text>
              </Box>
            ))}
            <Box height={1} />
          </Box>
        );
      })}

      {/* Input */}
      <Box paddingX={1} marginTop={0}>
        <Box borderStyle="round" borderColor={sending ? colors.warning : colors.primary} paddingX={1} flexGrow={1}>
          <TextInput
            value={inputText}
            onChange={v => dispatch({ type: "UPDATE_CHAT_VIEW", state: { inputText: v } })}
            placeholder={sending ? "Sending..." : "Message..."}
            focus={true}
          />
        </Box>
      </Box>

      <HelpFooter text="Enter send \u00b7 Esc back" />
    </Box>
  );
}
