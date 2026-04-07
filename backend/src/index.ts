import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth.js";

export { ChatRoom } from "./chat-room.js";

interface Env {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env; Variables: { fingerprint: string } }>();

app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ name: "bottel.ai", version: "0.1.0", status: "ok" }));

// GET /apps — list/search/filter apps (FTS5 powered)
app.get("/apps", async (c) => {
  const q = c.req.query("q");
  const author = c.req.query("author");

  let result;

  if (q && !author) {
    // FTS5 search with prefix matching and BM25 ranking
    const ftsQuery = q.split(/\s+/).filter(Boolean).map(w => `"${w}"*`).join(" ");
    result = await c.env.DB.prepare(
      `SELECT a.*, bm25(apps_fts) as rank
       FROM apps_fts fts
       JOIN apps a ON a.rowid = fts.rowid
       WHERE apps_fts MATCH ?
       ORDER BY rank
       LIMIT 50`
    ).bind(ftsQuery).all();
  } else {
    // Filter by author or list all
    let sql = "SELECT * FROM apps";
    const bindings: string[] = [];
    if (author) {
      sql += " WHERE public_key = ?";
      bindings.push(author);
    }
    sql += " ORDER BY installs DESC LIMIT 50";
    const stmt = c.env.DB.prepare(sql);
    result = bindings.length > 0 ? await stmt.bind(...bindings).all() : await stmt.all();
  }

  const apps = (result.results ?? []).map((app: any) => ({
    ...app,
    rank: undefined,
    capabilities: JSON.parse((app.capabilities as string) || "[]"),
  }));

  return c.json({ apps });
});

// GET /apps/:slug — single app
app.get("/apps/:slug", async (c) => {
  const slug = c.req.param("slug");

  const app = await c.env.DB.prepare(
    `SELECT a.*, p.name as author_name FROM apps a
     LEFT JOIN profiles p ON p.fingerprint = a.public_key
     WHERE a.slug = ?`
  ).bind(slug).first();

  if (!app) {
    return c.json({ error: "App not found" }, 404);
  }

  return c.json({
    app: {
      ...app,
      capabilities: JSON.parse((app.capabilities as string) || "[]"),
    },
  });
});

// POST /apps — submit new app (requires auth)
app.post("/apps", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");

  const body = await c.req.json<{
    name: string;
    slug: string;
    description: string;
    category: string;
    version: string;
    longDescription?: string;
    capabilities?: string[];
    mcpUrl?: string;
    npmPackage?: string;
  }>();

  if (!body.name || !body.slug || !body.description || !body.category || !body.version) {
    return c.json({ error: "name, slug, description, category, and version are required" }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO apps (id, name, slug, description, long_description, category, author, version, capabilities, public_key, mcp_url, npm_package)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.name,
    body.slug,
    body.description,
    body.longDescription ?? "",
    body.category,
    fingerprint,
    body.version,
    JSON.stringify(body.capabilities ?? []),
    fingerprint,
    body.mcpUrl ?? "",
    body.npmPackage ?? ""
  ).run();

  // Sync FTS index
  const inserted = await c.env.DB.prepare("SELECT rowid FROM apps WHERE id = ?").bind(id).first<{ rowid: number }>();
  if (inserted) {
    await c.env.DB.prepare("INSERT INTO apps_fts(rowid, name, description, slug) VALUES (?, ?, ?, ?)")
      .bind(inserted.rowid, body.name, body.description, body.slug).run();
  }

  const app = await c.env.DB.prepare("SELECT * FROM apps WHERE id = ?")
    .bind(id).first();

  return c.json({
    app: {
      ...app,
      capabilities: JSON.parse((app?.capabilities as string) || "[]"),
    },
  });
});

