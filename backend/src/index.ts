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
