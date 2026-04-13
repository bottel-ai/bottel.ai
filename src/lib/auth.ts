import crypto from "node:crypto";
import Conf from "conf";

interface AuthData {
  privateKey: string; // base64 encoded
  publicKey: string; // ssh-ed25519 format
  fingerprint: string; // SHA256:...
}

const config = new Conf<{ auth: AuthData | null }>({
  projectName: "bottel",
  defaults: { auth: null },
});

/**
 * Convert a DER-encoded Ed25519 public key to SSH wire format (ssh-ed25519).
 */
function toSshPublicKey(publicKeyDer: Buffer): string {
  // Ed25519 DER public key has a fixed 12-byte prefix; raw key is last 32 bytes
  const rawKey = publicKeyDer.subarray(publicKeyDer.length - 32);

  const keyType = Buffer.from("ssh-ed25519");
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(keyType.length);

  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(rawKey.length);

  const blob = Buffer.concat([typeLen, keyType, keyLen, rawKey]);
  return `ssh-ed25519 ${blob.toString("base64")}`;
}

/**
 * Compute the SHA256 fingerprint of an SSH public key string.
 */
function computeFingerprint(sshPublicKey: string): string {
  const parts = sshPublicKey.split(" ");
  const keyData = Buffer.from(parts[1]!, "base64");
  const hash = crypto.createHash("sha256").update(keyData).digest("base64");
  // Remove trailing '=' padding to match OpenSSH style
  return `SHA256:${hash.replace(/=+$/, "")}`;
}

/** Generate a new Ed25519 key pair. */
export function generateKeyPair(): AuthData {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const sshPubKey = toSshPublicKey(publicKey);
  const fingerprint = computeFingerprint(sshPubKey);

  return {
    privateKey: privateKey.toString("base64"),
    publicKey: sshPubKey,
    fingerprint,
  };
}

/** Get current auth data, or null if not logged in. */
export function getAuth(): AuthData | null {
  return config.get("auth");
}

/** Check if the user is logged in. */
export function isLoggedIn(): boolean {
  return config.get("auth") !== null;
}

/** Save auth data to persistent config. */
export function saveAuth(auth: AuthData): void {
  config.set("auth", auth);
}

/** Remove auth data (logout). */
export function clearAuth(): void {
  config.set("auth", null);
}

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
 * Returns the timestamp, base64 signature, and base64 raw public key,
 * or null if the user is not logged in.
 */
export function signRequest(
  method: string,
  path: string
): { timestamp: string; signature: string; publicKeyRaw: string } | null {
  const auth = getAuth();
  if (!auth) return null;

  const timestamp = String(Date.now());
  const cleanPath = new URL(path, "http://x").pathname;
  const payload = timestamp + "\n" + method.toUpperCase() + "\n" + cleanPath;

  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(auth.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const signatureBuffer = crypto.sign(null, Buffer.from(payload), privateKeyObject);
  const rawKey = extractRawPublicKey(auth.publicKey);

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
export function createWsToken(): string | null {
  const auth = getAuth();
  if (!auth) return null;

  const timestamp = String(Date.now());

  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(auth.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const signatureBuffer = crypto.sign(null, Buffer.from(timestamp), privateKeyObject);
  const rawKey = extractRawPublicKey(auth.publicKey);

  const tokenPlain =
    timestamp + ":" + signatureBuffer.toString("base64") + ":" + rawKey.toString("base64");
  return Buffer.from(tokenPlain).toString("base64");
}


/** Import a private key from a base64-encoded PKCS8 DER string. */
export function importPrivateKey(privateKeyBase64: string): AuthData {
  const privateKeyDer = Buffer.from(privateKeyBase64, "base64");

  // Reconstruct the key object to derive the public key
  const keyObject = crypto.createPrivateKey({
    key: privateKeyDer,
    format: "der",
    type: "pkcs8",
  });

  const publicKeyDer = crypto
    .createPublicKey(keyObject)
    .export({ type: "spki", format: "der" });

  const sshPubKey = toSshPublicKey(publicKeyDer);
  const fingerprint = computeFingerprint(sshPubKey);

  return {
    privateKey: privateKeyBase64,
    publicKey: sshPubKey,
    fingerprint,
  };
}
