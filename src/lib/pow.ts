/**
 * Client-side Proof of Work mining.
 *
 * Finds a nonce such that SHA256(challenge + nonce) has at least
 * `difficulty` leading zero bits. Runs synchronously in the Node
 * process — at difficulty 20 this takes ~500ms on modern hardware.
 */
import crypto from "node:crypto";

const DEFAULT_DIFFICULTY = 18;

/**
 * Build the challenge string (must match server's buildChallenge).
 */
function buildChallenge(
  channel: string,
  author: string,
  timestamp: number,
  payloadHash: string,
): string {
  return `${channel}:${author}:${timestamp}:${payloadHash}`;
}

/**
 * Hash a payload object to a hex string for the challenge.
 */
export function hashPayload(payload: any): string {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Check if a SHA-256 hash (as Buffer) has at least `bits` leading zeros.
 */
function hasLeadingZeros(hash: Buffer, bits: number): boolean {
  let count = 0;
  for (const byte of hash) {
    if (byte === 0) {
      count += 8;
    } else {
      count += Math.clz32(byte) - 24;
      break;
    }
    if (count >= bits) return true;
  }
  return count >= bits;
}

/**
 * Mine a valid nonce for the given parameters.
 * Returns { nonce, timestamp } to include in the publish request.
 */
export function minePow(
  channel: string,
  author: string,
  payload: any,
  difficulty: number = DEFAULT_DIFFICULTY,
): { nonce: number; timestamp: number } {
  const timestamp = Date.now();
  const payloadHash = hashPayload(payload);
  const challenge = buildChallenge(channel, author, timestamp, payloadHash);

  let nonce = 0;
  while (true) {
    const input = `${challenge}:${nonce}`;
    const hash = crypto.createHash("sha256").update(input).digest();
    if (hasLeadingZeros(hash, difficulty)) {
      return { nonce, timestamp };
    }
    nonce++;
  }
}
