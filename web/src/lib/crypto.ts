export function isEncrypted(s: string): boolean {
  return typeof s === "string" && s.startsWith("enc:");
}

export async function decryptContent(encrypted: string, keyBase64: string): Promise<string> {
  const raw = Uint8Array.from(atob(encrypted.slice(4)), c => c.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12, raw.length - 16);
  const tag = raw.slice(raw.length - 16);
  // Combine ciphertext + tag for Web Crypto
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
  return new TextDecoder().decode(plainBuf);
}
