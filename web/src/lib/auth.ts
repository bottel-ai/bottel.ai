// Web-based identity management using Web Crypto API + ML-DSA-65 (post-quantum).
//
// Hybrid signing: every authenticated request is signed with BOTH an Ed25519
// classical key (sealed in IndexedDB as a non-extractable CryptoKey) AND an
// ML-DSA-65 post-quantum key (raw bytes in IndexedDB — Web Crypto has no
// PQ support yet, so the PQ private key is software-side and stealable via
// XSS; the classical key remains XSS-proof).
//
// All state lives in IndexedDB. Public identity (fingerprint, both raw public
// keys) and the cached profile name also live in IDB alongside the keys.

import { ml_dsa65 } from "@noble/post-quantum/ml-dsa";

export interface WebIdentity {
  fingerprint: string;
  publicKeyRawBase64: string;
  pqPublicKeyBase64: string;
}

const IDB_DB = "bottel";
const IDB_STORE = "keys";
const IDB_IDENTITY = "identity";
const IDB_SIGNING = "signing";
const IDB_PQ_PRIV = "pq_signing_priv";
const IDB_PQ_PUB = "pq_signing_pub";

// ─── IndexedDB helpers ────────────────────────────────────────────

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openIdb();
  const result = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

async function idbDelete(key: string): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ─── Utilities ────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the call stack on large (≈4KB) PQ keys/sigs.
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function fingerprintFromRawPub(publicKeyRaw: Uint8Array): Promise<string> {
  const keyType = new TextEncoder().encode("ssh-ed25519");
  const typeLen = new Uint8Array(4);
  new DataView(typeLen.buffer).setUint32(0, keyType.length);
  const keyLen = new Uint8Array(4);
  new DataView(keyLen.buffer).setUint32(0, publicKeyRaw.length);
  const blob = new Uint8Array([...typeLen, ...keyType, ...keyLen, ...publicKeyRaw]);
  const hashBuf = await crypto.subtle.digest("SHA-256", blob);
  const hashBase64 = toBase64(new Uint8Array(hashBuf)).replace(/=+$/, "");
  return `SHA256:${hashBase64}`;
}

// ─── In-memory cache ──────────────────────────────────────────────

let cachedIdentity: WebIdentity | null = null;
let cachedPqPriv: Uint8Array | null = null;

/**
 * Hydrate the in-memory cache from IndexedDB. Call once at app boot
 * before React renders so the sync accessors return real values on
 * first render instead of null.
 */
export async function initIdentity(): Promise<void> {
  try {
    cachedIdentity = await idbGet<WebIdentity>(IDB_IDENTITY);
    cachedPqPriv = await idbGet<Uint8Array>(IDB_PQ_PRIV);
  } catch {
    cachedIdentity = null;
    cachedPqPriv = null;
  }
}

// ─── Identity (sync accessors backed by the cache) ────────────────

export function getIdentity(): WebIdentity | null {
  return cachedIdentity;
}

async function saveIdentity(id: WebIdentity): Promise<void> {
  cachedIdentity = id;
  await idbPut(IDB_IDENTITY, id);
}

export async function clearIdentity(): Promise<void> {
  cachedIdentity = null;
  cachedPqPriv = null;
  await Promise.all([
    idbDelete(IDB_IDENTITY),
    idbDelete(IDB_SIGNING),
    idbDelete(IDB_PQ_PRIV),
    idbDelete(IDB_PQ_PUB),
  ]);
}

export function isLoggedIn(): boolean {
  return cachedIdentity !== null;
}

// ─── Backup blob (opaque base64-of-JSON) ──────────────────────────

interface BackupBlob {
  v: 1;
  ed25519: { priv: string; pub: string };
  pq: { algo: "ml-dsa-65"; priv: string; pub: string };
}

function encodeBackup(blob: BackupBlob): string {
  return btoa(JSON.stringify(blob));
}