// PUT /apps/:slug — update app (auth required, must own it)
app.put("/apps/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const fingerprint = c.get("fingerprint");

  // Check ownership
  const existing = await c.env.DB.prepare("SELECT * FROM apps WHERE slug = ? AND public_key = ?")
    .bind(slug, fingerprint).first();
  if (!existing) return c.json({ error: "App not found or not owned by you" }, 404);

  const body = await c.req.json<{ name?: string; description?: string; version?: string }>();

  // Build UPDATE dynamically for provided fields
  const updates: string[] = [];
  const values: string[] = [];
  if (body.name) { updates.push("name = ?"); values.push(body.name); }
  if (body.description) { updates.push("description = ?"); values.push(body.description); }
  if (body.version) { updates.push("version = ?"); values.push(body.version); }

  if (updates.length === 0) return c.json({ error: "No fields to update" }, 400);

  await c.env.DB.prepare(`UPDATE apps SET ${updates.join(", ")} WHERE slug = ? AND public_key = ?`)
    .bind(...values, slug, fingerprint).run();

  // Sync FTS index
  const row = await c.env.DB.prepare("SELECT rowid, name, description, slug FROM apps WHERE slug = ?").bind(slug).first<{ rowid: number; name: string; description: string; slug: string }>();
  if (row) {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO apps_fts(apps_fts, rowid, name, description, slug) VALUES ('delete', ?, ?, ?, ?)").bind(row.rowid, (existing as any).name, (existing as any).description, slug),
      c.env.DB.prepare("INSERT INTO apps_fts(rowid, name, description, slug) VALUES (?, ?, ?, ?)").bind(row.rowid, row.name, row.description, row.slug),
    ]);
  }

  const updated = await c.env.DB.prepare("SELECT * FROM apps WHERE slug = ?").bind(slug).first();
  return c.json({ app: { ...updated, capabilities: JSON.parse((updated as any).capabilities || "[]"), verified: !!(updated as any).verified } });
});

// DELETE /apps/:slug — delete app (auth required, must own it)
app.delete("/apps/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const fingerprint = c.get("fingerprint");

  // Get rowid before delete for FTS cleanup
  const row = await c.env.DB.prepare("SELECT rowid, name, description FROM apps WHERE slug = ? AND public_key = ?")
    .bind(slug, fingerprint).first<{ rowid: number; name: string; description: string }>();
  if (!row) return c.json({ error: "App not found or not owned by you" }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO apps_fts(apps_fts, rowid, name, description, slug) VALUES ('delete', ?, ?, ?, ?)").bind(row.rowid, row.name, row.description, slug),
    c.env.DB.prepare("DELETE FROM apps WHERE slug = ? AND public_key = ?").bind(slug, fingerprint),
  ]);

  return c.json({ ok: true });
});

// --- Profile endpoints ---

// POST /profiles — create/update profile (auth)
app.post("/profiles", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const { name, bio, public: isPublic } = await c.req.json<{ name: string; bio?: string; public?: boolean }>();
  if (!name) return c.json({ error: "name required" }, 400);
  // Check if profile exists for FTS sync
  const existing = await c.env.DB.prepare("SELECT rowid, name, bio FROM profiles WHERE fingerprint = ?").bind(fp).first<{ rowid: number; name: string; bio: string }>();

  await c.env.DB.prepare(
    "INSERT INTO profiles (fingerprint, name, bio, public, created_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(fingerprint) DO UPDATE SET name=?, bio=?, public=?"
  ).bind(fp, name, bio || "", isPublic ? 1 : 0, name, bio || "", isPublic ? 1 : 0).run();

  // Sync FTS index
  const row = await c.env.DB.prepare("SELECT rowid FROM profiles WHERE fingerprint = ?").bind(fp).first<{ rowid: number }>();
  if (row) {
    const batch = [];
    if (existing) {
      batch.push(c.env.DB.prepare("INSERT INTO profiles_fts(profiles_fts, rowid, name, bio) VALUES ('delete', ?, ?, ?)").bind(existing.rowid, existing.name, existing.bio));
    }
    batch.push(c.env.DB.prepare("INSERT INTO profiles_fts(rowid, name, bio) VALUES (?, ?, ?)").bind(row.rowid, name, bio || ""));
    await c.env.DB.batch(batch);
  }

  return c.json({ ok: true });
});

