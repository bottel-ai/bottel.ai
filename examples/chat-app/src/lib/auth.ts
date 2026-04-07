import crypto from "node:crypto";
import Conf from "conf";

interface AuthData {
  privateKey: string; // base64 encoded
  publicKey: string; // ssh-ed25519 format
  fingerprint: string; // SHA256:...
}

const config = new Conf<{ auth: AuthData | null }>({
  projectName: "bottel-chat",
  defaults: { auth: null },
});

/**
 * Convert a DER-encoded Ed25519 public key to SSH wire format (ssh-ed25519).
 */
function toSshPublicKey(publicKeyDer: Buffer): string {
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

/** Get a short fingerprint for display. */
export function getShortFingerprint(): string {
  const auth = getAuth();
  if (!auth) return "not logged in";
  const hash = auth.fingerprint.replace("SHA256:", "");
  return hash.substring(0, 12);
}
