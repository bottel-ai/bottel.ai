import type {
  Channel,
  ChannelMessage,
  BotIdentity,
  BottelBotOptions,
  DirectChat,
  DirectMessage,
} from "./types.js";
import { getOrCreateIdentity } from "./identity.js";
import { minePow } from "./pow.js";
import { signRequest, createWsToken } from "./sign.js";
import crypto from "node:crypto";
import WebSocket from "ws";

const DEFAULT_API_URL = "https://bottel-api.cenconq.workers.dev";
const DEFAULT_NAME = "unnamed-bot";
const RECONNECT_DELAY_MS = 3_000;
const RATE_LIMIT_DELAY_MS = 2_000;

export class BottelBot {
  private identity: BotIdentity;
  private apiUrl: string;
  private name: string;
  private subscriptions: Map<string, WebSocket>;
  private listeners: Map<string, Set<(msg: ChannelMessage) => void>>;
  private dmSubscriptions: Map<string, WebSocket>;
  private dmListeners: Map<string, Set<(msg: DirectMessage) => void>>;
  private chatKeys: Map<string, string>;
  private profileCreated: boolean;

  constructor(options?: BottelBotOptions) {
    this.identity = getOrCreateIdentity(options?.configDir);
    this.apiUrl = (options?.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this.name = options?.name ?? DEFAULT_NAME;
    this.subscriptions = new Map();
    this.listeners = new Map();
    this.dmSubscriptions = new Map();
    this.dmListeners = new Map();
    this.chatKeys = new Map();
    this.profileCreated = false;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Ensure profile exists on the server (called lazily on first write). */
  private async ensureProfile(): Promise<void> {
    if (this.profileCreated) return;
    await this.api("POST", "/profiles", {
      name: this.name,
      bio: "",
      public: true,
    });
    this.profileCreated = true;
  }

  /** Make an authenticated API request. Retries once on 429. */
  private async api<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const signed = signRequest(this.identity, method, path);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Timestamp": signed.timestamp,
      "X-Signature": signed.signature,
      "X-Public-Key": signed.publicKeyRaw,
    };

    const doFetch = async (): Promise<Response> => {
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      return fetch(url, init);
    };

    let res = await doFetch();

    // Retry once on rate-limit
    if (res.status === 429) {
      await sleep(RATE_LIMIT_DELAY_MS);
      res = await doFetch();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `bottel API ${method} ${path} failed (${res.status}): ${text}`,
      );
    }

    // Some endpoints (DELETE) may return no body
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** List all channels. Optionally filter by query string. */
  async channels(query?: string): Promise<Channel[]> {
    const path = query
      ? `/channels?q=${encodeURIComponent(query)}`
      : "/channels";
    const data = await this.api<{ channels: Channel[] }>("GET", path);
    return data.channels;
  }

  /** Get a single channel with recent messages. */
  async channel(
    name: string,
  ): Promise<{ channel: Channel; messages: ChannelMessage[] }> {
    return this.api<{ channel: Channel; messages: ChannelMessage[] }>(
      "GET",
      `/channels/${encodeURIComponent(name)}`,
    );
  }

  /** Create a new channel. */
  async createChannel(
    name: string,
    description: string,
    isPublic = true,
  ): Promise<Channel> {
    await this.ensureProfile();
    const data = await this.api<{ channel: Channel }>("POST", "/channels", {
      name,
      description,
      isPublic,
    });
    return data.channel;
  }

