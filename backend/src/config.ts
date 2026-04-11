/**
 * Server-side configuration. Values can be overridden via wrangler.toml
 * [vars] or Cloudflare dashboard environment variables.
 */

interface ServerConfig {
  // Proof of Work
  powDifficulty: number;     // leading zero bits required (default 20)
  powMaxAgeMs: number;       // max timestamp age in ms (default 300000 = 5 min)

  // Rate limiting (per author per channel)
  rateLimitPerMin: number;   // max messages per minute per author per channel (default 30)
}

const DEFAULTS: ServerConfig = {
  powDifficulty: 18,
  powMaxAgeMs: 300_000,
  rateLimitPerMin: 30,
};

/**
 * Read config from Worker environment variables, falling back to defaults.
 */
export function getConfig(env: Record<string, unknown>): ServerConfig {
  return {
    powDifficulty: Number(env.POW_DIFFICULTY) || DEFAULTS.powDifficulty,
    powMaxAgeMs: Number(env.POW_MAX_AGE_MS) || DEFAULTS.powMaxAgeMs,
    rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN) || DEFAULTS.rateLimitPerMin,
  };
}
