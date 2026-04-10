/**
 * Server-side Proof of Work verification.
 *
 * The client must find a nonce such that SHA256(challenge + nonce) has
 * at least N leading zero bits. The challenge is derived from the
 * request itself (channel + author + timestamp + payload hash) so
 * verification is stateless — no nonce registry needed.
 */

// Configurable via wrangler.toml [vars] or environment.
export interface PowConfig {
  difficulty: number;       // leading zero bits required (default 20)
  maxAgeMs: number;         // max age of the timestamp in ms (default 300000 = 5 min)
}

const DEFAULT_CONFIG: PowConfig = {
  difficulty: 20,
  maxAgeMs: 300_000,
};

/**
 * Build the challenge string from request parameters.
 * Both client and server compute this identically.
 */
export function buildChallenge(
  channel: string,
  author: string,
  timestamp: number,
  payloadHash: string,
): string {
  return `${channel}:${author}:${timestamp}:${payloadHash}`;
}

/**
 * Verify a proof of work submission.
 * Returns null if valid, or an error string if invalid.
 */
export async function verifyPow(
  channel: string,
  author: string,
  pow: { nonce: number; timestamp: number },
  payloadHash: string,
  config: Partial<PowConfig> = {},
): Promise<string | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Check timestamp freshness.
  const age = Date.now() - pow.timestamp;
  if (age < -30_000) return "POW timestamp is in the future";
  if (age > cfg.maxAgeMs) return "POW timestamp expired";

  // Rebuild the challenge and verify the hash.
  const challenge = buildChallenge(channel, author, pow.timestamp, payloadHash);
  const input = `${challenge}:${pow.nonce}`;
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
  );

  // Check leading zero bits.
  let zeroBits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeroBits += 8;
    } else {
      // Count leading zeros in this byte.
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= cfg.difficulty) break;
  }

  if (zeroBits < cfg.difficulty) {
    return `POW insufficient: got ${zeroBits} zero bits, need ${cfg.difficulty}`;
  }

  return null; // valid
}
