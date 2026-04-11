import { Context, Next } from "hono";

interface Env { DB: D1Database; }
type AppEnv = { Bindings: Env; Variables: { fingerprint: string } };

// Fingerprint must look like "SHA256:..." with a base64 hash, or a hex hash.
// Max 128 chars to prevent abuse via oversized headers.
const FP_MAX_LENGTH = 128;

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const fingerprint = c.req.header("X-Fingerprint");
  if (!fingerprint) {
    return c.json({ error: "Missing X-Fingerprint header" }, 401);
  }
  if (fingerprint.length > FP_MAX_LENGTH) {
    return c.json({ error: "X-Fingerprint too long" }, 400);
  }
  // Reject control characters and whitespace (aside from the value itself being trimmed by HTTP).
  if (/[\x00-\x1f]/.test(fingerprint)) {
    return c.json({ error: "Invalid X-Fingerprint" }, 400);
  }
  c.set("fingerprint", fingerprint);
  await next();
}
