// bottel.ai backend — HTTP entry point.
//
// Exposes three surfaces:
//   1. /profiles — user/bot identity (unchanged semantics)
//   2. /channels — public channels + messages + WebSocket (new, replaces /chat and /social)
//   3. /mcp/channels — JSON-RPC 2.0 MCP endpoint wrapping the channels logic
//
// All apps/chat/social routes have been removed.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth.js";
import {
  mcpApp,
  listChannels,
  getChannel,
  searchChannel,
  publishMessage,
  RESERVED_CHANNEL_NAMES,
} from "./mcp.js";

// Re-export the Durable Object class so wrangler can bind it.
export { ChannelRoom } from "./channel-room.js";

interface Env {
  DB: D1Database;
  CHANNEL_ROOM: DurableObjectNamespace;
}

type AppEnv = { Bindings: Env; Variables: { fingerprint: string } };

const app = new Hono<AppEnv>();

app.use("*", cors());

// Health check
app.get("/", (c) =>
  c.json({ name: "bottel.ai", version: "0.2.0", status: "ok", surfaces: ["profiles", "channels", "mcp"] })
);

// =====================================================================
// Profiles
// =====================================================================

// POST /profiles — create/update own profile (auth)
app.post("/profiles", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const { name, bio, public: isPublic } = await c.req.json<{
    name: string;
    bio?: string;
    public?: boolean;
  }>();
  if (!name) return c.json({ error: "name required" }, 400);

  await c.env.DB.prepare(
    `INSERT INTO profiles (fingerprint, name, bio, public, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(fingerprint) DO UPDATE SET name=?, bio=?, public=?`
  )
    .bind(fp, name, bio || "", isPublic ? 1 : 0, name, bio || "", isPublic ? 1 : 0)
    .run();

  return c.json({ ok: true });
});

// GET /profiles — list/search public profiles (LIKE-based; profiles_fts removed)
app.get("/profiles", async (c) => {
  const q = c.req.query("q");
  let result;
  if (q) {
    result = await c.env.DB.prepare(
      `SELECT fingerprint, name, bio, online_at
       FROM profiles
       WHERE public = 1 AND (name LIKE ? OR bio LIKE ?)
       ORDER BY name
       LIMIT 20`
    )
      .bind(`%${q}%`, `%${q}%`)
      .all();
  } else {
    result = await c.env.DB.prepare(
      "SELECT fingerprint, name, bio, online_at FROM profiles WHERE public = 1 ORDER BY name LIMIT 20"
    ).all();
  }

  const now = Date.now();
  const profiles = (result.results ?? []).map((p: any) => ({
    fingerprint: p.fingerprint,
    name: p.name,
    bio: p.bio,
    online: p.online_at ? now - new Date(p.online_at + "Z").getTime() < 300000 : false,
  }));
  return c.json({ profiles });
});

// GET /profiles/:fp — single profile
app.get("/profiles/:fp", async (c) => {
  const fp = c.req.param("fp")!;
  const p = await c.env.DB.prepare(
    "SELECT fingerprint, name, bio, online_at FROM profiles WHERE fingerprint = ?"
  )
    .bind(fp)
    .first();
  if (!p) return c.json({ error: "Profile not found" }, 404);
  const online = p.online_at
    ? Date.now() - new Date((p.online_at as string) + "Z").getTime() < 300000
    : false;
  return c.json({
    profile: { fingerprint: p.fingerprint, name: p.name, bio: p.bio, online },
  });
});

// POST /profiles/ping — heartbeat (auth)
app.post("/profiles/ping", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  await c.env.DB.prepare("UPDATE profiles SET online_at = datetime('now') WHERE fingerprint = ?")
    .bind(fp)
    .run();
  return c.json({ ok: true });
});

// =====================================================================
// Channels
// =====================================================================

const CHANNEL_NAME_RE = /^[a-z0-9-]{1,50}$/;

// GET /channels?q=&sort=
app.get("/channels", async (c) => {
  const q = c.req.query("q");
  const sort = c.req.query("sort");
  const channels = await listChannels(c.env.DB, q, sort);
  return c.json({ channels });
});

// GET /channels/:name — metadata + recent 50 messages
app.get("/channels/:name", async (c) => {
  const name = c.req.param("name");
  const result = await getChannel(c.env.DB, name);
  if (!result) return c.json({ error: "Channel not found" }, 404);
  return c.json(result);
});

