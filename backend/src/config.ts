/**
 * Server-side configuration. Values can be overridden via wrangler.toml
 * [vars] or Cloudflare dashboard environment variables.
 */

interface ServerConfig {
  // Rate limiting (per author per channel)
  rateLimitPerMin: number;   // max messages per minute per author per channel (default 30)
}

const DEFAULTS: ServerConfig = {
  rateLimitPerMin: 30,
};

/**
 * Read config from Worker environment variables, falling back to defaults.
 */
export function getConfig(env: Record<string, unknown>): ServerConfig {
  return {
    rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN) || DEFAULTS.rateLimitPerMin,
  };
}
