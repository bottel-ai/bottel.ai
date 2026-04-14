import { Context, Next } from "hono";

interface Env { DB: D1Database; }
type AppEnv = { Bindings: Env; Variables: { fingerprint: string; signedAuth?: boolean } };

/** Max clock skew for signed requests (5 minutes). */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/** Max clock skew for WebSocket token auth (30 seconds). */
export const WS_TOKEN_MAX_AGE_MS = 30 * 1000;

/** Per-isolate dedup: skip fire-and-forget public_key write if already done this isolate lifetime. */
const publicKeyStored = new Set<string>();

/**
 * Build an SSH-format fingerprint from a raw Ed25519 public key.
 *
 * Wire format: uint32(len("ssh-ed25519")) + "ssh-ed25519" + uint32(32) + key
 * Then SHA-256 hash, base64-encode, strip trailing '=', prepend "SHA256:".
 */
export async function rawKeyToFingerprint(rawKey: Uint8Array): Promise<string> {
  const keyType = new TextEncoder().encode("ssh-ed25519");
  const typeLen = new Uint8Array(4);
  new DataView(typeLen.buffer).setUint32(0, keyType.length);
  const keyLen = new Uint8Array(4);
  new DataView(keyLen.buffer).setUint32(0, rawKey.length);

  const blob = new Uint8Array(4 + keyType.length + 4 + rawKey.length);
  blob.set(typeLen, 0);
  blob.set(keyType, 4);
  blob.set(keyLen, 4 + keyType.length);
  blob.set(rawKey, 4 + keyType.length + 4);

  const hash = await crypto.subtle.digest("SHA-256", blob);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return "SHA256:" + b64.replace(/=+$/, "");
}

/**
 * Verify an Ed25519 signature over a payload.
 *
 * @param publicKeyB64 Base64-encoded raw 32-byte Ed25519 public key
 * @param signatureB64 Base64-encoded signature
 * @param payload UTF-8 string payload that was signed
 * @returns The derived fingerprint if valid, or null if invalid
 */
export async function verifySignature(
  publicKeyB64: string,
  signatureB64: string,
  payload: string,
): Promise<string | null> {
  try {
    const rawKey = Uint8Array.from(atob(publicKeyB64), (ch) => ch.charCodeAt(0));
    if (rawKey.length !== 32) return null;

    const signature = Uint8Array.from(atob(signatureB64), (ch) => ch.charCodeAt(0));
    const payloadBytes = new TextEncoder().encode(payload);

    const key = await crypto.subtle.importKey(
      "raw",
      rawKey,
      "Ed25519",
      false,
      ["verify"],
    );

    const valid = await crypto.subtle.verify("Ed25519", key, signature, payloadBytes);
    if (!valid) return null;

    return rawKeyToFingerprint(rawKey);
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  // --- Signed auth (preferred) ---
  const sig = c.req.header("X-Signature");
  const ts = c.req.header("X-Timestamp");
  const pubKey = c.req.header("X-Public-Key");

  if (sig && ts && pubKey) {
    // Validate timestamp freshness
    const tsMs = parseInt(ts, 10);
    if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > SIGNATURE_MAX_AGE_MS) {
      return c.json({ error: "Request timestamp expired or invalid" }, 401);
    }

    // Reconstruct signing payload: timestamp + "\n" + method + "\n" + path (no query)
    const url = new URL(c.req.url);
    const payload = ts + "\n" + c.req.method + "\n" + url.pathname;

    const fingerprint = await verifySignature(pubKey, sig, payload);
    if (!fingerprint) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    c.set("fingerprint", fingerprint);
    c.set("signedAuth" as any, true);

    // Store public key on profile if not already stored (fire-and-forget, deduped per isolate)
    if (!publicKeyStored.has(fingerprint)) {
      publicKeyStored.add(fingerprint);
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          "UPDATE profiles SET public_key = ? WHERE fingerprint = ? AND public_key IS NULL"
        ).bind(pubKey, fingerprint).run().catch(() => {}),
      );
    }

    await next();
    return;
  }

  // No valid signed auth — reject. Legacy X-Fingerprint header is no longer
  // accepted (it provided zero cryptographic verification).
  return c.json({ error: "Missing authentication. Provide X-Signature, X-Timestamp, X-Public-Key headers." }, 401);
}

/**
 * Parse and verify a signed WebSocket token.
 *
 * Token format (v2, preferred):
 *   base64(timestamp + "|" + resource + "|" + signature + "|" + publicKeyRawBase64)
 *   where `resource` is the path being accessed, e.g. "/channels/foo/ws".
 *   The signed payload is `timestamp + "\n" + resource`.
 *
 * Token format (v1, legacy, supported for backward compat):
 *   base64(timestamp + ":" + signature + ":" + publicKeyRawBase64)
 *   The signed payload is just the timestamp.
 *
 * Uses a tight 30-second window.
 *
 * @param token - the base64-encoded token
 * @param resource - optional path to bind the token to (for v2 verification)
 * @returns fingerprint string if valid, null otherwise
 */
export async function verifyWsToken(token: string, resource?: string): Promise<string | null> {
  try {
    const decoded = atob(token);

    // v2 format uses "|" separator (won't appear in base64 or reasonable paths)
    if (decoded.includes("|")) {
      const parts = decoded.split("|");
      if (parts.length !== 4) return null;
      const [ts, tokenResource, sig, pubKey] = parts;
      const tsMs = parseInt(ts, 10);
      if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > WS_TOKEN_MAX_AGE_MS) return null;
      // If caller specified a resource, it must match the token's resource
      if (resource && tokenResource !== resource) return null;
      return await verifySignature(pubKey, sig, ts + "\n" + tokenResource);
    }

    // v1 legacy format
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [ts, sig, pubKey] = parts;
    const tsMs = parseInt(ts, 10);
    if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > WS_TOKEN_MAX_AGE_MS) return null;
    return await verifySignature(pubKey, sig, ts);
  } catch {
    return null;
  }
}