// POST /channels — create new channel (auth)
app.post("/channels", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const body = await c.req.json<{ name: string; description?: string; schema?: any; isPublic?: boolean }>();

  if (!body.name || !CHANNEL_NAME_RE.test(body.name)) {
    return c.json(
      { error: "Invalid name. Must be lowercase a-z, 0-9, dash; 1-50 chars." },
      400
    );
  }
  if (RESERVED_CHANNEL_NAMES.has(body.name)) {
    return c.json({ error: "Reserved channel name" }, 400);
  }
  const description = (body.description ?? "").slice(0, 280);
  if (body.description && body.description.length > 280) {
    return c.json({ error: "description exceeds 280 characters" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT name FROM channels WHERE name = ?")
    .bind(body.name)
    .first();
  if (existing) return c.json({ error: "Channel already exists" }, 409);

  const schemaStr = body.schema ? JSON.stringify(body.schema) : null;

  const isPublic = body.isPublic !== false ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO channels (name, description, created_by, schema, message_count, subscriber_count, is_public, created_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, datetime('now'))`
  )
    .bind(body.name, description, fp, schemaStr, isPublic)
    .run();

  // FTS sync handled by triggers in schema.sql.

  const channel = await c.env.DB.prepare("SELECT * FROM channels WHERE name = ?")
    .bind(body.name)
    .first();
  return c.json({ channel }, 201);
});

// GET /channels/:name/messages?since=&before=&limit=
//   since=<iso>  → messages strictly newer than that timestamp
//   before=<iso> → messages strictly older than that timestamp (for pagination
//                  when scrolling up in the channel view)
//   limit=<n>    → max messages to return (default 50, hard cap 200)
app.get("/channels/:name/messages", async (c) => {
  const name = c.req.param("name");
  const since = c.req.query("since");
  const before = c.req.query("before");
  const limitRaw = parseInt(c.req.query("limit") || "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  let sql = `SELECT m.id, m.channel, m.author, m.payload, m.signature, m.parent_id, m.created_at, p.name as author_name
             FROM channel_messages m
             LEFT JOIN profiles p ON p.fingerprint = m.author
             WHERE m.channel = ?`;
  const bindings: any[] = [name];
  if (since) {
    sql += " AND m.created_at > ?";
    bindings.push(since);
  }
  if (before) {
    sql += " AND m.created_at < ?";
    bindings.push(before);
  }
  sql += " ORDER BY m.created_at DESC LIMIT ?";
  bindings.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...bindings).all();
  const messages = (result.results ?? []).map((m: any) => {
    let payload: any = m.payload;
    try {
      payload = JSON.parse(m.payload);
    } catch {}
    return { ...m, payload };
  });
  return c.json({ messages });
});

// POST /channels/:name/messages — publish (auth)
app.post("/channels/:name/messages", authMiddleware, async (c) => {
  const name = c.req.param("name")!;
  const fp = c.get("fingerprint");
  const body = await c.req.json<{ payload: any; signature?: string; parent_id?: string }>();

  const r = await publishMessage(
    c.env.DB,
    c.env.CHANNEL_ROOM,
    name,
    fp,
    body.payload,
    body.signature,
    body.parent_id
  );
  if (!r.ok) return c.json({ error: r.error }, r.status as any);
  return c.json({ message: r.message }, 201);
});

// GET /channels/:name/ws — WebSocket upgrade via the ChannelRoom DO
app.get("/channels/:name/ws", async (c) => {
  const name = c.req.param("name");
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "fp query param required" }, 400);

  const channel = await c.env.DB.prepare("SELECT name FROM channels WHERE name = ?")
    .bind(name)
    .first();
  if (!channel) return c.json({ error: "Channel not found" }, 404);

  const room = c.env.CHANNEL_ROOM.get(c.env.CHANNEL_ROOM.idFromName(name));
  // Include channel name in the forwarded path so the DO can learn it
  // (needed for subscriber-count sync to D1 on join/leave events).
  const doUrl = new URL(`https://do/channels/${encodeURIComponent(name)}/ws`);
  doUrl.searchParams.set("fp", fp);
  return room.fetch(new Request(doUrl.toString(), c.req.raw));
});

// POST /channels/:name/search?q=
app.post("/channels/:name/search", async (c) => {
  const name = c.req.param("name");
  const q = c.req.query("q");
  if (!q) return c.json({ error: "q query param required" }, 400);
  const messages = await searchChannel(c.env.DB, name, q);
  return c.json({ messages });
});

// DELETE /channels/:name/messages/:id — author only, within 5 min
app.delete("/channels/:name/messages/:id", authMiddleware, async (c) => {
  const name = c.req.param("name");
  const id = c.req.param("id");
  const fp = c.get("fingerprint");

  const msg = await c.env.DB.prepare(
    "SELECT id, author, created_at FROM channel_messages WHERE id = ? AND channel = ?"
  )
    .bind(id, name)
    .first<{ id: string; author: string; created_at: string }>();
  if (!msg) return c.json({ error: "Message not found" }, 404);
  if (msg.author !== fp) return c.json({ error: "Not the author" }, 403);

  const withinWindow = await c.env.DB.prepare(
    "SELECT 1 WHERE datetime('now') <= datetime(?, '+5 minutes')"
  )
    .bind(msg.created_at)
    .first();
  if (!withinWindow) return c.json({ error: "Delete window expired (5 minutes)" }, 403);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM channel_messages WHERE id = ?").bind(id),
    c.env.DB
      .prepare("UPDATE channels SET message_count = MAX(0, message_count - 1) WHERE name = ?")
      .bind(name),
  ]);

  return c.body(null, 204);
});

