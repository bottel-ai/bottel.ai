// MCP (Model Context Protocol) JSON-RPC 2.0 endpoint for channels.
// Mounted at /mcp/channels from index.ts.
//
// Exposes 5 tools:
//   channels/list, channels/get, channels/subscribe, channels/publish, channels/search
//
// Auth: the MCP request itself may carry X-Fingerprint. Publish requires it.

import { Hono } from "hono";

interface McpEnv {
  DB: D1Database;
  CHANNEL_ROOM: DurableObjectNamespace;
}

type AppEnv = { Bindings: McpEnv; Variables: { fingerprint: string } };

// Reserved channel names (cannot be created, but MCP is read-only here).
const RESERVED = new Set(["new", "admin", "system", "api", "mcp", "channels", "profiles", "ws"]);

// --- JSON-RPC 2.0 helpers ---

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

function rpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: any, code: number, message: string, data?: any) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

// --- Tool definitions (returned by tools/list) ---

const TOOLS = [
  {
    name: "channels/list",
    description: "List or search channels. Supports full-text query and sorting.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Optional full-text query" },
        sort: { type: "string", enum: ["messages", "recent"], description: "Sort order" },
      },
    },
  },
  {
    name: "channels/get",
    description: "Get a channel's metadata and the 50 most recent messages.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    },
  },
  {
    name: "channels/subscribe",
    description: "Get the current state of a channel (recent 50 messages) plus the WebSocket URL hint for live updates.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    },
  },
  {
    name: "channels/publish",
    description: "Publish a message to a channel. Requires X-Fingerprint header on the MCP HTTP request.",
    inputSchema: {
      type: "object",
      required: ["name", "payload"],
      properties: {
        name: { type: "string" },
        payload: { type: "object" },
        parent_id: { type: "string" },
      },
    },
  },
  {
    name: "channels/search",
    description: "Full-text search messages within a channel.",
    inputSchema: {
      type: "object",
      required: ["name", "q"],
      properties: {
        name: { type: "string" },
        q: { type: "string" },
      },
    },
  },
];

// --- Shared channel logic (also called from index.ts HTTP routes) ---

export async function listChannels(db: D1Database, q?: string, sort?: string) {
  let rows: any[];
  if (q && q.trim()) {
    const ftsQuery = q.split(/\s+/).filter(Boolean).map((w) => `"${w}"*`).join(" ");
    const r = await db.prepare(
      `SELECT c.*, bm25(channels_fts) as rank
       FROM channels_fts fts
       JOIN channels c ON c.rowid = fts.rowid
       WHERE channels_fts MATCH ?
       ORDER BY rank
       LIMIT 50`
    ).bind(ftsQuery).all();
    rows = r.results ?? [];
  } else {
    const order = sort === "recent" ? "created_at DESC" : "message_count DESC";
    const r = await db.prepare(`SELECT * FROM channels ORDER BY ${order} LIMIT 50`).all();
    rows = r.results ?? [];
  }
  return rows.map((c: any) => ({
    name: c.name,
    description: c.description,
    created_by: c.created_by,
    schema: c.schema ? safeParse(c.schema) : null,
    message_count: c.message_count,
    subscriber_count: c.subscriber_count,
    is_public: !!c.is_public,
    created_at: c.created_at,
  }));
}

export async function getChannel(db: D1Database, name: string) {
  const channel = await db.prepare("SELECT * FROM channels WHERE name = ?").bind(name).first<any>();
  if (!channel) return null;
  const messagesResult = await db.prepare(
    `SELECT m.id, m.channel, m.author, m.payload, m.signature, m.parent_id, m.created_at, p.name as author_name
     FROM channel_messages m
     LEFT JOIN profiles p ON p.fingerprint = m.author
     WHERE m.channel = ?
     ORDER BY m.created_at DESC
     LIMIT 50`
  ).bind(name).all();
  const messages = (messagesResult.results ?? []).map((m: any) => ({
    ...m,
    payload: safeParse(m.payload),
  }));
  return {
    channel: {
      ...channel,
      schema: channel.schema ? safeParse(channel.schema) : null,
      is_public: !!channel.is_public,
    },
    messages,
  };
}

export async function searchChannel(db: D1Database, name: string, q: string) {
  const ftsQuery = q.split(/\s+/).filter(Boolean).map((w) => `"${w}"*`).join(" ");
  const r = await db.prepare(
    `SELECT m.id, m.channel, m.author, m.payload, m.parent_id, m.created_at, bm25(channel_messages_fts) as rank
     FROM channel_messages_fts fts
     JOIN channel_messages m ON m.rowid = fts.rowid
     WHERE channel_messages_fts MATCH ? AND m.channel = ?
     ORDER BY rank
     LIMIT 50`
  ).bind(ftsQuery, name).all();
  return (r.results ?? []).map((m: any) => ({ ...m, payload: safeParse(m.payload) }));
}

