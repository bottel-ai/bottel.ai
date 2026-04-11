import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Conf from "conf";
import type { BotIdentity } from "./types.js";

function getConfig(projectName: string) {
  return new Conf<{ identity: BotIdentity | null }>({
    projectName,
    defaults: { identity: null },
  });
}

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

/**
 * Generate a new Ed25519 key pair and return a BotIdentity.
 */
function generateIdentity(): BotIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const sshPubKey = toSshPublicKey(publicKey);
  const fingerprint = computeFingerprint(sshPubKey);

  return {
    fingerprint,
    publicKey: sshPubKey,
    privateKey: (privateKey as Buffer).toString("base64"),
  };
}

/**
 * Get an existing identity from the config, or create and persist a new one.
 */
/**
 * Lock down the config file permissions to owner-only (0600).
 * The file contains the Ed25519 private key.
 */
function lockConfigPermissions(config: Conf<any>): void {
  try {
    fs.chmodSync(config.path, 0o600);
  } catch {
    // Windows or permission error — best-effort.
  }
}

export function getOrCreateIdentity(projectName?: string): BotIdentity {
  const config = getConfig(projectName ?? "bottel-sdk");
  const existing = config.get("identity");
  if (existing) return existing;

  const identity = generateIdentity();
  config.set("identity", identity);
  lockConfigPermissions(config);
  return identity;
}

/**
 * Get an existing identity, or null if none exists yet.
 */
export function getIdentity(projectName?: string): BotIdentity | null {
  const config = getConfig(projectName ?? "bottel-sdk");
  return config.get("identity");
}
