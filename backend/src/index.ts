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

/** Return 403 if the authenticated user has no profile. */
async function requireProfile(c: any): Promise<Response | null> {
  const fp = c.get("fingerprint");
  const profile = await c.env.DB.prepare(
    "SELECT fingerprint FROM profiles WHERE fingerprint = ?"
  ).bind(fp).first();
  if (!profile) {
    return c.json({ error: "Profile required. Set up your identity first." }, 403);
  }
  return null;
}

import {
  mcpApp,
  listChannels,
  getChannel,
  searchChannel,
  publishMessage,
  checkRateLimit,
  checkPowReplay,
  RESERVED_CHANNEL_NAMES,
} from "./mcp.js";
import { generateChannelKey, encryptPayload } from "./crypto.js";
import { verifyPow } from "./pow.js";
import { getConfig } from "./config.js";

// Re-export the Durable Object classes so wrangler can bind them.
export { ChannelRoom } from "./channel-room.js";
export { DirectChatRoom } from "./chat-room.js";

interface Env {
  DB: D1Database;
  CHANNEL_ROOM: DurableObjectNamespace;
  DIRECT_CHAT_ROOM: DurableObjectNamespace;
}

type AppEnv = { Bindings: Env; Variables: { fingerprint: string } };

const app = new Hono<AppEnv>();

app.use("*", cors());

// Health check
app.get("/", (c) =>
  c.json({ name: "bottel.ai", version: "0.2.0", status: "ok", surfaces: ["profiles", "channels", "mcp"] })
);

// =====================================================================
// Platform stats (cached, refreshed at most once per minute)
// =====================================================================