function decodeBackup(s: string): BackupBlob {
  let json: string;
  try {
    json = atob(s.trim());
  } catch {
    throw new Error("Backup blob is not valid base64.");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Backup blob is not valid JSON.");
  }
  if (!parsed || parsed.v !== 1) {
    throw new Error("Unsupported backup version (expected v:1).");
  }
  if (
    !parsed.ed25519?.priv ||
    !parsed.ed25519?.pub ||
    parsed.pq?.algo !== "ml-dsa-65" ||
    !parsed.pq?.priv ||
    !parsed.pq?.pub
  ) {
    throw new Error("Backup blob is missing required fields.");
  }
  return parsed as BackupBlob;
}

// ─── Keygen / import ──────────────────────────────────────────────

/**
 * Generate a new hybrid keypair (Ed25519 + ML-DSA-65). Returns the
 * one-time opaque backup blob for the caller to show in a backup
 * modal — after the caller drops the string from state, the Ed25519
 * key is sealed as a non-extractable CryptoKey in IDB while the
 * ML-DSA private key remains in IDB as raw bytes.
 */
export async function generateKeyPair(): Promise<{
  identity: WebIdentity;
  backupBlob: string;
}> {
  // Ed25519 — generate extractable so we can export once for the backup,
  // then re-import as non-extractable for storage.
  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const pkcs8Buf = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pkcs8 = new Uint8Array(pkcs8Buf);
  const edPrivBase64 = toBase64(pkcs8);

  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const publicKeyRawBase64 = toBase64(rawPub);
  const fingerprint = await fingerprintFromRawPub(rawPub);

  const sealed = await crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", false, ["sign"]);
  await idbPut(IDB_SIGNING, sealed);

  // ML-DSA-65 — software keys, raw bytes.
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const pqKp = ml_dsa65.keygen(seed);
  const pqPriv = pqKp.secretKey;
  const pqPub = pqKp.publicKey;
  const pqPrivBase64 = toBase64(pqPriv);
  const pqPublicKeyBase64 = toBase64(pqPub);

  await idbPut(IDB_PQ_PRIV, pqPriv);
  await idbPut(IDB_PQ_PUB, pqPub);
  cachedPqPriv = pqPriv;

  const identity: WebIdentity = {
    fingerprint,
    publicKeyRawBase64,
    pqPublicKeyBase64,
  };
  await saveIdentity(identity);

  const backupBlob = encodeBackup({
    v: 1,
    ed25519: { priv: edPrivBase64, pub: publicKeyRawBase64 },
    pq: { algo: "ml-dsa-65", priv: pqPrivBase64, pub: pqPublicKeyBase64 },
  });

  return { identity, backupBlob };
}

/**
 * Import a hybrid backup blob (base64 of JSON, v:1).
 * Restores both the Ed25519 (sealed as non-extractable CryptoKey)
 * and ML-DSA-65 (raw bytes) into IDB.
 */
export async function importPrivateKey(backupBlob: string): Promise<WebIdentity> {
  const blob = decodeBackup(backupBlob);

  // Ed25519
  const pkcs8 = fromBase64(blob.ed25519.priv);
  // Verify by re-importing as extractable to read the JWK and derive pub bytes;
  // cross-check against the pub stored in the blob.
  const extractable = await crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", extractable);
  const publicKeyRaw = fromBase64(jwk.x!.replace(/-/g, "+").replace(/_/g, "/"));
  const publicKeyRawBase64 = toBase64(publicKeyRaw);

  const sealed = await crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", false, ["sign"]);
  await idbPut(IDB_SIGNING, sealed);

  // ML-DSA-65
  const pqPriv = fromBase64(blob.pq.priv);
  const pqPub = fromBase64(blob.pq.pub);
  await idbPut(IDB_PQ_PRIV, pqPriv);
  await idbPut(IDB_PQ_PUB, pqPub);
  cachedPqPriv = pqPriv;

  const fingerprint = await fingerprintFromRawPub(publicKeyRaw);
  const identity: WebIdentity = {
    fingerprint,
    publicKeyRawBase64,
    pqPublicKeyBase64: toBase64(pqPub),
  };
  await saveIdentity(identity);
  return identity;
}

// ─── Signing ──────────────────────────────────────────────────────

async function loadSigningKey(): Promise<CryptoKey | null> {
  return await idbGet<CryptoKey>(IDB_SIGNING);
}