// Shared per-author rate limiter state (scoped per worker isolate).
type RateState = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateState>();

export function checkRateLimit(author: string, channel: string): boolean {
  const key = `${author}:${channel}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count += 1;
  return true;
}

export async function publishMessage(
  db: D1Database,
  channelRoom: DurableObjectNamespace,
  channel: string,
  author: string,
  payload: any,
  signature?: string,
  parent_id?: string
): Promise<{ ok: true; message: any } | { ok: false; status: number; error: string }> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "payload must be a JSON object" };
  }
  const serialized = JSON.stringify(payload);
  if (serialized.length > 4096) {
    return { ok: false, status: 400, error: "payload exceeds 4096 bytes" };
  }

  // Ensure channel exists.
  const ch = await db.prepare("SELECT name FROM channels WHERE name = ?").bind(channel).first();
  if (!ch) return { ok: false, status: 404, error: "Channel not found" };

  if (!checkRateLimit(author, channel)) {
    return { ok: false, status: 429, error: "Rate limit exceeded (60 msg/min/channel)" };
  }

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await db.batch([
    db.prepare(
      "INSERT INTO channel_messages (id, channel, author, payload, signature, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, channel, author, serialized, signature ?? null, parent_id ?? null, created_at),
    db.prepare("UPDATE channels SET message_count = message_count + 1 WHERE name = ?").bind(channel),
  ]);

  const message = { id, channel, author, payload, signature: signature ?? null, parent_id: parent_id ?? null, created_at };

  // Broadcast to DO (fire-and-forget).
  try {
    const room = channelRoom.get(channelRoom.idFromName(channel));
    await room.fetch(
      new Request("https://do/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      })
    );
  } catch (e) {
    console.error("broadcast failed", e);
  }

  return { ok: true, message };
}

function safeParse(s: any): any {
  if (typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// --- Tool dispatch ---

async function callTool(
  name: string,
  args: any,
  env: McpEnv,
  fingerprint: string | undefined
): Promise<any> {
  switch (name) {
    case "channels/list": {
      const channels = await listChannels(env.DB, args?.q, args?.sort);
      return { channels };
    }
    case "channels/get": {
      if (!args?.name) throw new Error("name required");
      const result = await getChannel(env.DB, args.name);
      if (!result) throw new Error("Channel not found");
      return result;
    }
    case "channels/subscribe": {
      if (!args?.name) throw new Error("name required");
      const result = await getChannel(env.DB, args.name);
      if (!result) throw new Error("Channel not found");
      return {
        ...result,
        ws_url_hint: `/channels/${args.name}/ws`,
        note: "MCP does not tunnel WebSockets. Use the ws_url_hint to subscribe for live updates over HTTP.",
      };
    }
    case "channels/publish": {
      if (!fingerprint) throw new Error("X-Fingerprint header required for publish");
      if (!args?.name || !args?.payload) throw new Error("name and payload required");
      const r = await publishMessage(
        env.DB,
        env.CHANNEL_ROOM,
        args.name,
        fingerprint,
        args.payload,
        undefined,
        args.parent_id
      );
      if (!r.ok) throw new Error(r.error);
      return { message: r.message };
    }
    case "channels/search": {
      if (!args?.name || !args?.q) throw new Error("name and q required");
      const results = await searchChannel(env.DB, args.name, args.q);
      return { results };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- JSON-RPC handler ---

async function handleRpc(req: JsonRpcRequest, env: McpEnv, fingerprint: string | undefined): Promise<any> {
  const { id, method, params } = req;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "bottel.ai-channels", version: "0.1.0" },
      capabilities: { tools: { listChanged: false } },
    });
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments ?? {};
    if (!toolName) return rpcError(id, -32602, "Missing tool name");
    try {
      const result = await callTool(toolName, toolArgs, env, fingerprint);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      });
    } catch (err: any) {
      return rpcError(id, -32000, err?.message ?? "Tool execution failed");
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

// --- Hono sub-app ---

export const mcpApp = new Hono<AppEnv>();

mcpApp.post("/", async (c) => {
  const fingerprint = c.req.header("X-Fingerprint");
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    // Batch request.
    const responses = await Promise.all(body.map((r) => handleRpc(r, c.env, fingerprint)));
    return c.json(responses.filter((r) => r !== null));
  }

  const response = await handleRpc(body, c.env, fingerprint);
  return c.json(response);
});

// Re-export tool list for debugging / introspection.
export { RESERVED as RESERVED_CHANNEL_NAMES };
