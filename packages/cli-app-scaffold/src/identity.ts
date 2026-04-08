/**
 * identity — shared bot identity for all @bottel/* apps.
 *
 * One Ed25519 keypair stored at ~/.config/bottel-nodejs/config.json
 * (the standard `conf` package location). Every app that imports from
 * `@bottel/cli-app-scaffold/identity` reads and writes the same file,
 * so your bot has ONE persistent identity across all bottel apps.
 *
 * If you need an isolated per-app keystore (uncommon), use `createIdentity(name)`
 * with a custom project name.
 */
import crypto from "node:crypto";
import Conf from "conf";

export interface BotIdentity {
  /** Base64-encoded PKCS8 DER private key. Keep secret. */
  privateKey: string;
  /** SSH-format public key (`ssh-ed25519 <base64>`). Safe to share. */
  publicKey: string;
  /** SHA256 fingerprint of the public key (e.g. `SHA256:abc...`). */
  fingerprint: string;
  /** Optional display name set by the user. */
  name?: string;
}

interface IdentityStore {
  auth: BotIdentity | null;
}

/** The default shared store name — same as bottel.ai's main app. */
const DEFAULT_PROJECT_NAME = "bottel";

function toSshPublicKey(publicKeyDer: Buffer): string {
  // Ed25519 SPKI is fixed-size; raw key is the last 32 bytes
  const rawKey = publicKeyDer.subarray(publicKeyDer.length - 32);
  const keyType = Buffer.from("ssh-ed25519");
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(keyType.length);
  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(rawKey.length);
  const blob = Buffer.concat([typeLen, keyType, keyLen, rawKey]);
  return `ssh-ed25519 ${blob.toString("base64")}`;
}

function computeFingerprint(sshPublicKey: string): string {
  const parts = sshPublicKey.split(" ");
  const keyData = Buffer.from(parts[1]!, "base64");
  const hash = crypto.createHash("sha256").update(keyData).digest("base64");
  return `SHA256:${hash.replace(/=+$/, "")}`;
}

function generate(): BotIdentity {
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

/**
 * Create a per-app or shared identity store. Pass nothing to use the
 * shared `bottel` namespace, or pass a custom name for isolation.
 */
export function createIdentity(projectName: string = DEFAULT_PROJECT_NAME) {
  const config = new Conf<IdentityStore>({
    projectName,
    defaults: { auth: null },
  });

  return {
    /** Get the existing identity, or create+save a new one. */
    getOrCreate(): BotIdentity {
      const existing = config.get("auth");
      if (existing) return existing;
      const fresh = generate();
      config.set("auth", fresh);
      return fresh;
    },
    /** Get the existing identity, or null if none. */
    get(): BotIdentity | null {
      return config.get("auth");
    },
    /** Save a custom identity (e.g. imported from a backup). */
    save(identity: BotIdentity): void {
      config.set("auth", identity);
    },
    /** Set or update the display name on the existing identity. */
    setName(name: string): void {
      const auth = config.get("auth");
      if (auth) config.set("auth", { ...auth, name });
    },
    /** Wipe the identity (logout). */
    clear(): void {
      config.set("auth", null);
    },
    /** Check if an identity exists. */
    exists(): boolean {
      return config.get("auth") !== null;
    },
  };
}

// ─── Convenience: shared identity (the common case) ─────────────

const shared = createIdentity();

/** Get or create the shared bot identity used by all @bottel apps. */
export function getOrCreateIdentity(): BotIdentity {
  return shared.getOrCreate();
}

/** Get the shared bot identity, or null if none exists. */
export function getIdentity(): BotIdentity | null {
  return shared.get();
}

/** Save a custom identity to the shared store. */
export function saveIdentity(identity: BotIdentity): void {
  shared.save(identity);
}

/** Set the display name on the shared identity. */
export function setIdentityName(name: string): void {
  shared.setName(name);
}

/** Wipe the shared identity (logout from all bottel apps). */
export function clearIdentity(): void {
  shared.clear();
}

/** Check if a shared identity exists. */
export function hasIdentity(): boolean {
  return shared.exists();
}

/** Get a short fingerprint for display (12 chars, no SHA256: prefix). */
export function getShortFingerprint(): string {
  const id = shared.get();
  if (!id) return "not signed in";
  return id.fingerprint.replace("SHA256:", "").slice(0, 12);
}
