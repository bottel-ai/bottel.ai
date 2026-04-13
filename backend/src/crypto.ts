// Crypto module for private channel encryption.
// Uses Web Crypto API (AES-256-GCM), available in Cloudflare Workers.

// --- Helpers: base64 ↔ Uint8Array (standard base64, not base64url) ---

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Exported API ---

/**
 * Generate a new AES-256-GCM key, returned as a base64 string.
 */
export async function generateChannelKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", key as CryptoKey) as ArrayBuffer,
  );
  return uint8ToBase64(raw);
}

/**
 * Encrypt a JSON payload string with the given base64 key.
 * Returns "enc:" + base64(iv + ciphertext + tag).
 * IV is 12 random bytes, generated fresh per encryption.
 */
export async function encryptPayload(
  payloadJson: string,
  keyBase64: string,
): Promise<string> {
  const keyBytes = base64ToUint8(keyBase64);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(payloadJson);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded),
  );

  // Concatenate iv + ciphertext (GCM tag is appended automatically by Web Crypto)
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);

  return "enc:" + uint8ToBase64(combined);
}

