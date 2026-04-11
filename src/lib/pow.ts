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
function hashPayload(payload: any): string {
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

// How many hashes to compute before yielding the event loop.
// Lower = smoother spinner animation, higher = faster mining.
const YIELD_INTERVAL = 4096;

/**
 * Mine a valid nonce for the given parameters.
 * Async — yields the event loop every YIELD_INTERVAL iterations so
 * ink can update the spinner animation during mining.
 */
export async function minePow(
  channel: string,
  author: string,
  payload: any,
  difficulty: number = DEFAULT_DIFFICULTY,
): Promise<{ nonce: number; timestamp: number }> {
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
    // Yield every N iterations so the event loop can paint spinner frames.
    if (nonce % YIELD_INTERVAL === 0) {
      await new Promise<void>((r) => setImmediate(r));
    }
  }
}
