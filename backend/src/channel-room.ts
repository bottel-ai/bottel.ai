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

export class ChannelRoom {
  state: DurableObjectState;
  env: Env;
  // Mirror of hibernatable WS sessions for quick lookup while awake.
  sessions: Map<WebSocket, SessionData> = new Map();
  // Timestamps (ms) of recent broadcasts for rate limiting.
  private broadcastTimestamps: number[] = [];
  // Last value we wrote to D1.subscriber_count, to skip redundant UPDATEs.
  private lastSyncedCount: number | null = null;

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

      // Capture the channel name once (DO is keyed by name but doesn't know
      // it until something tells it). Persist for use after hibernation.
      const channelFromPath = this.parseChannelFromPath(url.pathname);
      if (channelFromPath) {
        const stored = await this.state.storage.get<string>("channel");
        if (!stored) {
          await this.state.storage.put("channel", channelFromPath);
        }
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      // Hibernatable accept — DO can sleep while WS stays open.
      this.state.acceptWebSocket(server);
      const session: SessionData = { fingerprint };
      server.serializeAttachment(session);
      this.sessions.set(server, session);

      // Persist subscriber count to D1 (one cheap UPDATE on join).
      await this.syncSubscriberCount();

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
    await this.syncSubscriberCount();
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.sessions.delete(ws);
    await this.syncSubscriberCount();
  }

  // --- Public helpers ---

  /**
   * Fan out a pre-serialized JSON string to every connected client.
   * Returns the number of sockets we attempted to send to.
   * Also opportunistically prunes dead sockets and syncs the subscriber
   * count to D1 if it changed — this is the self-healing path that covers
   * delayed `webSocketClose` events.
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
      // Fire-and-forget sync; the broadcast response shouldn't wait on D1.
      void this.syncSubscriberCount();
    }
    return count;
  }

  /** Current number of connected subscribers (including hibernated). */
  subscriberCount(): number {
    return this.sessions.size;
  }

  // --- Internal ---

  /**
   * Extract the channel name from a `/channels/:name/ws` URL path.
   * Returns null if the pattern doesn't match.
   */
  private parseChannelFromPath(pathname: string): string | null {
    const m = pathname.match(/\/channels\/([^/]+)\/ws$/);
    return m ? decodeURIComponent(m[1]!) : null;
  }

  /**
   * Persist the live subscriber count to D1. Called on accept and close
   * events only — no timers, no polling. Failures are swallowed because
   * the count is decorative; the live broadcast path is unaffected.
   */
  private async syncSubscriberCount(): Promise<void> {
    const count = this.subscriberCount();
    // Always push live presence to connected sockets so the UI count is
    // accurate without polling. Cheap (one WS frame per socket).
    if (this.lastSyncedCount !== count) {
      this.broadcastPresence(count);
    }
    try {
      const channel = await this.state.storage.get<string>("channel");
      if (!channel) return;
      // Skip the UPDATE if D1 already reflects this number.
      if (this.lastSyncedCount === count) return;
      await this.env.DB
        .prepare("UPDATE channels SET subscriber_count = ? WHERE name = ?")
        .bind(count, channel)
        .run();
      this.lastSyncedCount = count;
    } catch {
      // best-effort: subscriber count is non-critical metadata
    }
  }

  /** Push the current subscriber count to all connected clients. */
  private broadcastPresence(count: number): void {
    const frame = JSON.stringify({ type: "presence", subscribers: count });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(frame);
      } catch {
        // dead socket; will be cleaned up on next broadcast cycle
      }
    }
  }

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
