import { Context, Next } from "hono";

interface Env { DB: D1Database; }
type AppEnv = { Bindings: Env; Variables: { fingerprint: string } };

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const fingerprint = c.req.header("X-Fingerprint");
  if (!fingerprint) {
    return c.json({ error: "Missing X-Fingerprint header" }, 401);
  }
  c.set("fingerprint", fingerprint);
  await next();
}
