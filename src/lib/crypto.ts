import crypto from "node:crypto";

/**
 * Check if a payload is encrypted.
 * Returns true if payload is a string starting with "enc:".
 */
export function isEncrypted(payload: any): payload is string {
  return typeof payload === "string" && payload.startsWith("enc:");
}

/**
 * Decrypt an "enc:..." payload using a base64 AES-256-GCM key.
 * Returns the decrypted JSON string.
 *
 * Wire format after stripping the "enc:" prefix and base64-decoding:
 *   [12 bytes IV] [ciphertext...] [16 bytes auth tag]
 */
export function decryptPayload(encrypted: string, keyBase64: string): string {
  const raw = Buffer.from(encrypted.slice(4), "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);

  const key = Buffer.from(keyBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
