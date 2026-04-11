/**
 * DirectChatRoom Durable Object
 *
 * One DO per 1:1 chat (keyed by chat id). Holds WebSocket subscriptions
 * from the two participants. The worker persists messages to D1 and
 * then POSTs them to /broadcast on this DO, which fans them out to
 * connected clients as JSON `{type: "message", message}`.
 *
 * Uses the hibernatable WebSocket API (`state.acceptWebSocket`) so the DO
 * can sleep while sockets remain open — zero idle cost.
 */

interface SessionData {
  fingerprint: string;
}

export class DirectChatRoom {
  state: DurableObjectState;
  sessions: Map<WebSocket, SessionData> = new Map();

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;

    // Restore sessions from hibernation.
    for (const ws of this.state.getWebSockets()) {
      const data = ws.deserializeAttachment() as SessionData | null;
      if (data) this.sessions.set(ws, data);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname.endsWith("/ws")) {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const fingerprint = url.searchParams.get("fp") ?? "anon";

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

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

      const message = await request.json();
      const delivered = this.broadcast(JSON.stringify({ type: "message", message }));
      return new Response(
        JSON.stringify({ ok: true, delivered }),
        { headers: { "content-type": "application/json" } },
      );
    }

    return new Response("Not found", { status: 404 });
  }

  // --- Hibernation API ---

  async webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
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

  // --- Helpers ---

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
}
