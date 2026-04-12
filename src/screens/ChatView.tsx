import { useEffect, useRef, useState } from "react";
import { Box, Text, useStdin } from "ink";
import Spinner from "ink-spinner";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { useStore } from "../state.js";
import type { DirectMessage } from "../state.js";
import { getChatMessages, sendDirectMessage, openChatWs, fetchChatKey } from "../lib/api.js";
import { getAuth, isLoggedIn } from "../lib/auth.js";
import { isEncrypted, decryptPayload } from "../lib/crypto.js";
import { getChatKey, saveChatKey } from "../lib/keys.js";
import { colors } from "../theme.js";
import { MessageRenderer, sanitizeBody } from "../components/MessageRenderer.js";
import { useReplyInput, unescapeInput, ReplyBox } from "../components/ReplyBox.js";
import { useWebSocket } from "../components/useWebSocket.js";
import { StatusBar } from "../components/StatusBar.js";

// ─── Props ──────────────────────────────────────────────────────

interface ChatViewProps {
  chatId: string;
  termHeight: number;
  termWidth: number;
}

export function ChatView({ chatId, termHeight, termWidth }: ChatViewProps) {
  const { state, dispatch, goBack } = useStore();
  const { messages, input, loading, wsConnected } = state.chatView;
  const paneWidth = Math.max(50, termWidth - 2);

  // Internal ScrollView ref for the messages area.
  const msgScrollRef = useRef<ScrollViewRef>(null);

  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const auth = getAuth();
  const loggedIn = isLoggedIn();
  const selfFp = auth?.fingerprint ?? "";
  const [chatKey, setChatKey] = useState<string | null>(null);

  const update = (s: Partial<typeof state.chatView>) =>
    dispatch({ type: "UPDATE_CHAT_VIEW", state: s });

  // ─── Fetch messages on mount ────────────────────────────────

  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    if (!loggedIn || !selfFp) return;
    update({ loading: true });

    // Fetch chat key (try cache first, then server)
    const cached = getChatKey(chatId);
    if (cached) {
      setChatKey(cached);
    } else {
      fetchChatKey(selfFp, chatId)
        .then((k) => {
          if (unmountedRef.current) return;
          if (k) { saveChatKey(chatId, k); setChatKey(k); }
        })
        .catch(() => {});
    }

    getChatMessages(selfFp, chatId)
      .then((msgs) => {
        if (unmountedRef.current) return;
        const sorted = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        update({ messages: sorted, loading: false });
      })
      .catch((err) => {
        if (unmountedRef.current) return;
        setError(String(err?.message || err));
        update({ loading: false });
      });

    return () => { unmountedRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // ─── WebSocket (shared hook) ──────────────────────────────

  useWebSocket({
    id: chatId,
    enabled: loggedIn && !!selfFp,
    createWs: () => openChatWs(chatId, selfFp),
    onOpen: () => update({ wsConnected: true }),
    onClose: () => update({ wsConnected: false }),
    onMessage: (raw) => {
      const data = JSON.parse(raw);
      const incoming: DirectMessage | null = data?.message
        ? data.message
        : data?.id && data?.sender
          ? data
          : null;
      if (incoming) dispatch({ type: "APPEND_DIRECT_MESSAGE", message: incoming });
    },
  });

  // ─── Mouse wheel scrolling ──────────────────────────────────

  const { stdin } = useStdin();
  useEffect(() => {
    if (!stdin) return;
    const onData = (data: Buffer) => {
      const str = data.toString();
      const matches = str.matchAll(/\x1b\[<(\d+);\d+;\d+[Mm]/g);
      for (const match of matches) {
        const button = parseInt(match[1]!, 10);
        if (!msgScrollRef.current) continue;
        const offset = msgScrollRef.current.getScrollOffset();
        const bottom = msgScrollRef.current.getBottomOffset();
        if ((button & 0x43) === 0x40) {
          msgScrollRef.current.scrollTo(Math.max(0, offset - 3));
        } else if ((button & 0x43) === 0x41) {
          msgScrollRef.current.scrollTo(Math.min(bottom, offset + 3));
        }
      }
    };
    stdin.on("data", onData);
    return () => { stdin.off("data", onData); };
  }, [stdin]);

  // ─── Auto-scroll to bottom on new messages ────────────────

  const lastMsgId = messages[messages.length - 1]?.id ?? null;
  useEffect(() => {
    const t = setTimeout(() => {
      const bottom = msgScrollRef.current?.getBottomOffset() ?? 0;
      msgScrollRef.current?.scrollTo(bottom);
    }, 0);
    return () => clearTimeout(t);
  }, [lastMsgId]);

  // ─── Submit handler ───────────────────────────────────────

  const handleSubmit = async (text: string, pasted: string | null) => {
    if (submitting || !loggedIn || !selfFp) return;
    setSendError(null);
    setSubmitting(true);

    const content = unescapeInput(text, pasted);

    try {
      await sendDirectMessage(selfFp, chatId, content);
      update({ input: "" });
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("Profile required")) {
        setSendError("Set up your identity first — go to Profile from the home menu.");
      } else {
        setSendError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Input handling (shared hook) ─────────────────────────

  useReplyInput({
    input,
    flushInput: (value) => update({ input: value }),
    onSubmit: handleSubmit,
    onEscape: goBack,
    onKeyBefore: (char, key) => {
      if (key.upArrow) { msgScrollRef.current?.scrollBy(-1); return true; }
      if (key.downArrow) { msgScrollRef.current?.scrollBy(1); return true; }
      if (key.pageUp) { msgScrollRef.current?.scrollBy(-10); return true; }
      if (key.pageDown) { msgScrollRef.current?.scrollBy(10); return true; }
      return false;
    },
  });

  // ─── Rendering ────────────────────────────────────────────

  // Derive the other participant's name from messages.
  const otherName = (() => {
    const otherMsg = messages.find((m) => m.sender !== selfFp);
    if (otherMsg?.sender_name) return otherMsg.sender_name;
    return "Direct Message";
  })();

  const renderHeader = () => {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        paddingY={0}
        width={paneWidth}
      >
        <Box justifyContent="space-between">
          <Text bold color={colors.primary}>{otherName}</Text>
          <Text color={colors.subtle}>direct message</Text>
        </Box>
      </Box>
    );
  };

  // Helper: decrypt DM content if encrypted
  const decryptDmContent = (content: string, key: string | null): string => {
    if (isEncrypted(content) && key) {
      try { return decryptPayload(content, key); } catch { return "[decryption failed]"; }
    }
    if (isEncrypted(content)) return "[encrypted message]";
    return sanitizeBody(content);
  };

  // Normalize DirectMessage → MessageRenderer's Message interface
  const normalizedMessages = messages.map((m) => ({
    id: m.id,
    author: m.sender,
    author_name: m.sender_name ?? undefined,
    content: decryptDmContent(m.content, chatKey),
    created_at: m.created_at,
  }));

  const renderMessages = () => {
    if (loading) {
      return (
        <Box
          width={paneWidth}
          flexDirection="column"
          alignItems="center"
          paddingY={4}
        >
          <Box>
            <Text color={colors.primary}>
              <Spinner type="dots" />
            </Text>
            <Text color={colors.muted}> loading messages...</Text>
          </Box>
        </Box>
      );
    }
    if (error) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text color={colors.error}>error: {error}</Text>
        </Box>
      );
    }
    if (messages.length === 0) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text color={colors.muted}>No messages yet — say hello!</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" width={paneWidth}>
        <MessageRenderer
          messages={normalizedMessages}
          selfFingerprint={selfFp}
          paneWidth={paneWidth}
        />
      </Box>
    );
  };

  // Dynamic scroll height: subtract all fixed chrome.
  // header (3) + input (3) + statusbar (1) + margins (3)
  let chromeLines = 3 + 3 + 1 + 3;
  const scrollHeight = Math.max(5, termHeight - chromeLines);

  return (
    <Box flexDirection="column" paddingX={1}>
      {renderHeader()}

      {/* Scrollable messages area — only this part scrolls */}
      <ScrollView ref={msgScrollRef} height={scrollHeight}>
        {renderMessages()}
      </ScrollView>

      <Box marginTop={1} flexDirection="column">
        <ReplyBox
          input={input}
          submitting={submitting}
          loggedIn={loggedIn}
          paneWidth={paneWidth}
          sendError={sendError}
          placeholder={"Reply...   (use \\n for newline, or paste)"}
          notLoggedInText="generate a key in Profile to chat"
          showSpinner={true}
        />
      </Box>

      <StatusBar connected={wsConnected} hint="Enter send · Esc back" />
    </Box>
  );
}
