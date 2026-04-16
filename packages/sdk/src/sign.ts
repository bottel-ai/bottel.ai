import crypto from "node:crypto";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa";
import type { BotIdentity } from "./types.js";

/**
 * Extract the raw 32-byte Ed25519 public key from an SSH-format public key
 * string ("ssh-ed25519 AAAA...").
 */
function extractRawPublicKey(sshPublicKey: string): Buffer {
  const parts = sshPublicKey.split(" ");
  const blob = Buffer.from(parts[1]!, "base64");
  // Wire format: uint32(len) + "ssh-ed25519" (11 bytes) + uint32(len) + 32-byte key
  return blob.subarray(blob.length - 32);
}

/** Compute base64(SHA-256(bodyBytes)) — never returns blank; empty bodies hash to the SHA-256 of "". */
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

export interface SignedRequest {
  timestamp: string;
  signature: string;
  publicKeyRaw: string;
  pqSignature: string;
  pqPublicKey: string;
  contentDigest: string;
}

/**
 * Sign an HTTP request for hybrid Ed25519 + ML-DSA-65 auth.
 *
 * Signed payload (v2 hybrid):
 *   `v2:hybrid\n<timestamp>\n<METHOD>\n<pathname+search>\n<contentDigest>`
 *
 * The payload is signed with BOTH the Ed25519 private key and the ML-DSA-65
 * private key. The server verifies both signatures.
 *
 * Returns timestamp, both signatures (base64), both public keys (base64),
 * and the content digest. The caller must send all six headers:
 *   X-Timestamp, X-Signature, X-Public-Key, X-PQ-Signature, X-PQ-Public-Key,
 *   X-Content-Digest.
 */
export function signRequest(
  identity: BotIdentity,
  method: string,
  path: string,
  body?: string | Uint8Array | Buffer | null,
): SignedRequest {
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

  // Ed25519 signature
  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(identity.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signatureBuffer = crypto.sign(null, payloadBytes, privateKeyObject);
  const rawKey = extractRawPublicKey(identity.publicKey);

  // ML-DSA-65 signature
  const pqSecret = Buffer.from(identity.pqPrivateKey, "base64");
  const pqPub = Buffer.from(identity.pqPublicKey, "base64");
  const pqSig = ml_dsa65.sign(pqSecret, payloadBytes);

  return {
    timestamp,
    signature: signatureBuffer.toString("base64"),
    publicKeyRaw: rawKey.toString("base64"),
    pqSignature: Buffer.from(pqSig).toString("base64"),
    pqPublicKey: Buffer.from(pqPub).toString("base64"),
    contentDigest,
  };
}

/**
 * Create a signed token for WebSocket authentication, bound to a specific
 * resource path. Hybrid Ed25519 + ML-DSA-65 format.
 *
 * Token format: base64(
 *   timestamp + "|" + resource + "|" +
 *   ed25519Signature + "|" + ed25519PublicKeyRawBase64 + "|" +
 *   pqSignatureBase64 + "|" + pqPublicKeyBase64
 * )  — 6 pipe-separated fields.
 *
 * Signed payload (covered by BOTH keys): `v2:hybrid\n<timestamp>\n<resource>`
 *
 * Matches the format that the backend's verifyWsToken() and the web/CLI
 * clients emit. Any drift here makes WS connections fail.
 */
export function createWsToken(identity: BotIdentity, resource: string = ""): string {
  const timestamp = String(Date.now());
  const payload = "v2:hybrid\n" + timestamp + "\n" + resource;
  const payloadBytes = Buffer.from(payload, "utf8");

  const privateKeyObject = crypto.createPrivateKey({
    key: Buffer.from(identity.privateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signatureBuffer = crypto.sign(null, payloadBytes, privateKeyObject);
  const rawKey = extractRawPublicKey(identity.publicKey);

  const pqSecret = Buffer.from(identity.pqPrivateKey, "base64");
  const pqPub = Buffer.from(identity.pqPublicKey, "base64");
  const pqSig = ml_dsa65.sign(pqSecret, payloadBytes);

  const tokenPlain =
    timestamp + "|" + resource + "|" +
    signatureBuffer.toString("base64") + "|" +
    rawKey.toString("base64") + "|" +
    Buffer.from(pqSig).toString("base64") + "|" +
    Buffer.from(pqPub).toString("base64");
  return Buffer.from(tokenPlain).toString("base64");
}