// GET /profiles — search public profiles (FTS5 powered)
app.get("/profiles", async (c) => {
  const q = c.req.query("q");
  let result;

  if (q) {
    const ftsQuery = q.split(/\s+/).filter(Boolean).map(w => `"${w}"*`).join(" ");
    result = await c.env.DB.prepare(
      `SELECT p.fingerprint, p.name, p.bio, p.online_at
       FROM profiles_fts fts
       JOIN profiles p ON p.rowid = fts.rowid
       WHERE profiles_fts MATCH ? AND p.public = 1
       ORDER BY bm25(profiles_fts)
       LIMIT 20`
    ).bind(ftsQuery).all();
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
    online: p.online_at ? (now - new Date(p.online_at + "Z").getTime()) < 300000 : false,
  }));
  return c.json({ profiles });
});

// GET /profiles/:fp — single profile
app.get("/profiles/:fp", async (c) => {
  const fp = c.req.param("fp")!;
  const p = await c.env.DB.prepare("SELECT fingerprint, name, bio, online_at FROM profiles WHERE fingerprint = ?").bind(fp).first();
  if (!p) return c.json({ error: "Profile not found" }, 404);
  const online = p.online_at ? (Date.now() - new Date((p.online_at as string) + "Z").getTime()) < 300000 : false;
  return c.json({ profile: { fingerprint: p.fingerprint, name: p.name, bio: p.bio, online } });
});

// POST /profiles/ping — heartbeat (auth)
app.post("/profiles/ping", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  await c.env.DB.prepare("UPDATE profiles SET online_at = datetime('now') WHERE fingerprint = ?").bind(fp).run();
  return c.json({ ok: true });
});

// --- Chat endpoints ---

// POST /chat/contacts — add contact
app.post("/chat/contacts", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const { contact, alias } = await c.req.json<{ contact: string; alias?: string }>();
  if (!contact) return c.json({ error: "contact fingerprint required" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO contacts (owner, contact, alias) VALUES (?, ?, ?)")
    .bind(fingerprint, contact, alias || "").run();
  return c.json({ ok: true });
});

// POST /chat/new — create or find existing direct chat
app.post("/chat/new", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const { contact } = await c.req.json<{ contact: string }>();
  if (!contact) return c.json({ error: "contact fingerprint required" }, 400);

  // Check if a direct chat already exists between these two users
  const existing = await c.env.DB.prepare(`
    SELECT c.id FROM chats c
    JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.member = ?
    JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.member = ?
    WHERE c.type = 'direct'
    LIMIT 1
  `).bind(fingerprint, contact).first<{ id: string }>();

  if (existing) {
    return c.json({ chat: { id: existing.id, type: "direct", name: "", members: [fingerprint, contact] } });
  }

  // Create new chat
  const chatId = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO chats (id, type, name, created_by) VALUES (?, ?, ?, ?)")
    .bind(chatId, "direct", "", fingerprint).run();

  const allMembers = [fingerprint, ...(contact !== fingerprint ? [contact] : [])];
  for (const member of allMembers) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO chat_members (chat_id, member) VALUES (?, ?)")
      .bind(chatId, member).run();
  }

  return c.json({ chat: { id: chatId, type: "direct", name: "", members: allMembers } });
});

