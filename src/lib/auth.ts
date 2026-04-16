import crypto from "node:crypto";
import Conf from "conf";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa";

interface AuthData {
  privateKey: string; // base64 encoded PKCS8 DER (Ed25519)
  publicKey: string; // ssh-ed25519 format
  fingerprint: string; // SHA256:...
  pqPrivateKey: string; // base64 raw ML-DSA-65 secret key (4032 bytes)
  pqPublicKey: string; // base64 raw ML-DSA-65 public key (1952 bytes)
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

/** Result of generating a fresh identity. */
export interface GeneratedIdentity {
  auth: AuthData;
  /** Opaque base64-encoded JSON blob containing both Ed25519 + ML-DSA keys.
   *  The user must save this string to restore the identity on another machine. */
  backupBlob: string;
}

/** Serialize an AuthData into the v1 backup blob (base64 JSON). */
function serializeBackupBlob(auth: AuthData): string {
  // Public keys: emit raw bytes for both algorithms.
  const edPubRaw = extractRawPublicKey(auth.publicKey);
  const json = JSON.stringify({
    v: 1,
    ed25519: {
      priv: auth.privateKey, // already base64 PKCS8 DER
      pub: edPubRaw.toString("base64"),
    },
    pq: {
      algo: "ml-dsa-65",
      priv: auth.pqPrivateKey,
      pub: auth.pqPublicKey,
    },
  });
  return Buffer.from(json, "utf8").toString("base64");
}

/** Generate a new hybrid Ed25519 + ML-DSA-65 key pair. */
export function generateKeyPair(): GeneratedIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const sshPubKey = toSshPublicKey(publicKey);
  const fingerprint = computeFingerprint(sshPubKey);

  // ML-DSA-65 keygen requires a 32-byte seed.
  const seed = crypto.randomBytes(32);
  const pq = ml_dsa65.keygen(new Uint8Array(seed));

  const auth: AuthData = {
    privateKey: privateKey.toString("base64"),
    publicKey: sshPubKey,
    fingerprint,
    pqPrivateKey: Buffer.from(pq.secretKey).toString("base64"),
    pqPublicKey: Buffer.from(pq.publicKey).toString("base64"),
  };

  return { auth, backupBlob: serializeBackupBlob(auth) };
}

