import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth.js";

interface Env { DB: D1Database; }

const app = new Hono<{ Bindings: Env; Variables: { fingerprint: string } }>();

app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ name: "bottel.ai", version: "0.1.0", status: "ok" }));

// GET /apps — list/search/filter apps
app.get("/apps", async (c) => {
  const q = c.req.query("q");
  const author = c.req.query("author");

  let sql = "SELECT * FROM apps";
  const conditions: string[] = [];
  const bindings: string[] = [];

  if (q) {
    conditions.push("(name LIKE ? OR description LIKE ?)");
    bindings.push(`%${q}%`, `%${q}%`);
  }

  if (author) {
    conditions.push("public_key = ?");
    bindings.push(author);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY installs DESC";

  const stmt = c.env.DB.prepare(sql);
  const result = bindings.length > 0
    ? await stmt.bind(...bindings).all()
    : await stmt.all();

  const apps = (result.results ?? []).map((app) => ({
    ...app,
    capabilities: JSON.parse((app.capabilities as string) || "[]"),
  }));

  return c.json({ apps });
});

// GET /apps/:slug — single app
app.get("/apps/:slug", async (c) => {
  const slug = c.req.param("slug");

  const app = await c.env.DB.prepare("SELECT * FROM apps WHERE slug = ?")
    .bind(slug).first();

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
  }>();

  if (!body.name || !body.slug || !body.description || !body.category || !body.version) {
    return c.json({ error: "name, slug, description, category, and version are required" }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO apps (id, name, slug, description, long_description, category, author, version, capabilities, public_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    fingerprint
  ).run();

  const app = await c.env.DB.prepare("SELECT * FROM apps WHERE id = ?")
    .bind(id).first();

  return c.json({
    app: {
      ...app,
      capabilities: JSON.parse((app?.capabilities as string) || "[]"),
    },
  });
});

// GET /user/installs — get user's installed apps (requires auth)
app.get("/user/installs", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");

  const result = await c.env.DB.prepare(
    `SELECT apps.* FROM apps
     INNER JOIN installs ON installs.app_id = apps.id
     WHERE installs.user_fingerprint = ?`
  ).bind(fingerprint).all();

  const installs = (result.results ?? []).map((app) => ({
    ...app,
    capabilities: JSON.parse((app.capabilities as string) || "[]"),
  }));

  return c.json({ installs });
});

// POST /user/installs/:appId — toggle install (requires auth)
app.post("/user/installs/:appId", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const appId = c.req.param("appId");

  const existing = await c.env.DB.prepare(
    "SELECT 1 FROM installs WHERE user_fingerprint = ? AND app_id = ?"
  ).bind(fingerprint, appId).first();

  if (existing) {
    // Uninstall
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM installs WHERE user_fingerprint = ? AND app_id = ?")
        .bind(fingerprint, appId),
      c.env.DB.prepare("UPDATE apps SET installs = installs - 1 WHERE id = ?")
        .bind(appId),
    ]);
    return c.json({ installed: false });
  } else {
    // Install
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO installs (user_fingerprint, app_id) VALUES (?, ?)")
        .bind(fingerprint, appId),
      c.env.DB.prepare("UPDATE apps SET installs = installs + 1 WHERE id = ?")
        .bind(appId),
    ]);
    return c.json({ installed: true });
  }
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

  const updated = await c.env.DB.prepare("SELECT * FROM apps WHERE slug = ?").bind(slug).first();
  return c.json({ app: { ...updated, capabilities: JSON.parse((updated as any).capabilities || "[]"), verified: !!(updated as any).verified } });
});

// DELETE /apps/:slug — delete app (auth required, must own it)
app.delete("/apps/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const fingerprint = c.get("fingerprint");

  const result = await c.env.DB.prepare("DELETE FROM apps WHERE slug = ? AND public_key = ?")
    .bind(slug, fingerprint).run();

  if (result.meta.changes === 0) return c.json({ error: "App not found or not owned by you" }, 404);
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

// GET /chat/contacts — list contacts
app.get("/chat/contacts", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const result = await c.env.DB.prepare("SELECT contact, alias, added_at FROM contacts WHERE owner = ? ORDER BY alias, contact")
    .bind(fingerprint).all();
  return c.json({ contacts: result.results });
});

// DELETE /chat/contacts/:contact — remove contact
app.delete("/chat/contacts/:contact", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const contact = c.req.param("contact");
  await c.env.DB.prepare("DELETE FROM contacts WHERE owner = ? AND contact = ?")
    .bind(fingerprint, contact).run();
  return c.json({ ok: true });
});

// POST /chat/new — create chat
app.post("/chat/new", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const { members, name, type } = await c.req.json<{ members: string[]; name?: string; type?: string }>();
  if (!members || members.length === 0) return c.json({ error: "members required" }, 400);

  const chatId = crypto.randomUUID();
  const chatType = type || (members.length === 1 ? "direct" : "group");

  await c.env.DB.prepare("INSERT INTO chats (id, type, name, created_by) VALUES (?, ?, ?, ?)")
    .bind(chatId, chatType, name || "", fingerprint).run();

  // Add creator + all members
  const allMembers = [fingerprint, ...members.filter(m => m !== fingerprint)];
  for (const member of allMembers) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO chat_members (chat_id, member) VALUES (?, ?)")
      .bind(chatId, member).run();
  }

  return c.json({ chat: { id: chatId, type: chatType, name: name || "", members: allMembers } });
});

// GET /chat/list — list user's chats
app.get("/chat/list", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const result = await c.env.DB.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
      (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT sender FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender,
      (SELECT COUNT(*) FROM chat_members WHERE chat_id = c.id) as member_count
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    WHERE cm.member = ?
    ORDER BY c.created_at DESC
  `).bind(fingerprint).all();
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

  let sql = "SELECT id, sender, content, created_at FROM messages WHERE chat_id = ?";
  const bindings: string[] = [chatId];
  if (since) {
    sql += " AND created_at > ?";
    bindings.push(since);
  }
  sql += " ORDER BY created_at ASC LIMIT 100";

  const result = await c.env.DB.prepare(sql).bind(...bindings).all();
  return c.json({ messages: result.results });
});

// POST /chat/:id/messages — send message
app.post("/chat/:id/messages", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const chatId = c.req.param("id")!;
  const { content } = await c.req.json<{ content: string }>();
  if (!content) return c.json({ error: "content required" }, 400);

  // Verify membership
  const member = await c.env.DB.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND member = ?")
    .bind(chatId, fingerprint).first();
  if (!member) return c.json({ error: "Not a member of this chat" }, 403);

  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO messages (id, chat_id, sender, content) VALUES (?, ?, ?, ?)")
    .bind(id, chatId, fingerprint, content).run();

  return c.json({ message: { id, chat_id: chatId, sender: fingerprint, content, created_at: new Date().toISOString() } });
});

// POST /chat/:id/members — add member to group
app.post("/chat/:id/members", authMiddleware, async (c) => {
  const fingerprint = c.get("fingerprint");
  const chatId = c.req.param("id")!;
  const { member } = await c.req.json<{ member: string }>();
  if (!member) return c.json({ error: "member fingerprint required" }, 400);

  // Verify sender is member
  const existing = await c.env.DB.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND member = ?")
    .bind(chatId, fingerprint).first();
  if (!existing) return c.json({ error: "Not a member of this chat" }, 403);

  await c.env.DB.prepare("INSERT OR IGNORE INTO chat_members (chat_id, member) VALUES (?, ?)")
    .bind(chatId, member).run();
  return c.json({ ok: true });
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