// GET /chat/list — list user's chats
app.get("/chat/list", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const result = await c.env.DB.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
      (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT sender FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender,
      (SELECT p.name FROM chat_members cm2 LEFT JOIN profiles p ON p.fingerprint = cm2.member WHERE cm2.chat_id = c.id AND cm2.member != ? LIMIT 1) as other_name,
      (SELECT cm2.member FROM chat_members cm2 WHERE cm2.chat_id = c.id AND cm2.member != ? LIMIT 1) as other_fingerprint
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    WHERE cm.member = ?
    ORDER BY c.created_at DESC
  `).bind(fingerprint, fingerprint, fingerprint).all();
  return c.json({ chats: result.results });
});

// GET /chat/:id/messages — get messages
app.get("/chat/:id/messages", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const chatId = c.req.param("id")!;
  const since = c.req.query("since");

  // Verify membership
  const member = await c.env.DB.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND member = ?")
    .bind(chatId, fingerprint).first();
  if (!member) return c.json({ error: "Not a member of this chat" }, 403);

  let sql = `SELECT m.id, m.sender, m.content, m.created_at, p.name as sender_name
     FROM messages m
     LEFT JOIN profiles p ON p.fingerprint = m.sender
     WHERE m.chat_id = ?`;
  const bindings: string[] = [chatId];
  if (since) {
    sql += " AND m.created_at > ?";
    bindings.push(since);
  }
  sql += " ORDER BY m.created_at ASC LIMIT 100";

  const result = await c.env.DB.prepare(sql).bind(...bindings).all();
  return c.json({ messages: result.results });
});

// POST /chat/:id/messages — send message
app.post("/chat/:id/messages", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const chatId = c.req.param("id")!;
  const { content } = await c.req.json<{ content: string }>();
  if (!content) return c.json({ error: "content required" }, 400);
  if (content.length > 1000) return c.json({ error: "Message too long (max 1000 characters)" }, 400);

  // Verify membership
  const member = await c.env.DB.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND member = ?")
    .bind(chatId, fingerprint).first();
  if (!member) return c.json({ error: "Not a member of this chat" }, 403);

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await c.env.DB.prepare("INSERT INTO messages (id, chat_id, sender, content) VALUES (?, ?, ?, ?)")
    .bind(id, chatId, fingerprint, content).run();

  // Get sender name for the broadcast
  const profile = await c.env.DB.prepare("SELECT name FROM profiles WHERE fingerprint = ?")
    .bind(fingerprint).first<{ name: string }>();
  const message = { id, chat_id: chatId, sender: fingerprint, sender_name: profile?.name, content, created_at };

  // Broadcast to all WebSocket clients in this chat's Durable Object
  const doId = c.env.CHAT_ROOM.idFromName(chatId);
  const room = c.env.CHAT_ROOM.get(doId);
  c.executionCtx.waitUntil(
    room.fetch(`https://do/broadcast`, {
      method: "POST",
      body: JSON.stringify(message),
    })
  );

  return c.json({ message });
});

// GET /chat/:id/ws — WebSocket upgrade for real-time chat
app.get("/chat/:id/ws", async (c) => {
  const chatId = c.req.param("id")!;
  const fp = c.req.query("fp");
  if (!fp) return c.json({ error: "fp query param required" }, 400);

  // Verify membership before connecting
  const member = await c.env.DB.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND member = ?")
    .bind(chatId, fp).first();
  if (!member) return c.json({ error: "Not a member of this chat" }, 403);

  // Forward the raw request to the DO so the WebSocket upgrade headers pass through
  const doId = c.env.CHAT_ROOM.idFromName(chatId);
  const room = c.env.CHAT_ROOM.get(doId);
  const doUrl = new URL("https://do/ws");
  doUrl.searchParams.set("fp", fp);
  return room.fetch(new Request(doUrl.toString(), c.req.raw));
});

// DELETE /chat/:id — delete chat and its messages
app.delete("/chat/:id", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const chatId = c.req.param("id")!;
  const member = await c.env.DB.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND member = ?")
    .bind(chatId, fp).first();
  if (!member) return c.json({ error: "Not a member of this chat" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM messages WHERE chat_id = ?").bind(chatId),
    c.env.DB.prepare("DELETE FROM chat_members WHERE chat_id = ?").bind(chatId),
    c.env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(chatId),
  ]);
  return c.json({ ok: true });
});

// --- Bothread (Social Feed) endpoints ---

// POST /social/posts — create post
app.post("/social/posts", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.length === 0) return c.json({ error: "content required" }, 400);
  if (content.length > 280) return c.json({ error: "content exceeds 280 characters" }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO posts (id, author, content) VALUES (?, ?, ?)")
    .bind(id, fp, content).run();

  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return c.json({ post }, 201);
});

