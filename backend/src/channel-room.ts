/**
 * ChannelRoom Durable Object
 *
 * One DO per channel (keyed by channel name). Holds WebSocket subscriptions
 * from clients following the channel. The worker persists messages to D1 and
 * then POSTs them to /broadcast on this DO, which fans them out to every
 * connected client as JSON `{type: "message", message}`.
 *
 * Uses the hibernatable WebSocket API (`state.acceptWebSocket`) so the DO
 * can sleep while sockets remain open — zero idle cost.
 *
 * Enforces a per-channel rate limit of 1000 broadcast messages / minute.
 */

interface Env {
  DB: D1Database;
}

interface SessionData {
  fingerprint: string;
}

// Rate limit: max 1000 broadcasts per 60s rolling window, per channel.
const RATE_LIMIT_MAX = 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Max concurrent WebSocket connections per channel room.
const MAX_WS_CONNECTIONS = 500;

export class ChannelRoom {
  state: DurableObjectState;
  env: Env;
  // Mirror of hibernatable WS sessions for quick lookup while awake.
  sessions: Map<WebSocket, SessionData> = new Map();
  // Timestamps (ms) of recent broadcasts for rate limiting.
  private broadcastTimestamps: number[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore sessions from hibernation.
    for (const ws of this.state.getWebSockets()) {
      const data = ws.deserializeAttachment() as SessionData | null;
      if (data) this.sessions.set(ws, data);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade — worker routes /channels/:name/ws here.
    if (url.pathname.endsWith("/ws")) {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const fingerprint = url.searchParams.get("fp") ?? "anon";

      // Reject if too many connections.
      if (this.sessions.size >= MAX_WS_CONNECTIONS) {
        return new Response("Too many connections", { status: 503 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      // Hibernatable accept — DO can sleep while WS stays open.
      this.state.acceptWebSocket(server);
      const session: SessionData = { fingerprint };
      server.serializeAttachment(session);
      this.sessions.set(server, session);

      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP POST from the worker after persisting a message to D1.
    if (url.pathname.endsWith("/broadcast")) {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      if (!this.allowBroadcast()) {
        return new Response(
          JSON.stringify({ error: "rate_limited", limit: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS }),
          { status: 429, headers: { "content-type": "application/json" } },
        );
      }

      const message = await request.json();
      const delivered = this.broadcast(JSON.stringify({ type: "message", message }));
      return new Response(
        JSON.stringify({ ok: true, delivered }),
        { headers: { "content-type": "application/json" } },
      );
    }

    // Root GET — subscriber count introspection.
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ subscribers: this.subscriberCount() }),
        { headers: { "content-type": "application/json" } },
      );
    }

    return new Response("Not found", { status: 404 });
  }

  // --- Hibernation API ---

  async webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Clients are receive-only; the worker pushes via /broadcast.
    void ws;
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void code;
    void reason;
    void wasClean;
    this.sessions.delete(ws);
    try {
      ws.close(1000, "closed");
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.sessions.delete(ws);
  }

  // --- Public helpers ---

  /**
   * Fan out a pre-serialized JSON string to every connected client.
   * Returns the number of sockets we attempted to send to.
   */
  broadcast(message: string): number {
    let count = 0;
    const dead: WebSocket[] = [];
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
        count++;
      } catch {
        dead.push(ws);
      }
    }
    if (dead.length > 0) {
      for (const ws of dead) this.sessions.delete(ws);
    }
    return count;
  }

  /** Current number of connected subscribers (including hibernated). */
  subscriberCount(): number {
    return this.sessions.size;
  }

  // --- Internal ---

  /** Returns true and records a broadcast if within the rate limit. */
  private allowBroadcast(): boolean {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    // Drop timestamps outside the rolling window.
    while (this.broadcastTimestamps.length > 0 && this.broadcastTimestamps[0] < cutoff) {
      this.broadcastTimestamps.shift();
    }
    if (this.broadcastTimestamps.length >= RATE_LIMIT_MAX) {
      return false;
    }
    this.broadcastTimestamps.push(now);
    return true;
  }
}
