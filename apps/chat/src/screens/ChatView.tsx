import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useStore } from "../App.js";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Breadcrumb, HelpFooter } from "@bottel/cli-app-scaffold/components";
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
  const { screenStates, updateScreenState, goBack } = useStore();
  const { inputText } = screenStates["chat-view"];
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

  // Real-time chat via WebSocket — no polling, auto-reconnect on disconnect
  useEffect(() => {
    if (!fp) return;
    const apiUrl = process.env.BOTTEL_API_URL || "https://bottel-api.cenconq.workers.dev";
    const wsBase = apiUrl.replace(/^http/, "ws");
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let attempt = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(`${wsBase}/chat/${chatId}/ws?fp=${encodeURIComponent(fp)}`);

      ws.onopen = () => { attempt = 0; };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "message" && data.message) {
            setMessages(prev => {
              if (prev.some(m => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => { ws?.close(); };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [fp, chatId]);

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
      updateScreenState("chat-view", { inputText: "" });
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
      <Breadcrumb path={["Chat", displayName]} />
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
                <Text dimColor>-- {group.time} --</Text>
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
            onChange={v => updateScreenState("chat-view", { inputText: v })}
            placeholder={sending ? "Sending..." : "Message..."}
            focus={true}
          />
        </Box>
      </Box>
      <Box paddingX={2}>
        <Text color={inputText.length > 1000 ? colors.error : colors.secondary}>{inputText.length}/1000</Text>
      </Box>

      <HelpFooter text="Enter send | Esc back" />
    </Box>
  );
}