// GET /social/feed — timeline: own + followed users' posts
app.get("/social/feed", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const offset = (page - 1) * limit;

  // Get list of followed fingerprints
  const followResult = await c.env.DB.prepare("SELECT following FROM follows WHERE follower = ?")
    .bind(fp).all();
  const followed = (followResult.results ?? []).map((r: any) => r.following as string);

  // Build IN clause: self + followed
  const allAuthors = [fp, ...followed];
  const placeholders = allAuthors.map(() => "?").join(", ");

  const result = await c.env.DB.prepare(
    `SELECT p.id, p.author, p.content, p.created_at, pr.name as author_name,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
     FROM posts p
     LEFT JOIN profiles pr ON pr.fingerprint = p.author
     WHERE p.author IN (${placeholders})
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...allAuthors, limit + 1, offset).all();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const posts = rows.slice(0, limit);

  return c.json({ posts, page, hasMore });
});

// GET /social/posts/:id — single post + comments
app.get("/social/posts/:id", async (c) => {
  const postId = c.req.param("id");

  const post = await c.env.DB.prepare(
    `SELECT p.id, p.author, p.content, p.created_at, pr.name as author_name
     FROM posts p
     LEFT JOIN profiles pr ON pr.fingerprint = p.author
     WHERE p.id = ?`
  ).bind(postId).first();

  if (!post) return c.json({ error: "Post not found" }, 404);

  const commentsResult = await c.env.DB.prepare(
    `SELECT cm.id, cm.post_id, cm.author, cm.content, cm.created_at, pr.name as author_name
     FROM comments cm
     LEFT JOIN profiles pr ON pr.fingerprint = cm.author
     WHERE cm.post_id = ?
     ORDER BY cm.created_at ASC`
  ).bind(postId).all();

  return c.json({ post, comments: commentsResult.results ?? [] });
});

// PUT /social/posts/:id — edit post (author only, within 5 mins)
app.put("/social/posts/:id", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const postId = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.length === 0) return c.json({ error: "content required" }, 400);
  if (content.length > 280) return c.json({ error: "content exceeds 280 characters" }, 400);

  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first();
  if (!post) return c.json({ error: "Post not found" }, 404);
  if (post.author !== fp) return c.json({ error: "Not the author" }, 403);

  // Check 5-minute edit window
  const withinWindow = await c.env.DB.prepare(
    "SELECT 1 WHERE datetime('now') <= datetime(?, '+5 minutes')"
  ).bind(post.created_at).first();
  if (!withinWindow) return c.json({ error: "Edit window expired (5 minutes)" }, 403);

  await c.env.DB.prepare("UPDATE posts SET content = ? WHERE id = ?").bind(content, postId).run();
  const updated = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first();
  return c.json({ post: updated });
});

// DELETE /social/posts/:id — delete post + cascade comments
app.delete("/social/posts/:id", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const postId = c.req.param("id");

  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(postId).first();
  if (!post) return c.json({ error: "Post not found" }, 404);
  if (post.author !== fp) return c.json({ error: "Not the author" }, 403);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(postId),
    c.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId),
  ]);

  return c.body(null, 204);
});

// POST /social/posts/:id/comments — add comment
app.post("/social/posts/:id/comments", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const postId = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.length === 0) return c.json({ error: "content required" }, 400);
  if (content.length > 280) return c.json({ error: "content exceeds 280 characters" }, 400);

  // Check post exists
  const post = await c.env.DB.prepare("SELECT 1 FROM posts WHERE id = ?").bind(postId).first();
  if (!post) return c.json({ error: "Post not found" }, 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO comments (id, post_id, author, content) VALUES (?, ?, ?, ?)")
    .bind(id, postId, fp, content).run();

  const comment = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first();
  return c.json({ comment }, 201);
});

// PUT /social/comments/:id — edit comment (author only, within 5 mins)
app.put("/social/comments/:id", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const commentId = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.length === 0) return c.json({ error: "content required" }, 400);
  if (content.length > 280) return c.json({ error: "content exceeds 280 characters" }, 400);

  const comment = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(commentId).first();
  if (!comment) return c.json({ error: "Comment not found" }, 404);
  if (comment.author !== fp) return c.json({ error: "Not the author" }, 403);

  const withinWindow = await c.env.DB.prepare(
    "SELECT 1 WHERE datetime('now') <= datetime(?, '+5 minutes')"
  ).bind(comment.created_at).first();
  if (!withinWindow) return c.json({ error: "Edit window expired (5 minutes)" }, 403);

  await c.env.DB.prepare("UPDATE comments SET content = ? WHERE id = ?").bind(content, commentId).run();
  const updated = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(commentId).first();
  return c.json({ comment: updated });
});

// DELETE /social/comments/:id — delete comment (author only)
app.delete("/social/comments/:id", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const commentId = c.req.param("id");

  const comment = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(commentId).first();
  if (!comment) return c.json({ error: "Comment not found" }, 404);
  if (comment.author !== fp) return c.json({ error: "Not the author" }, 403);

  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
  return c.body(null, 204);
});

// POST /social/follow/:fp — follow user
app.post("/social/follow/:fp", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const target = c.req.param("fp");
  if (fp === target) return c.json({ error: "Cannot follow yourself" }, 400);

  await c.env.DB.prepare("INSERT OR IGNORE INTO follows (follower, following) VALUES (?, ?)")
    .bind(fp, target).run();
  return c.json({ ok: true });
});

// DELETE /social/follow/:fp — unfollow user
app.delete("/social/follow/:fp", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const target = c.req.param("fp");

  const result = await c.env.DB.prepare("DELETE FROM follows WHERE follower = ? AND following = ?")
    .bind(fp, target).run();
  if (result.meta.changes === 0) return c.json({ error: "Not following this user" }, 404);
  return c.body(null, 204);
});

// GET /social/following — list who I follow
app.get("/social/following", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const result = await c.env.DB.prepare(
    `SELECT f.following as fingerprint, f.created_at as followed_at, p.name
     FROM follows f
     LEFT JOIN profiles p ON p.fingerprint = f.following
     WHERE f.follower = ?
     ORDER BY f.created_at DESC`
  ).bind(fp).all();
  return c.json({ following: result.results ?? [] });
});

// GET /social/followers — list my followers
app.get("/social/followers", authMiddleware, async (c) => {
  const fp = c.get("fingerprint");
  const result = await c.env.DB.prepare(
    `SELECT f.follower as fingerprint, f.created_at as followed_at, p.name
     FROM follows f
     LEFT JOIN profiles p ON p.fingerprint = f.follower
     WHERE f.following = ?
     ORDER BY f.created_at DESC`
  ).bind(fp).all();
  return c.json({ followers: result.results ?? [] });
});

// GET /social/profile/:fp — user's posts + follower/following counts
app.get("/social/profile/:fp", async (c) => {
  const targetFp = c.req.param("fp");
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const offset = (page - 1) * limit;

  // Get profile info
  const profile = await c.env.DB.prepare(
    "SELECT fingerprint, name, bio FROM profiles WHERE fingerprint = ?"
  ).bind(targetFp).first();

  // Get posts
  const postsResult = await c.env.DB.prepare(
    `SELECT p.id, p.author, p.content, p.created_at, pr.name as author_name,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
     FROM posts p
     LEFT JOIN profiles pr ON pr.fingerprint = p.author
     WHERE p.author = ?
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(targetFp, limit + 1, offset).all();

  const rows = postsResult.results ?? [];
  const hasMore = rows.length > limit;
  const posts = rows.slice(0, limit);

  // Get follower/following counts
  const followerCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM follows WHERE following = ?"
  ).bind(targetFp).first<{ count: number }>();

  const followingCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM follows WHERE follower = ?"
  ).bind(targetFp).first<{ count: number }>();

  return c.json({
    profile: profile || { fingerprint: targetFp, name: "", bio: "" },
    posts,
    page,
    hasMore,
    followerCount: followerCount?.count ?? 0,
    followingCount: followingCount?.count ?? 0,
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
