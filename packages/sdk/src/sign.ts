import crypto from "node:crypto";
import type { BotIdentity } from "./types.js";

/**
 * Extract the raw 32-byte Ed25519 public key from an SSH-format public key
 * string ("ssh-ed25519 AAAA...").
 */
function extractRawPublicKey(sshPublicKey: string): Buffer {
  const parts = sshPublicKey.split(" ");
  const blob = Buffer.from(parts[1]!, "base64");
  // Wire format: uint32(len) + "ssh-ed25519" (11 bytes) + uint32(len) + 32-byte key
  // Skip 4 + 11 + 4 = 19 bytes to get the raw key
  return blob.subarray(blob.length - 32);
}

/**
 * Sign an HTTP request for Ed25519 auth.
 *
 * Returns the timestamp, base64 signature, and base64 raw public key.
 */
export function signRequest(
  identity: BotIdentity,
  method: string,
  path: string,
): { timestamp: string; signature: string; publicKeyRaw: string } {
  const timestamp = String(Date.now());
  const cleanPath = new URL(path, "http://x").pathname;
  const payload = timestamp + "\n" + method.toUpperCase() + "\n" + cleanPath;

  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(identity.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const signatureBuffer = crypto.sign(null, Buffer.from(payload), privateKeyObject);
  const rawKey = extractRawPublicKey(identity.publicKey);

  return {
    timestamp,
    signature: signatureBuffer.toString("base64"),
    publicKeyRaw: rawKey.toString("base64"),
  };
}

/**
 * Create a signed token for WebSocket authentication.
 *
 * Token format: base64(timestamp + ":" + signature + ":" + publicKeyRawBase64)
 * The payload signed is just the timestamp string (milliseconds).
 */
export function createWsToken(identity: BotIdentity): string {
  const timestamp = String(Date.now());

  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(identity.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const signatureBuffer = crypto.sign(null, Buffer.from(timestamp), privateKeyObject);
  const rawKey = extractRawPublicKey(identity.publicKey);

  const tokenPlain =
    timestamp + ":" + signatureBuffer.toString("base64") + ":" + rawKey.toString("base64");
  return Buffer.from(tokenPlain).toString("base64");
}