/** Get current auth data, or null if not logged in. */
export function getAuth(): AuthData | null {
  return config.get("auth");
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

/** Compute base64(SHA-256(body)). Empty/missing body hashes to the SHA-256 of "". */
function computeContentDigest(body: string | Uint8Array | Buffer | null | undefined): string {
  let bytes: Buffer;
  if (body == null || body === "") {
    bytes = Buffer.alloc(0);
  } else if (typeof body === "string") {
    bytes = Buffer.from(body, "utf8");
  } else if (Buffer.isBuffer(body)) {
    bytes = body;
  } else {
    bytes = Buffer.from(body);
  }
  return crypto.createHash("sha256").update(bytes).digest("base64");
}

/**
 * Sign an HTTP request for hybrid Ed25519 + ML-DSA-65 auth.
 *
 * Signed payload (v2):
 *   `v2:hybrid\n<timestamp>\n<METHOD>\n<pathname+search>\n<contentDigest>`
 *
 * Both keys sign the same payload bytes. Returns null when not logged in.
 */
export function signRequest(
  method: string,
  path: string,
  body?: string | Uint8Array | Buffer | null,
): {
  timestamp: string;
  signature: string;
  publicKeyRaw: string;
  pqSignature: string;
  pqPublicKey: string;
  contentDigest: string;
} | null {
  const auth = getAuth();
  if (!auth) return null;

  const timestamp = String(Date.now());
  const parsed = new URL(path, "http://x");
  const signedPath = parsed.pathname + parsed.search;
  const contentDigest = computeContentDigest(body);
  const payload =
    "v2:hybrid\n" +
    timestamp + "\n" +
    method.toUpperCase() + "\n" +
    signedPath + "\n" +
    contentDigest;
  const payloadBytes = Buffer.from(payload, "utf8");

  // Ed25519 (Node native)
  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(auth.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const edSig = crypto.sign(null, payloadBytes, privateKeyObject);
  const rawEdPub = extractRawPublicKey(auth.publicKey);

  // ML-DSA-65 (noble)
  const pqPriv = new Uint8Array(Buffer.from(auth.pqPrivateKey, "base64"));
  const pqSig = ml_dsa65.sign(pqPriv, new Uint8Array(payloadBytes));

  return {
    timestamp,
    signature: edSig.toString("base64"),
    publicKeyRaw: rawEdPub.toString("base64"),
    pqSignature: Buffer.from(pqSig).toString("base64"),
    pqPublicKey: auth.pqPublicKey,
    contentDigest,
  };
}

/**
 * Create a signed token for WebSocket authentication (v3, hybrid).
 *
 * Token format: base64(ts|resource|edSig|edPub|pqSig|pqPub)
 * Signed payload: `v2:hybrid\n<ts>\n<resource>` (signed by both keys).
 */
export function createWsToken(resource: string = ""): string | null {
  const auth = getAuth();
  if (!auth) return null;

  const timestamp = String(Date.now());
  const payload = "v2:hybrid\n" + timestamp + "\n" + resource;
  const payloadBytes = Buffer.from(payload, "utf8");

  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(auth.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const edSig = crypto.sign(null, payloadBytes, privateKeyObject);
  const rawEdPub = extractRawPublicKey(auth.publicKey);

  const pqPriv = new Uint8Array(Buffer.from(auth.pqPrivateKey, "base64"));
  const pqSig = ml_dsa65.sign(pqPriv, new Uint8Array(payloadBytes));

  const tokenPlain =
    timestamp + "|" +
    resource + "|" +
    edSig.toString("base64") + "|" +
    rawEdPub.toString("base64") + "|" +
    Buffer.from(pqSig).toString("base64") + "|" +
    auth.pqPublicKey;
  return Buffer.from(tokenPlain, "utf8").toString("base64");
}

/**
 * Import a hybrid identity from an opaque backup blob (base64 JSON, v1).
 * Throws on malformed input or unsupported version.
 */
export function importPrivateKey(backupBlob: string): AuthData {
  let json: string;
  try {
    json = Buffer.from(backupBlob.trim(), "base64").toString("utf8");
  } catch {
    throw new Error("Invalid backup blob: not base64");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid backup blob: not JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid backup blob: not an object");
  }
  if (parsed.v !== 1) {
    throw new Error(`Unsupported backup blob version: ${parsed.v}`);
  }
  if (!parsed.ed25519?.priv || !parsed.pq?.priv || !parsed.pq?.pub) {
    throw new Error("Invalid backup blob: missing key material");
  }
  if (parsed.pq.algo !== "ml-dsa-65") {
    throw new Error(`Unsupported PQ algorithm: ${parsed.pq.algo}`);
  }

  // Reconstruct Ed25519 public key from the private key (authoritative)
  const privateKeyDer = Buffer.from(parsed.ed25519.priv, "base64");
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

  // Sanity check sizes for ML-DSA-65
  const pqPrivBytes = Buffer.from(parsed.pq.priv, "base64");
  const pqPubBytes = Buffer.from(parsed.pq.pub, "base64");
  if (pqPrivBytes.length !== 4032) {
    throw new Error(`Invalid ML-DSA-65 priv key length: ${pqPrivBytes.length}`);
  }
  if (pqPubBytes.length !== 1952) {
    throw new Error(`Invalid ML-DSA-65 pub key length: ${pqPubBytes.length}`);
  }

  return {
    privateKey: parsed.ed25519.priv,
    publicKey: sshPubKey,
    fingerprint,
    pqPrivateKey: parsed.pq.priv,
    pqPublicKey: parsed.pq.pub,
  };
}
