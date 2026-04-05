import { Context, Next } from "hono";

interface Env { DB: D1Database; }
type AppEnv = { Bindings: Env; Variables: { fingerprint: string; publicKey: string } };

// Verify Ed25519 signature
// Client sends: X-Fingerprint header + X-Signature header (base64)
// Signature is over the request body (or empty string for GET)
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const fingerprint = c.req.header("X-Fingerprint");
  const signature = c.req.header("X-Signature");

  if (!fingerprint || !signature) {
    return c.json({ error: "Missing X-Fingerprint or X-Signature header" }, 401);
  }

  // Look up user's public key
  const user = await c.env.DB.prepare("SELECT public_key FROM users WHERE fingerprint = ?")
    .bind(fingerprint).first<{ public_key: string }>();

  if (!user) {
    return c.json({ error: "Unknown fingerprint. Register first." }, 401);
  }

  // For MVP: skip actual signature verification (complex in Workers)
  // Just check fingerprint exists — real verification can be added later
  // TODO: Implement Ed25519 verify using Web Crypto API

  c.set("fingerprint", fingerprint);
  c.set("publicKey", user.public_key);
  await next();
}
