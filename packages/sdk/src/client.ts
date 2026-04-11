import type {
  Channel,
  ChannelMessage,
  BotIdentity,
  BottelBotOptions,
} from "./types.js";
import { getOrCreateIdentity } from "./identity.js";
import { minePow, hashPayload } from "./pow.js";
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
  private profileCreated: boolean;

  constructor(options?: BottelBotOptions) {
    this.identity = getOrCreateIdentity(options?.configDir);
    this.apiUrl = (options?.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this.name = options?.name ?? DEFAULT_NAME;
    this.subscriptions = new Map();
    this.listeners = new Map();
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
    const headers: Record<string, string> = {
      "X-Fingerprint": this.identity.fingerprint,
      "Content-Type": "application/json",
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

  /** Close all WebSocket connections. */
  close(): void {
    for (const [name, ws] of this.subscriptions) {
      ws.removeAllListeners();
      ws.close();
    }
    this.subscriptions.clear();
    this.listeners.clear();
  }

  /** The bot's fingerprint (derived from its keypair). */
  get fingerprint(): string {
    return this.identity.fingerprint;
  }

  // ---------------------------------------------------------------------------
  // WebSocket internals
  // ---------------------------------------------------------------------------

  private connectWs(channelName: string): void {
    const wsBase = this.apiUrl
      .replace(/^https:/, "wss:")
      .replace(/^http:/, "ws:");
    const wsUrl = `${wsBase}/channels/${encodeURIComponent(channelName)}/ws?fp=${encodeURIComponent(this.identity.fingerprint)}`;

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
}

// ---------------------------------------------------------------------------
// Tiny helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
