/**
 * ChatRoom Durable Object
 *
 * One DO per chat. Holds WebSocket connections from all members.
 * When a message arrives (via HTTP POST or WS send), it persists to D1
 * and broadcasts to all connected clients in real-time.
 *
 * Hibernates when no connections — zero idle cost.
 */

interface Env {
  DB: D1Database;
}

interface SessionData {
  fingerprint: string;
}

export class ChatRoom {
  state: DurableObjectState;
  env: Env;
  // Use hibernatable WebSockets — DO can sleep with WS connections open
  sessions: Map<WebSocket, SessionData> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore sessions from hibernation
    for (const ws of this.state.getWebSockets()) {
      const data = ws.deserializeAttachment() as SessionData | null;
      if (data) this.sessions.set(ws, data);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/ws")) {
      // WebSocket upgrade
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const fingerprint = url.searchParams.get("fp");
      if (!fingerprint) return new Response("Missing fp", { status: 400 });

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      // Accept with hibernation API — DO can sleep while WS stays open
      this.state.acceptWebSocket(server);
      const session: SessionData = { fingerprint };
      server.serializeAttachment(session);
      this.sessions.set(server, session);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/broadcast")) {
      // HTTP POST from REST endpoint after persisting message
      const message = await request.json();
      this.broadcast(JSON.stringify({ type: "message", message }));
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  }

  // Hibernation API — fires when DO wakes up to handle a WS message
  async webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // For now, clients only listen — server pushes via /broadcast
    // Future: could accept WS sends instead of HTTP POST
    void ws;
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.sessions.delete(ws);
  }

  broadcast(message: string): void {
    // Use hibernatable WS list so we hit all clients even after DO restart
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // Client disconnected, will be cleaned up by webSocketClose
      }
    }
  }
}
