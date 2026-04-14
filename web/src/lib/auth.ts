// Web-based identity management using Web Crypto API (browser-native)

export interface WebIdentity {
  fingerprint: string;
  privateKeyBase64: string; // PKCS8 DER base64
  publicKeyRawBase64: string; // raw 32-byte Ed25519 key, base64
}

const STORAGE_KEY = "bottel_identity";
const NAME_CACHE_KEY = "bottel_profile_name";

export function getIdentity(): WebIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveIdentity(identity: WebIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(NAME_CACHE_KEY);
}

/** Cached profile name (human_xxx / bot_xxx / display name) used by Nav for instant render. */
export function getCachedProfileName(): string | null {
  return localStorage.getItem(NAME_CACHE_KEY);
}

export function setCachedProfileName(name: string | null): void {
  if (name) localStorage.setItem(NAME_CACHE_KEY, name);
  else localStorage.removeItem(NAME_CACHE_KEY);
}

export function isLoggedIn(): boolean {
  return getIdentity() !== null;
}

/**
 * Generate a new Ed25519 keypair using Web Crypto API.
 * Derives the SSH fingerprint, saves to localStorage.
 */
export async function generateKeyPair(): Promise<WebIdentity> {
  // Generate Ed25519 keypair using Web Crypto
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);

  // Export private key as PKCS8 DER → base64
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));

  // Export public key as raw 32 bytes → base64
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyRaw = new Uint8Array(rawPub);
  const publicKeyRawBase64 = btoa(String.fromCharCode(...publicKeyRaw));

  // Build SSH wire format blob: uint32(len) + "ssh-ed25519" + uint32(len) + raw_key
  const keyType = new TextEncoder().encode("ssh-ed25519");
  const typeLen = new Uint8Array(4);
  new DataView(typeLen.buffer).setUint32(0, keyType.length);
  const keyLen = new Uint8Array(4);
  new DataView(keyLen.buffer).setUint32(0, publicKeyRaw.length);
  const blob = new Uint8Array([...typeLen, ...keyType, ...keyLen, ...publicKeyRaw]);

  const hashBuf = await crypto.subtle.digest("SHA-256", blob);
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuf))).replace(/=+$/, "");
  const fingerprint = `SHA256:${hashBase64}`;

  const identity: WebIdentity = { fingerprint, privateKeyBase64, publicKeyRawBase64 };
  saveIdentity(identity);
  return identity;
}

/**
 * Import a base64-encoded PKCS8 DER Ed25519 private key.
 * Derives the public key and SSH fingerprint, saves to localStorage.
 */
export async function importPrivateKey(
  privateKeyBase64: string,
): Promise<WebIdentity> {
  const pkcs8 = Uint8Array.from(atob(privateKeyBase64), (c) =>
    c.charCodeAt(0),
  );

  // Import as Ed25519 private key
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    "Ed25519",
    true,
    ["sign"],
  );

  // Export as JWK to extract the public key (x parameter)
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicKeyRaw = Uint8Array.from(
    atob(jwk.x!.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );

  // Build SSH wire format blob: uint32(len) + "ssh-ed25519" + uint32(len) + raw_key
  const keyType = new TextEncoder().encode("ssh-ed25519");
  const typeLen = new Uint8Array(4);
  new DataView(typeLen.buffer).setUint32(0, keyType.length);
  const keyLen = new Uint8Array(4);
  new DataView(keyLen.buffer).setUint32(0, publicKeyRaw.length);

  const blob = new Uint8Array(
    4 + keyType.length + 4 + publicKeyRaw.length,
  );
  blob.set(typeLen, 0);
  blob.set(keyType, 4);
  blob.set(keyLen, 4 + keyType.length);
  blob.set(publicKeyRaw, 4 + keyType.length + 4);

  // SHA-256 hash, base64, strip padding => fingerprint
  const hashBuf = await crypto.subtle.digest("SHA-256", blob);
  const hashBase64 = btoa(
    String.fromCharCode(...new Uint8Array(hashBuf)),
  ).replace(/=+$/, "");
  const fingerprint = `SHA256:${hashBase64}`;

  const publicKeyRawBase64 = btoa(
    String.fromCharCode(...publicKeyRaw),
  );

  const identity: WebIdentity = {
    fingerprint,
    privateKeyBase64,
    publicKeyRawBase64,
  };
  saveIdentity(identity);
  return identity;
}

/**
 * Sign an HTTP request for Ed25519 auth.
 * Returns headers matching the backend's expected format, or null if not logged in.
 */
export async function signRequest(
  method: string,
  path: string,
): Promise<{
  timestamp: string;
  signature: string;
  publicKeyRaw: string;
} | null> {
  const identity = getIdentity();
  if (!identity) return null;

  const timestamp = String(Date.now());
  const cleanPath = new URL(path, "http://x").pathname;
  const payload =
    timestamp + "\n" + method.toUpperCase() + "\n" + cleanPath;

  const pkcs8 = Uint8Array.from(atob(identity.privateKeyBase64), (c) =>
    c.charCodeAt(0),
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    "Ed25519",
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(payload),
  );
  const signature = btoa(
    String.fromCharCode(...new Uint8Array(sigBuf)),
  );

  return {
    timestamp,
    signature,
    publicKeyRaw: identity.publicKeyRawBase64,
  };
}

/**
 * Create a signed WebSocket token bound to a specific WS resource path.
 * Token format (v2): base64(timestamp + "|" + resource + "|" + signature + "|" + publicKeyRaw)
 * Signed payload: `timestamp + "\n" + resource`
 */
export async function createWsToken(resource: string): Promise<string | null> {
  const identity = getIdentity();
  if (!identity) return null;

  const timestamp = String(Date.now());
  const payload = timestamp + "\n" + resource;

  const pkcs8 = Uint8Array.from(atob(identity.privateKeyBase64), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    "Ed25519",
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(payload));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const tokenPlain = timestamp + "|" + resource + "|" + signature + "|" + identity.publicKeyRawBase64;
  return btoa(tokenPlain);
}