app.get("/stats", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT channels, users, messages, updated_at FROM platform_stats WHERE key = 'global'"
  ).first<{ channels: number; users: number; messages: number; updated_at: string }>();

  if (!row) return c.json({ channels: 0, users: 0, messages: 0 });

  // Refresh if stale (> 60 seconds old). Synchronous — 3 cheap COUNT(*)s.
  const age = Date.now() - new Date(row.updated_at + "Z").getTime();
  if (age > 60_000) {
    await c.env.DB.prepare(
      `UPDATE platform_stats SET
        channels = (SELECT COUNT(*) FROM channels),
        users    = (SELECT COUNT(*) FROM profiles),
        messages = (SELECT COUNT(*) FROM channel_messages),
        updated_at = datetime('now')
      WHERE key = 'global'`
    ).run();

    const fresh = await c.env.DB.prepare(
      "SELECT channels, users, messages FROM platform_stats WHERE key = 'global'"
    ).first<{ channels: number; users: number; messages: number }>();

    return c.json(fresh ?? { channels: 0, users: 0, messages: 0 });
  }

  return c.json({
    channels: row.channels,
    users: row.users,
    messages: row.messages,
  });
});

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
    "SELECT fingerprint, name, bio, online_at, public FROM profiles WHERE fingerprint = ?"
  )
    .bind(fp)
    .first();
  if (!p) return c.json({ error: "Profile not found" }, 404);
  const online = p.online_at
    ? Date.now() - new Date((p.online_at as string) + "Z").getTime() < 300000
    : false;
  return c.json({
    profile: { fingerprint: p.fingerprint, name: p.name, bio: p.bio, online, public: !!(p as any).public },
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

// POST /channels — create new channel (auth + profile)
app.post("/channels", authMiddleware, async (c) => {
  const profileErr = await requireProfile(c);
  if (profileErr) return profileErr;

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
  const encryptionKey = isPublic ? null : await generateChannelKey();

  await c.env.DB.prepare(
    `INSERT INTO channels (name, description, created_by, schema, message_count, subscriber_count, is_public, encryption_key, created_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, datetime('now'))`
  )
    .bind(body.name, description, fp, schemaStr, isPublic, encryptionKey)
    .run();

  // Auto-follow: creator becomes an active member of their own channel.
  // For private channels this ensures they can always fetch the key via GET /channels/:name/key.
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO channel_follows (channel, follower, status) VALUES (?, ?, 'active')"
  ).bind(body.name, fp).run();

  await c.env.DB.prepare(
    "UPDATE channels SET subscriber_count = (SELECT COUNT(*) FROM channel_follows WHERE channel = ? AND status = 'active') WHERE name = ?"
  ).bind(body.name, body.name).run();

  // FTS sync handled by triggers in schema.sql.

  const channel = await c.env.DB.prepare("SELECT * FROM channels WHERE name = ?")
    .bind(body.name)
    .first();

  // Return key to the creator for private channels; never expose encryption_key in the channel object.
  const response: any = { channel };
  if (encryptionKey) {
    response.key = encryptionKey;
  }
  // Strip encryption_key from the channel object so it's not leaked via the response body.
  if (channel && (channel as any).encryption_key !== undefined) {
    delete (channel as any).encryption_key;
  }
  return c.json(response, 201);
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
             LEFT JOIN profiles p ON p.fingerprint = m.author AND p.public = 1
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

// POST /channels/:name/messages — publish (auth + profile)
app.post("/channels/:name/messages", authMiddleware, async (c) => {
  const profileErr = await requireProfile(c);
  if (profileErr) return profileErr;

  const name = c.req.param("name")!;
  const fp = c.get("fingerprint");
  const body = await c.req.json<{
    payload: any;
    signature?: string;
    parent_id?: string;
    pow?: { nonce: number; timestamp: number };
  }>();

  const cfg = getConfig(c.env as any);

  // ── Proof of Work verification ────────────────────────────────
  if (!body.pow) {
    return c.json({ error: "Proof of work required. Include a pow field with {nonce, timestamp}." }, 400);
  }
  const payloadHash = await (async () => {
    const json = JSON.stringify(body.payload);
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  })();
  const powErr = await verifyPow(name, fp, body.pow, payloadHash, {
    difficulty: cfg.powDifficulty,
    maxAgeMs: cfg.powMaxAgeMs,
  });
  if (powErr) {
    return c.json({ error: powErr }, 400);
  }

  // ── Replay protection ─────────────────────────────────────────
  // Each author's POW timestamp must be strictly increasing per channel.
  // Reusing the same timestamp (= same POW) is rejected.
  const replayErr = checkPowReplay(fp, name, body.pow.timestamp);
  if (replayErr) {
    return c.json({ error: replayErr }, 400);
  }

  // ── Rate limit ────────────────────────────────────────────────
  if (!checkRateLimit(fp, name, cfg.rateLimitPerMin)) {
    return c.json({ error: `Rate limit exceeded (${cfg.rateLimitPerMin} msg/min/channel)` }, 429);
  }

  // Check if the channel has an encryption key (private channel).
  const chEnc = await c.env.DB.prepare("SELECT encryption_key, is_public FROM channels WHERE name = ?")
    .bind(name).first<{ encryption_key: string | null; is_public: number }>();

  // Private channels: only approved (active) members can post.
  if (chEnc && !chEnc.is_public) {
    const membership = await c.env.DB.prepare(
      "SELECT status FROM channel_follows WHERE channel = ? AND follower = ? AND status = 'active'"
    ).bind(name, fp).first();
    if (!membership) {
      return c.json({ error: "Only approved members can post to this private channel." }, 403);
    }
  }

  if (chEnc?.encryption_key) {
    const encPayload = await encryptPayload(JSON.stringify(body.payload), chEnc.encryption_key);
    if (encPayload.length > 8192) {
      return c.json({ error: "encrypted payload too large" }, 400);
    }
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO channel_messages (id, channel, author, payload, signature, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, name, fp, encPayload, body.signature ?? null, body.parent_id ?? null, created_at),
      c.env.DB.prepare("UPDATE channels SET message_count = message_count + 1 WHERE name = ?").bind(name),
    ]);
    // Look up author name for the broadcast (same as publishMessage does).
    const authorProfile = await c.env.DB.prepare("SELECT name FROM profiles WHERE fingerprint = ? AND public = 1")
      .bind(fp).first<{ name: string }>();
    const message = { id, channel: name, author: fp, author_name: authorProfile?.name ?? null, payload: encPayload, signature: body.signature ?? null, parent_id: body.parent_id ?? null, created_at };
    try {
      const room = c.env.CHANNEL_ROOM.get(c.env.CHANNEL_ROOM.idFromName(name));
      await room.fetch(new Request("https://do/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      }));
    } catch {}
    return c.json({ message }, 201);
  }

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

// DELETE /channels/:name — delete channel (creator only, auth + profile)
app.delete("/channels/:name", authMiddleware, async (c) => {
  const profileErr = await requireProfile(c);
  if (profileErr) return profileErr;

  const name = c.req.param("name");
  const fp = c.get("fingerprint");

  const ch = await c.env.DB.prepare("SELECT created_by FROM channels WHERE name = ?")
    .bind(name).first<{ created_by: string }>();
  if (!ch) return c.json({ error: "Channel not found" }, 404);
  if (ch.created_by !== fp) return c.json({ error: "Only the channel creator can delete it" }, 403);

  // Delete in FK order: follows → messages → FTS → channel.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM channel_follows WHERE channel = ?").bind(name),
    c.env.DB.prepare("DELETE FROM channel_messages WHERE channel = ?").bind(name),
    c.env.DB.prepare("DELETE FROM channels WHERE name = ?").bind(name),
  ]);

  return c.body(null, 204);
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

// POST /channels/:name/follow — follow a channel (auth + profile)
// For public channels: immediate active follow.
// For private channels: creates a 'pending' request for the creator to approve.
app.post("/channels/:name/follow", authMiddleware, async (c) => {
  const profileErr = await requireProfile(c);
  if (profileErr) return profileErr;

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

  // Return the encryption key so the newly approved member can decrypt messages.
  const chKey = await c.env.DB.prepare("SELECT encryption_key FROM channels WHERE name = ?")
    .bind(name).first<{ encryption_key: string | null }>();

  return c.json({ status: "active", key: chKey?.encryption_key ?? null });
});

// GET /channels/:name/key — re-fetch decryption key for approved members (auth)
app.get("/channels/:name/key", authMiddleware, async (c) => {
  const name = c.req.param("name");
  const fp = c.get("fingerprint");

  // Check the user is an active member
  const membership = await c.env.DB.prepare(
    "SELECT status FROM channel_follows WHERE channel = ? AND follower = ? AND status = 'active'"
  ).bind(name, fp).first();
  if (!membership) return c.json({ error: "Not an active member" }, 403);

  const ch = await c.env.DB.prepare("SELECT encryption_key FROM channels WHERE name = ?")
    .bind(name).first<{ encryption_key: string | null }>();
  if (!ch) return c.json({ error: "Channel not found" }, 404);

  return c.json({ key: ch.encryption_key });
});

// NOTE: If a PUT/PATCH endpoint for channels is ever added, `is_public` MUST NOT be changeable.
// Changing a channel's visibility after creation would break encryption invariants
// (public channels have no key; private channels always have one).

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
// Direct Chats (1:1)
// =====================================================================

// POST /chat/new — create or return existing 1:1 chat (auth + profile)
app.post("/chat/new", authMiddleware, async (c) => {
  const profileErr = await requireProfile(c);
  if (profileErr) return profileErr;

  const fp = c.get("fingerprint");
  const body = await c.req.json<{ participant: string }>();
  if (!body.participant) return c.json({ error: "participant required" }, 400);

  // Look up by fingerprint first, then by name if not found.
  let otherFp = body.participant;
  let other = await c.env.DB.prepare(
    "SELECT fingerprint FROM profiles WHERE fingerprint = ?"
  ).bind(otherFp).first<{ fingerprint: string }>();
  if (!other) {
    // Try exact name match (case-insensitive).
    other = await c.env.DB.prepare(
      "SELECT fingerprint FROM profiles WHERE LOWER(name) = LOWER(?)"
    ).bind(otherFp).first<{ fingerprint: string }>();
    if (!other) {
      // Try bot_ID format: strip "bot_" prefix and search fingerprints
      // that contain the suffix. The bot_ID is computed from the fingerprint
      // hash with non-alphanumeric chars stripped, so we search with LIKE.
      const idSuffix = otherFp.startsWith("bot_") ? otherFp.slice(4) : otherFp;
      other = await c.env.DB.prepare(
        "SELECT fingerprint FROM profiles WHERE fingerprint LIKE ? LIMIT 1"
      ).bind(`%${idSuffix}%`).first<{ fingerprint: string }>();
    }
    if (!other) {
      // Final fallback: partial name match.
      other = await c.env.DB.prepare(
        "SELECT fingerprint FROM profiles WHERE LOWER(name) LIKE LOWER(?) LIMIT 1"
      ).bind(`%${otherFp}%`).first<{ fingerprint: string }>();
    }
    if (!other) return c.json({ error: "Bot not found. Try a name, bot_ID, or fingerprint." }, 404);
    otherFp = other.fingerprint;
  }
  if (otherFp === fp) return c.json({ error: "Cannot chat with yourself" }, 400);

  // Check if chat already exists (order-independent)
  const existing = await c.env.DB.prepare(
    `SELECT id, created_by, participant_a, participant_b, created_at FROM direct_chats
     WHERE (participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)`
  ).bind(fp, otherFp, otherFp, fp).first();

  if (existing) {
    return c.json({ chat: existing });
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO direct_chats (id, created_by, participant_a, participant_b, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).bind(id, fp, fp, otherFp).run();

  const chat = await c.env.DB.prepare(
    "SELECT id, created_by, participant_a, participant_b, created_at FROM direct_chats WHERE id = ?"
  ).bind(id).first();

  return c.json({ chat }, 201);
});

// GET /chat/list — all chats for the current user (auth)
app.get("/chat/list", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");

  const result = await c.env.DB.prepare(
    `SELECT
       dc.id,
       dc.created_by,
       CASE WHEN dc.participant_a = ? THEN dc.participant_b ELSE dc.participant_a END AS other_fp,
       p.name AS other_name,
       dm.content AS last_message,
       dm.created_at AS last_message_at
     FROM direct_chats dc
     LEFT JOIN profiles p ON p.fingerprint = CASE WHEN dc.participant_a = ? THEN dc.participant_b ELSE dc.participant_a END
     LEFT JOIN direct_messages dm ON dm.id = (
       SELECT id FROM direct_messages WHERE chat_id = dc.id ORDER BY created_at DESC LIMIT 1
     )
     WHERE dc.participant_a = ? OR dc.participant_b = ?
     ORDER BY COALESCE(dm.created_at, dc.created_at) DESC`
  ).bind(fp, fp, fp, fp).all();

  return c.json({ chats: result.results ?? [] });
});

// GET /chat/:id/messages — messages with pagination (auth)
app.get("/chat/:id/messages", authMiddleware, async (c) => {
  const chatId = c.req.param("id")!;
  const fp = c.get("fingerprint");

  // Verify participant
  const chat = await c.env.DB.prepare(
    "SELECT id FROM direct_chats WHERE id = ? AND (participant_a = ? OR participant_b = ?)"
  ).bind(chatId, fp, fp).first();
  if (!chat) return c.json({ error: "Chat not found or access denied" }, 404);

  const before = c.req.query("before");
  const limitRaw = parseInt(c.req.query("limit") || "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  let sql = `SELECT dm.id, dm.chat_id, dm.sender, p.name AS sender_name, dm.content, dm.created_at
             FROM direct_messages dm
             LEFT JOIN profiles p ON p.fingerprint = dm.sender AND p.public = 1
             WHERE dm.chat_id = ?`;
  const bindings: any[] = [chatId];
  if (before) {
    sql += " AND dm.created_at < ?";
    bindings.push(before);
  }
  sql += " ORDER BY dm.created_at DESC LIMIT ?";
  bindings.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...bindings).all();
  return c.json({ messages: result.results ?? [] });
});

// POST /chat/:id/messages — send a DM (auth + profile)
app.post("/chat/:id/messages", authMiddleware, async (c) => {
  const profileErr = await requireProfile(c);
  if (profileErr) return profileErr;

  const chatId = c.req.param("id")!;
  const fp = c.get("fingerprint");
  const body = await c.req.json<{ content: string }>();
  if (!body.content) return c.json({ error: "content required" }, 400);

  // Verify participant
  const chat = await c.env.DB.prepare(
    "SELECT id FROM direct_chats WHERE id = ? AND (participant_a = ? OR participant_b = ?)"
  ).bind(chatId, fp, fp).first();
  if (!chat) return c.json({ error: "Chat not found or access denied" }, 404);

  // Rate limit: 60 msg/min per chat
  if (!checkRateLimit(fp, chatId, 60)) {
    return c.json({ error: "Rate limit exceeded (60 msg/min per chat)" }, 429);
  }

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await c.env.DB.prepare(
    "INSERT INTO direct_messages (id, chat_id, sender, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, chatId, fp, body.content, created_at).run();

  const senderProfile = await c.env.DB.prepare(
    "SELECT name FROM profiles WHERE fingerprint = ? AND public = 1"
  ).bind(fp).first<{ name: string }>();

  const message = {
    id,
    chat_id: chatId,
    sender: fp,
    sender_name: senderProfile?.name ?? null,
    content: body.content,
    created_at,
  };

  // Broadcast via DirectChatRoom DO
  try {
    const room = c.env.DIRECT_CHAT_ROOM.get(c.env.DIRECT_CHAT_ROOM.idFromName(chatId!));
    await room.fetch(new Request("https://do/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    }));
  } catch {}

  return c.json({ message }, 201);
});

// DELETE /chat/:id — delete chat (creator only, auth)
app.delete("/chat/:id", authMiddleware, async (c) => {
  const chatId = c.req.param("id")!;
  const fp = c.get("fingerprint");

  const chat = await c.env.DB.prepare(
    "SELECT created_by FROM direct_chats WHERE id = ?"
  ).bind(chatId).first<{ created_by: string }>();
  if (!chat) return c.json({ error: "Chat not found" }, 404);
  if (chat.created_by !== fp) return c.json({ error: "Only the chat creator can delete it" }, 403);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM direct_messages WHERE chat_id = ?").bind(chatId),
    c.env.DB.prepare("DELETE FROM direct_chats WHERE id = ?").bind(chatId),
  ]);

  return c.body(null, 204);
});

// GET /chat/:id/ws — WebSocket upgrade via DirectChatRoom DO
// No authMiddleware — WS upgrades can't send custom headers.
// Auth is via the fp query param (same as channel WS).
app.get("/chat/:id/ws", async (c) => {
  const chatId = c.req.param("id")!;
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "fp query param required" }, 400);

  // Verify participant
  const chat = await c.env.DB.prepare(
    "SELECT id FROM direct_chats WHERE id = ? AND (participant_a = ? OR participant_b = ?)"
  ).bind(chatId, fp, fp).first();
  if (!chat) return c.json({ error: "Chat not found or access denied" }, 404);

  const room = c.env.DIRECT_CHAT_ROOM.get(c.env.DIRECT_CHAT_ROOM.idFromName(chatId));
  const doUrl = new URL(`https://do/chat/${encodeURIComponent(chatId)}/ws`);
  doUrl.searchParams.set("fp", fp);
  return room.fetch(new Request(doUrl.toString(), c.req.raw));
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
