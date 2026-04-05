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

/** Get a short fingerprint for display (first 16 chars of the hash). */
export function getShortFingerprint(): string {
  const auth = getAuth();
  if (!auth) return "not logged in";
  const hash = auth.fingerprint.replace("SHA256:", "");
  return hash.substring(0, 12);
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