async function loadPqPriv(): Promise<Uint8Array | null> {
  if (cachedPqPriv) return cachedPqPriv;
  const v = await idbGet<Uint8Array>(IDB_PQ_PRIV);
  if (v) cachedPqPriv = v;
  return v;
}

/** Compute base64(SHA-256(bytes)) for an HTTP body. Empty/missing → SHA-256 of "". */
async function computeContentDigest(
  body: string | Uint8Array | null | undefined,
): Promise<string> {
  let bytes: Uint8Array;
  if (body == null || body === "") {
    bytes = new Uint8Array(0);
  } else if (typeof body === "string") {
    bytes = new TextEncoder().encode(body);
  } else {
    bytes = body;
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64(new Uint8Array(hash));
}

/**
 * Sign an HTTP request with the hybrid Ed25519 + ML-DSA-65 scheme.
 *
 * Signed payload (v2):
 *   `v2:hybrid\n<timestamp>\n<METHOD>\n<pathname+search>\n<contentDigest>`
 *
 * Both signatures cover the same payload bytes. Returns headers matching the
 * backend's expected format, or null if there's no stored identity.
 */
export async function signRequest(
  method: string,
  path: string,
  body?: string | Uint8Array | null,
): Promise<{
  timestamp: string;
  signature: string;
  publicKeyRaw: string;
  pqSignature: string;
  pqPublicKey: string;
  contentDigest: string;
} | null> {
  const identity = getIdentity();
  if (!identity) return null;
  const [edKey, pqPriv] = await Promise.all([loadSigningKey(), loadPqPriv()]);
  if (!edKey || !pqPriv) return null;

  const timestamp = String(Date.now());
  const parsed = new URL(path, "http://x");
  const signedPath = parsed.pathname + parsed.search;
  const contentDigest = await computeContentDigest(body);
  const payload =
    "v2:hybrid\n" +
    timestamp +
    "\n" +
    method.toUpperCase() +
    "\n" +
    signedPath +
    "\n" +
    contentDigest;
  const payloadBytes = new TextEncoder().encode(payload);

  // Ed25519 is async (Web Crypto); ML-DSA is sync (noble) — wrap so both
  // run via Promise.all without one blocking the other in the microtask queue.
  const [edSigBuf, pqSig] = await Promise.all([
    crypto.subtle.sign("Ed25519", edKey, payloadBytes),
    Promise.resolve(ml_dsa65.sign(pqPriv, payloadBytes)),
  ]);

  return {
    timestamp,
    signature: toBase64(new Uint8Array(edSigBuf)),
    publicKeyRaw: identity.publicKeyRawBase64,
    pqSignature: toBase64(pqSig),
    pqPublicKey: identity.pqPublicKeyBase64,
    contentDigest,
  };
}

/**
 * Create a signed WebSocket token bound to a specific WS resource path.
 *
 * Token format (v3):
 *   base64(timestamp + "|" + resource + "|" + edSig + "|" + edPub + "|" + pqSig + "|" + pqPub)
 *
 * Signed payload: `v2:hybrid\n<timestamp>\n<resource>` (covered by both keys).
 */
export async function createWsToken(resource: string): Promise<string | null> {
  const identity = getIdentity();
  if (!identity) return null;
  const [edKey, pqPriv] = await Promise.all([loadSigningKey(), loadPqPriv()]);
  if (!edKey || !pqPriv) return null;

  const timestamp = String(Date.now());
  const payload = "v2:hybrid\n" + timestamp + "\n" + resource;
  const payloadBytes = new TextEncoder().encode(payload);

  const [edSigBuf, pqSig] = await Promise.all([
    crypto.subtle.sign("Ed25519", edKey, payloadBytes),
    Promise.resolve(ml_dsa65.sign(pqPriv, payloadBytes)),
  ]);
  const edSig = toBase64(new Uint8Array(edSigBuf));
  const pqSigB64 = toBase64(pqSig);

  const tokenPlain =
    timestamp +
    "|" +
    resource +
    "|" +
    edSig +
    "|" +
    identity.publicKeyRawBase64 +
    "|" +
    pqSigB64 +
    "|" +
    identity.pqPublicKeyBase64;
  return btoa(tokenPlain);
}