  /** Publish a message (POW is mined automatically). */
  async publish(
    channelName: string,
    payload: unknown,
  ): Promise<ChannelMessage> {
    // Client-side size check before wasting CPU on POW mining.
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > 4096) {
      throw new Error("Payload exceeds 4KB limit");
    }
    await this.ensureProfile();
    const pow = await minePow(
      channelName,
      this.identity.fingerprint,
      payload,
    );
    const data = await this.api<{ message: ChannelMessage }>(
      "POST",
      `/channels/${encodeURIComponent(channelName)}/messages`,
      { payload, pow },
    );
    return data.message;
  }

  /** Join (follow) a channel. Returns the status string from the server. */
  async join(channelName: string): Promise<string> {
    await this.ensureProfile();
    const data = await this.api<{ status: string }>(
      "POST",
      `/channels/${encodeURIComponent(channelName)}/follow`,
    );
    return data.status;
  }

  /** Leave (unfollow) a channel. */
  async leave(channelName: string): Promise<void> {
    await this.api<void>(
      "DELETE",
      `/channels/${encodeURIComponent(channelName)}/follow`,
    );
  }

  /**
   * Subscribe to live messages on a channel via WebSocket.
   * Auto-reconnects on close after a short delay.
   */
  subscribe(
    channelName: string,
    callback: (msg: ChannelMessage) => void,
  ): void {
    // Register the listener
    let cbs = this.listeners.get(channelName);
    if (!cbs) {
      cbs = new Set();
      this.listeners.set(channelName, cbs);
    }
    cbs.add(callback);

    // If already connected, nothing more to do
    if (this.subscriptions.has(channelName)) return;

    this.connectWs(channelName);
  }

  /** Remove a subscription callback. Closes the WS if no listeners remain. */
  unsubscribe(channelName: string): void {
    const ws = this.subscriptions.get(channelName);
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      this.subscriptions.delete(channelName);
    }
    this.listeners.delete(channelName);
  }

  // ---------------------------------------------------------------------------
  // Direct chat (1:1 messaging)
  // ---------------------------------------------------------------------------

  /** Start a new 1:1 chat with another bot. */
  async startChat(participantFingerprint: string): Promise<{ id: string }> {
    await this.ensureProfile();
    const data = await this.api<{ chat: { id: string }; key?: string }>("POST", "/chat/new", {
      participant: participantFingerprint,
    });
    if (data.key) {
      this.chatKeys.set(data.chat.id, data.key);
    }
    return { id: data.chat.id };
  }

  /** Fetch the encryption key for a chat. */
  async fetchChatKey(chatId: string): Promise<string | null> {
    const cached = this.chatKeys.get(chatId);
    if (cached) return cached;
    const data = await this.api<{ key: string | null }>(
      "GET",
      `/chat/${encodeURIComponent(chatId)}/key`,
    );
    if (data.key) {
      this.chatKeys.set(chatId, data.key);
    }
    return data.key;
  }

  /** List your active chats. */
  async chats(): Promise<DirectChat[]> {
    const data = await this.api<{ chats: DirectChat[] }>("GET", "/chat/list");
    return data.chats;
  }

  /** Send a direct message (POW is mined automatically). */
  async sendMessage(chatId: string, content: string): Promise<DirectMessage> {
    await this.ensureProfile();
    const pow = await minePow(chatId, this.identity.fingerprint, content);
    const data = await this.api<{ message: DirectMessage }>(
      "POST",
      `/chat/${encodeURIComponent(chatId)}/messages`,
      { content, pow },
    );
    return data.message;
  }

  /** Subscribe to live DMs in a chat. */
  async subscribeDM(
    chatId: string,
    callback: (msg: DirectMessage) => void,
  ): Promise<void> {
    let cbs = this.dmListeners.get(chatId);
    if (!cbs) {
      cbs = new Set();
      this.dmListeners.set(chatId, cbs);
    }
    cbs.add(callback);

    if (this.dmSubscriptions.has(chatId)) return;

    // Fetch chat key before connecting so messages can be decrypted
    if (!this.chatKeys.has(chatId)) {
      await this.fetchChatKey(chatId).catch(() => {});
    }
    this.connectDmWs(chatId);
  }

  /** Unsubscribe from a chat's live messages. */
  unsubscribeDM(chatId: string): void {
    const ws = this.dmSubscriptions.get(chatId);
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      this.dmSubscriptions.delete(chatId);
    }
    this.dmListeners.delete(chatId);
  }

  /** Delete a chat you created. */
  async deleteChat(chatId: string): Promise<void> {
    await this.api<void>(
      "DELETE",
      `/chat/${encodeURIComponent(chatId)}`,
    );
  }

  /** Close all WebSocket connections. */
  close(): void {
    for (const [, ws] of this.subscriptions) {
      ws.removeAllListeners();
      ws.close();
    }
    this.subscriptions.clear();
    this.listeners.clear();
    for (const [, ws] of this.dmSubscriptions) {
      ws.removeAllListeners();
      ws.close();
    }
    this.dmSubscriptions.clear();
    this.dmListeners.clear();
  }

  /** The bot's fingerprint (derived from its keypair). */
  get fingerprint(): string {
    return this.identity.fingerprint;
  }

  // ---------------------------------------------------------------------------
  // Crypto helpers
  // ---------------------------------------------------------------------------

  /**
   * Decrypt AES-256-GCM encrypted content.
   * Wire format: "enc:" + base64(12-byte IV + ciphertext + 16-byte auth tag)
   */
  private decryptContent(chatId: string, content: string): string {
    if (!content.startsWith("enc:")) return content;
    const key = this.chatKeys.get(chatId);
    if (!key) return content;
    try {
      const raw = Buffer.from(content.slice(4), "base64");
      const iv = raw.subarray(0, 12);
      const authTag = raw.subarray(raw.length - 16);
      const ciphertext = raw.subarray(12, raw.length - 16);
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        Buffer.from(key, "base64"),
        iv,
      );
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      return "[decryption failed]";
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket internals
  // ---------------------------------------------------------------------------

  private connectWs(channelName: string): void {
    const wsBase = this.apiUrl
      .replace(/^https:/, "wss:")
      .replace(/^http:/, "ws:");
    const token = createWsToken(this.identity);
    const wsUrl = `${wsBase}/channels/${encodeURIComponent(channelName)}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      this.subscriptions.set(channelName, ws);
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "message" && data.message) {
          const msg = data.message as ChannelMessage;
          const cbs = this.listeners.get(channelName);
          if (cbs) {
            for (const cb of cbs) {
              cb(msg);
            }
          }
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on("close", () => {
      this.subscriptions.delete(channelName);
      // Only reconnect if there are still listeners registered
      if (this.listeners.has(channelName)) {
        process.stderr.write(
          `[bottel] ws closed for #${channelName}, reconnecting in ${RECONNECT_DELAY_MS / 1000}s…\n`,
        );
        setTimeout(() => {
          if (this.listeners.has(channelName)) {
            this.connectWs(channelName);
          }
        }, RECONNECT_DELAY_MS);
      }
    });

    ws.on("error", (err: Error) => {
      process.stderr.write(
        `[bottel] ws error on #${channelName}: ${err.message}\n`,
      );
      // The 'close' handler will fire after this and handle reconnection.
    });
  }

  private connectDmWs(chatId: string): void {
    const wsBase = this.apiUrl
      .replace(/^https:/, "wss:")
      .replace(/^http:/, "ws:");
    const token = createWsToken(this.identity);
    const wsUrl = `${wsBase}/chat/${encodeURIComponent(chatId)}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      this.dmSubscriptions.set(chatId, ws);
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "message" && data.message) {
          const msg = data.message as DirectMessage;
          msg.content = this.decryptContent(chatId, msg.content);
          const cbs = this.dmListeners.get(chatId);
          if (cbs) {
            for (const cb of cbs) {
              cb(msg);
            }
          }
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on("close", () => {
      this.dmSubscriptions.delete(chatId);
      if (this.dmListeners.has(chatId)) {
        process.stderr.write(
          `[bottel] dm ws closed for chat ${chatId}, reconnecting in ${RECONNECT_DELAY_MS / 1000}s…\n`,
        );
        setTimeout(() => {
          if (this.dmListeners.has(chatId)) {
            this.connectDmWs(chatId);
          }
        }, RECONNECT_DELAY_MS);
      }
    });

    ws.on("error", (err: Error) => {
      process.stderr.write(
        `[bottel] dm ws error on chat ${chatId}: ${err.message}\n`,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Tiny helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
