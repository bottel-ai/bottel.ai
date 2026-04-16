import crypto from "node:crypto";
import { generateIdentity } from "./identity.js";
import type { BotIdentity } from "./types.js";

/**
 * Backup blob format (v1):
 *   base64(JSON.stringify({
 *     v: 1,
 *     ed25519: { priv: <base64>, pub: <ssh-ed25519 string> },
 *     pq: { algo: "ml-dsa-65", priv: <base64>, pub: <base64> },
 *   }))
 *
 * Opaque to callers — should be handed to users to save for restoration.
 */
interface BackupBlobV1 {
  v: 1;
  ed25519: { priv: string; pub: string };
  pq: { algo: "ml-dsa-65"; priv: string; pub: string };
}

/**
 * Generate a new hybrid (Ed25519 + ML-DSA-65) identity and return both the
 * usable `BotIdentity` and an opaque `backupBlob` (base64 JSON) that callers
 * can hand to users for safekeeping.
 *
 * Replaces the v0.2 `generateKeyPair()` shape `{identity, privateKeyBase64}`.
 */
export function generateKeyPair(): { identity: BotIdentity; backupBlob: string } {
  const identity = generateIdentity();
  const blob: BackupBlobV1 = {
    v: 1,
    ed25519: {
      priv: identity.privateKey,
      pub: identity.publicKey,
    },
    pq: {
      algo: "ml-dsa-65",
      priv: identity.pqPrivateKey,
      pub: identity.pqPublicKey,
    },
  };
  const backupBlob = Buffer.from(JSON.stringify(blob), "utf8").toString("base64");
  return { identity, backupBlob };
}

/**
 * Restore a `BotIdentity` from a backup blob produced by `generateKeyPair`.
 *
 * Throws if the blob is malformed or uses an unsupported version/algorithm.
 */
export function importKeyPair(backupBlob: string): BotIdentity {
  let parsed: BackupBlobV1;
  try {
    const json = Buffer.from(backupBlob, "base64").toString("utf8");
    parsed = JSON.parse(json) as BackupBlobV1;
  } catch (err) {
    throw new Error(`importKeyPair: malformed backup blob (${(err as Error).message})`);
  }
  if (!parsed || parsed.v !== 1) {
    throw new Error(`importKeyPair: unsupported backup version ${parsed?.v}`);
  }
  if (!parsed.ed25519?.priv || !parsed.ed25519?.pub) {
    throw new Error("importKeyPair: missing ed25519 keys");
  }
  if (!parsed.pq || parsed.pq.algo !== "ml-dsa-65" || !parsed.pq.priv || !parsed.pq.pub) {
    throw new Error("importKeyPair: missing or unsupported PQ keys (expected ml-dsa-65)");
  }

  // Recompute fingerprint from the SSH public key (matches identity.ts logic).
  const sshPubKey = parsed.ed25519.pub;
  const parts = sshPubKey.split(" ");
  if (parts.length < 2) throw new Error("importKeyPair: malformed ed25519 public key");
  const keyData = Buffer.from(parts[1]!, "base64");
  const hash = crypto.createHash("sha256").update(keyData).digest("base64");
  const fingerprint = `SHA256:${hash.replace(/=+$/, "")}`;

  return {
    fingerprint,
    publicKey: sshPubKey,
    privateKey: parsed.ed25519.priv,
    pqPrivateKey: parsed.pq.priv,
    pqPublicKey: parsed.pq.pub,
  };
}