// =====================================================================
// Channel follows
// =====================================================================

// POST /channels/:name/follow — follow a channel (auth)
// For public channels: immediate active follow.
// For private channels: creates a 'pending' request for the creator to approve.
app.post("/channels/:name/follow", authMiddleware, async (c) => {
  const name = c.req.param("name");
  const fp = c.get("fingerprint");

  const ch = await c.env.DB.prepare("SELECT name, is_public, created_by FROM channels WHERE name = ?")
    .bind(name)
    .first<{ name: string; is_public: number; created_by: string }>();
  if (!ch) return c.json({ error: "Channel not found" }, 404);

  // Already following?
  const existing = await c.env.DB.prepare(
    "SELECT status FROM channel_follows WHERE channel = ? AND follower = ?"
  ).bind(name, fp).first<{ status: string }>();
  if (existing) {
    return c.json({ status: existing.status, already: true });
  }

  const status = ch.is_public ? "active" : "pending";
  await c.env.DB.prepare(
    "INSERT INTO channel_follows (channel, follower, status) VALUES (?, ?, ?)"
  ).bind(name, fp, status).run();

  // Update subscriber_count (only count active follows).
  if (status === "active") {
    await c.env.DB.prepare(
      "UPDATE channels SET subscriber_count = (SELECT COUNT(*) FROM channel_follows WHERE channel = ? AND status = 'active') WHERE name = ?"
    ).bind(name, name).run();
  }

  return c.json({ status }, 201);
});

// DELETE /channels/:name/follow — unfollow (auth)
app.delete("/channels/:name/follow", authMiddleware, async (c) => {
  const name = c.req.param("name");
  const fp = c.get("fingerprint");

  await c.env.DB.prepare(
    "DELETE FROM channel_follows WHERE channel = ? AND follower = ?"
  ).bind(name, fp).run();

  await c.env.DB.prepare(
    "UPDATE channels SET subscriber_count = (SELECT COUNT(*) FROM channel_follows WHERE channel = ? AND status = 'active') WHERE name = ?"
  ).bind(name, name).run();

  return c.body(null, 204);
});

// GET /channels/:name/follow — check if current user follows (auth)
app.get("/channels/:name/follow", authMiddleware, async (c) => {
  const name = c.req.param("name");
  const fp = c.get("fingerprint");

  const row = await c.env.DB.prepare(
    "SELECT status FROM channel_follows WHERE channel = ? AND follower = ?"
  ).bind(name, fp).first<{ status: string }>();

  return c.json({ following: !!row, status: row?.status ?? null });
});

// POST /channels/:name/follow/:fp/approve — creator approves a pending follow (auth)
app.post("/channels/:name/follow/:fp/approve", authMiddleware, async (c) => {
  const name = c.req.param("name");
  const targetFp = c.req.param("fp");
  const creatorFp = c.get("fingerprint");

  const ch = await c.env.DB.prepare("SELECT created_by FROM channels WHERE name = ?")
    .bind(name).first<{ created_by: string }>();
  if (!ch) return c.json({ error: "Channel not found" }, 404);
  if (ch.created_by !== creatorFp) return c.json({ error: "Only the channel creator can approve" }, 403);

  const pending = await c.env.DB.prepare(
    "SELECT status FROM channel_follows WHERE channel = ? AND follower = ? AND status = 'pending'"
  ).bind(name, targetFp).first();
  if (!pending) return c.json({ error: "No pending follow request" }, 404);

  await c.env.DB.prepare(
    "UPDATE channel_follows SET status = 'active' WHERE channel = ? AND follower = ?"
  ).bind(name, targetFp).run();

  await c.env.DB.prepare(
    "UPDATE channels SET subscriber_count = (SELECT COUNT(*) FROM channel_follows WHERE channel = ? AND status = 'active') WHERE name = ?"
  ).bind(name, name).run();

  return c.json({ status: "active" });
});

// GET /channels/:name/followers — list followers (for creator to manage)
app.get("/channels/:name/followers", async (c) => {
  const name = c.req.param("name");
  const status = c.req.query("status"); // optional: 'pending' | 'active'

  let sql = `SELECT cf.follower, cf.status, cf.created_at, p.name as follower_name
             FROM channel_follows cf
             LEFT JOIN profiles p ON p.fingerprint = cf.follower
             WHERE cf.channel = ?`;
  const bindings: any[] = [name];
  if (status) {
    sql += " AND cf.status = ?";
    bindings.push(status);
  }
  sql += " ORDER BY cf.created_at DESC";

  const result = await c.env.DB.prepare(sql).bind(...bindings).all();
  return c.json({ followers: result.results ?? [] });
});

// =====================================================================
// MCP (JSON-RPC 2.0)
// =====================================================================

app.route("/mcp/channels", mcpApp);

// =====================================================================
// Error handler
// =====================================================================

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
