import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../state.js";
import { colors } from "../theme.js";
import { Breadcrumb, HelpFooter } from "../components.js";
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
  const [contactFp, setContactFp] = useState("");

  const auth = getAuth();
  const fp = auth?.fingerprint ?? "";

  // Fetch chat info to get contact name
  useEffect(() => {
    if (!fp) return;
    getChats(fp).then(chats => {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        setContactName((chat as any).other_name || chat.name || "");
        setContactFp((chat as any).other_fingerprint || "");
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
    if (key.return && inputText.trim() && !sending && inputText.length <= 1000) {
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

  return (
    <Box flexDirection="column" paddingX={1}>
      <Breadcrumb path={["Home", "Chat", displayName]} />
      {/* Header */}
      <Box borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1} flexGrow={1}>
        <Text bold color="#fff">{displayName}</Text>
        {contactFp && <Text color={colors.secondary}>  {contactFp.replace("SHA256:", "")}</Text>}
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
        const showTime = gap > 300000;
        const showDivider = gi > 0 && group.sender !== prev?.sender;

        return (
          <Box key={`g-${gi}`} flexDirection="column" paddingX={1}>
            {showDivider && (
              <Box><Text dimColor>{"─".repeat(40)}</Text></Box>
            )}
            {showTime && (
              <Box justifyContent="center" marginBottom={0}>
                <Text dimColor>── {group.time} ──</Text>
              </Box>
            )}
            <Box>
              <Text bold color={group.isMe ? colors.success : colors.primary}>
                {group.senderName}
              </Text>
            </Box>
            {group.msgs.map((content, mi) => (
              <Box key={`m-${gi}-${mi}`} paddingLeft={2}>
                <Text color="#e0e0e0">{content}</Text>
              </Box>
            ))}
            <Box height={1} />
          </Box>
        );
      })}

      {/* Input */}
      <Box paddingX={1} marginTop={0}>
        <Box borderStyle="round" borderColor={inputText.length > 1000 ? colors.error : sending ? colors.warning : colors.primary} paddingX={1} flexGrow={1}>
          <TextInput
            value={inputText}
            onChange={v => dispatch({ type: "UPDATE_CHAT_VIEW", state: { inputText: v } })}
            placeholder={sending ? "Sending..." : "Message..."}
            focus={true}
          />
        </Box>
      </Box>
      <Box paddingX={2}>
        <Text color={inputText.length > 1000 ? colors.error : colors.secondary}>{inputText.length}/1000</Text>
      </Box>

      {inputText.length > 1000 && (
        <Box paddingX={2}>
          <Text color={colors.error}>🤯 Token overflow!</Text>
        </Box>
      )}
      <HelpFooter text="Enter send · Esc back" />
    </Box>
  );
}
