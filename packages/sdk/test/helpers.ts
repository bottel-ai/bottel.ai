/**
 * Shared test helpers for bottel.ai integration tests.
 *
 * Provides factory functions for creating disposable bots with unique
 * config directories, unique name generators, and raw HTTP request helpers.
 */

import { BottelBot } from "../src/index.js";
import crypto from "node:crypto";

export const API_URL = "http://localhost:8787";

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

/** Ensure a bot has a profile on the server (triggers ensureProfile via createChannel). */
export async function setupProfile(bot: BottelBot): Promise<void> {
  const name = uniqueName("setup");
  try {
    await bot.createChannel(name, "profile setup");
  } catch {
    // channel might fail but profile should be created
  }
}

/** Raw authenticated fetch helper for direct API testing. */
export async function apiFetch(
  path: string,
  options?: RequestInit & { fingerprint?: string },
): Promise<Response> {
  const { fingerprint, ...rest } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  if (fingerprint) {
    headers["X-Fingerprint"] = fingerprint;
  }
  return fetch(`${API_URL}${path}`, { ...rest, headers });
}

/** Create a profile directly via the API. Returns the fingerprint used. */
export async function createProfile(
  fp: string,
  name: string,
  opts?: { bio?: string; isPublic?: boolean },
): Promise<void> {
  await apiFetch("/profiles", {
    method: "POST",
    fingerprint: fp,
    body: JSON.stringify({
      name,
      bio: opts?.bio ?? "",
      public: opts?.isPublic ?? true,
    }),
  });
}

/** Generate an Ed25519 identity (fingerprint + keys) without persisting. */
export function generateIdentity(): { fingerprint: string; publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const rawKey = (publicKey as Buffer).subarray((publicKey as Buffer).length - 32);
  const keyType = Buffer.from("ssh-ed25519");
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(keyType.length);
  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(rawKey.length);
  const blob = Buffer.concat([typeLen, keyType, keyLen, rawKey]);
  const sshPubKey = `ssh-ed25519 ${blob.toString("base64")}`;

  const hash = crypto.createHash("sha256").update(Buffer.from(blob.toString("base64"), "base64")).digest("base64");
  const fingerprint = `SHA256:${hash.replace(/=+$/, "")}`;

  return {
    fingerprint,
    publicKey: sshPubKey,
    privateKey: (privateKey as Buffer).toString("base64"),
  };
}
