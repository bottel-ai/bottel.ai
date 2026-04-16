/**
 * Shared test helpers for bottel.ai integration tests.
 *
 * Provides factory functions for creating disposable bots with unique
 * config directories, unique name generators, and signed HTTP request helpers
 * for the v2 hybrid (Ed25519 + ML-DSA-65) auth scheme.
 */

import { BottelBot } from "../src/index.js";
import { generateIdentity as sdkGenerateIdentity } from "../src/identity.js";
import { signRequest } from "../src/sign.js";
import type { BotIdentity } from "../src/types.js";
import crypto from "node:crypto";

export const API_URL = "http://localhost:8787";

/**
 * In-process registry mapping fingerprint → full identity. Populated by
 * `generateIdentity()` so legacy `apiFetch({ fingerprint })` callers can be
 * upgraded to hybrid signing transparently without rewriting every test.
 */
const identityRegistry = new Map<string, BotIdentity>();

/** Create a bot with a unique configDir to avoid keypair collisions. */
export function createBot(name?: string): BottelBot {
  const suffix = crypto.randomBytes(4).toString("hex");
  return new BottelBot({
    name: name ?? `test-bot-${suffix}`,
    apiUrl: API_URL,
    configDir: `bottel-test-${suffix}`,
  });
}

/** Generate a unique channel/chat name. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Sleep for ms milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hybrid-signed fetch helper for direct API testing.
 *
 * Pass `identity` to sign with Ed25519 + ML-DSA-65 (the v2 hybrid scheme).
 * `fingerprint` is accepted for source-compat with legacy tests but is now
 * resolved to a full identity if you also pass `identity`. If only
 * `fingerprint` is given (no identity), the request is sent unsigned —
 * which is useful for the explicit 401-without-auth checks.
 */
export async function apiFetch(
  path: string,
  options?: RequestInit & { fingerprint?: string; identity?: BotIdentity },
): Promise<Response> {
  const { fingerprint, identity: explicitIdentity, ...rest } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((rest.headers as Record<string, string>) ?? {}),
  };

  // Resolve identity: explicit > registry lookup by fingerprint > none
  const identity =
    explicitIdentity ?? (fingerprint ? identityRegistry.get(fingerprint) : undefined);

  if (identity) {
    const method = (rest.method ?? "GET").toUpperCase();
    const bodyStr =
      typeof rest.body === "string"
        ? rest.body
        : rest.body == null
        ? ""
        : String(rest.body);
    const signed = signRequest(identity, method, path, bodyStr);
    headers["X-Timestamp"] = signed.timestamp;
    headers["X-Signature"] = signed.signature;
    headers["X-Public-Key"] = signed.publicKeyRaw;
    headers["X-PQ-Signature"] = signed.pqSignature;
    headers["X-PQ-Public-Key"] = signed.pqPublicKey;
    headers["X-Content-Digest"] = signed.contentDigest;
  }

  return fetch(`${API_URL}${path}`, { ...rest, headers });
}

/** Create a profile directly via the API for a given identity (or fingerprint). */
export async function createProfile(
  identityOrFp: BotIdentity | string,
  name: string,
  opts?: { bio?: string; isPublic?: boolean },
): Promise<void> {
  const identity =
    typeof identityOrFp === "string"
      ? identityRegistry.get(identityOrFp)
      : identityOrFp;

  await apiFetch("/profiles", {
    method: "POST",
    identity,
    body: JSON.stringify({
      name,
      bio: opts?.bio ?? "",
      public: opts?.isPublic ?? true,
    }),
  });
}

/**
 * Generate a hybrid (Ed25519 + ML-DSA-65) identity without persisting it
 * to disk. Also registers the identity in the in-process lookup table so
 * legacy `apiFetch({ fingerprint })` calls can be auto-signed.
 */
export function generateIdentity(): BotIdentity {
  const identity = sdkGenerateIdentity();
  identityRegistry.set(identity.fingerprint, identity);
  return identity;
}
