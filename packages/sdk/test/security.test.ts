/**
 * Security integration tests for bottel.ai.
 *
 * Covers: POW verification, POW replay protection, rate limiting,
 * authentication enforcement (401), profile-gated actions (403),
 * and private channel encryption.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *
 * Run:
 *   npx vitest run test/security.test.ts
 */

import { apiFetch, createProfile, generateIdentity, uniqueName, sleep, API_URL } from "./helpers.js";
import { createBot } from "./helpers.js";
import { describe, it, expect, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// POW helpers (inline miner with custom options for security testing)
// ---------------------------------------------------------------------------

async function hashPayload(payload: any): Promise<string> {
  const json = JSON.stringify(payload);
  const buf = Buffer.from(json, "utf-8");
  const hash = (await import("node:crypto")).createHash("sha256").update(buf).digest("hex");
  return hash;
}

async function minePowCustom(
  channel: string, author: string, payload: any,
  opts?: { difficulty?: number; timestampOverride?: number }
): Promise<{ nonce: number; timestamp: number }> {
  const payloadHash = await hashPayload(payload);
  const timestamp = opts?.timestampOverride ?? Date.now();
  const difficulty = opts?.difficulty ?? 18;
  let nonce = 0;
  const { createHash } = await import("node:crypto");
  while (true) {
    const challenge = `${channel}:${author}:${timestamp}:${payloadHash}:${nonce}`;
    const hash = createHash("sha256").update(challenge).digest();
    // Check leading zero bits
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) { zeroBits += 8; continue; }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= difficulty) return { nonce, timestamp };
    nonce++;
  }
}

// ===========================================================================
// 1. POW Verification
// ===========================================================================

describe("POW Verification", () => {
  const identity = generateIdentity();
  const identityName = uniqueName("pow-bot");
  const chan = uniqueName("pow-chan");

  // Setup: create profile and channel
  it("setup: create profile and channel", async () => {
    await createProfile(identity.fingerprint, identityName);
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "pow verification tests" }),
    });
    expect(res.status).toBe(201);
  });

  it("valid 18-bit POW is accepted (publish succeeds)", async () => {
    const payload = { text: "valid pow test" };
    const pow = await minePowCustom(chan, identity.fingerprint, payload);

    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({
        payload,
        nonce: pow.nonce,
        timestamp: pow.timestamp,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body.payload).toEqual(payload);
  }, 60000);

  it("missing POW field returns 400", async () => {
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ payload: { text: "no pow" } }),
    });
    expect(res.status).toBe(400);
  });

  it("POW with expired timestamp (>5min old) returns 400", async () => {
    const payload = { text: "expired pow" };
    const pow = await minePowCustom(chan, identity.fingerprint, payload, {
      timestampOverride: Date.now() - 6 * 60 * 1000,
    });

    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({
        payload,
        nonce: pow.nonce,
        timestamp: pow.timestamp,
      }),
    });
    expect(res.status).toBe(400);
  }, 60000);

  it("POW with future timestamp (>30s ahead) returns 400", async () => {
    const payload = { text: "future pow" };
    const pow = await minePowCustom(chan, identity.fingerprint, payload, {
      timestampOverride: Date.now() + 60_000,
    });

    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({
        payload,
        nonce: pow.nonce,
        timestamp: pow.timestamp,
      }),
    });
    expect(res.status).toBe(400);
  }, 60000);
});

// ===========================================================================
// 2. POW Replay Protection
// ===========================================================================

describe("POW Replay Protection", () => {
  it("same POW timestamp reused on same channel is rejected (400)", async () => {
    const identity = generateIdentity();
    const name = uniqueName("replay-bot");
    const chan = uniqueName("replay-chan");

    await createProfile(identity.fingerprint, name);
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "replay test" }),
    });

    // First message with a fixed timestamp
    const fixedTimestamp = Date.now();
    const payload1 = { text: "first" };
    const pow1 = await minePowCustom(chan, identity.fingerprint, payload1, {
      timestampOverride: fixedTimestamp,
    });

    const res1 = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({
        payload: payload1,
        nonce: pow1.nonce,
        timestamp: pow1.timestamp,
      }),
    });
    expect(res1.status).toBe(201);

    // Second message reusing the same timestamp
    const payload2 = { text: "second" };
    const pow2 = await minePowCustom(chan, identity.fingerprint, payload2, {
      timestampOverride: fixedTimestamp,
    });

    const res2 = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({
        payload: payload2,
        nonce: pow2.nonce,
        timestamp: pow2.timestamp,
      }),
    });
    expect(res2.status).toBe(400);
  }, 60000);

  it("strictly increasing timestamps are accepted", async () => {
    const identity = generateIdentity();
    const name = uniqueName("incr-bot");
    const chan = uniqueName("incr-chan");

    await createProfile(identity.fingerprint, name);
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "increasing ts test" }),
    });

    const baseTs = Date.now();

    for (let i = 0; i < 3; i++) {
      const payload = { text: `msg-${i}` };
      const pow = await minePowCustom(chan, identity.fingerprint, payload, {
        timestampOverride: baseTs + i + 1,
      });

      const res = await apiFetch(`/channels/${chan}/messages`, {
        method: "POST",
        fingerprint: identity.fingerprint,
        body: JSON.stringify({
          payload,
          nonce: pow.nonce,
          timestamp: pow.timestamp,
        }),
      });
      expect(res.status).toBe(201);
    }
  }, 60000);
});

// ===========================================================================
// 3. Rate Limiting
// ===========================================================================

describe("Rate Limiting — Channel Messages", () => {
  it("31st message in a channel within 1 minute gets 429", async () => {
    const identity = generateIdentity();
    const name = uniqueName("rl-chan-bot");
    const chan = uniqueName("rl-chan");

    await createProfile(identity.fingerprint, name);
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "rate limit test" }),
    });

    const baseTs = Date.now();
    let hitRateLimit = false;

    for (let i = 0; i < 31; i++) {
      const payload = { text: `rl-${i}` };
      const pow = await minePowCustom(chan, identity.fingerprint, payload, {
        timestampOverride: baseTs + i + 1,
      });

      const res = await apiFetch(`/channels/${chan}/messages`, {
        method: "POST",
        fingerprint: identity.fingerprint,
        body: JSON.stringify({
          payload,
          nonce: pow.nonce,
          timestamp: pow.timestamp,
        }),
      });

      if (i < 30) {
        expect(res.status).toBe(201);
      } else {
        expect(res.status).toBe(429);
        hitRateLimit = true;
      }
    }

    expect(hitRateLimit).toBe(true);
  }, 180000);
});

describe("Rate Limiting — Chat DM", () => {
  it("61st DM in a chat within 1 minute gets 429", async () => {
    const idA = generateIdentity();
    const idB = generateIdentity();
    const nameA = uniqueName("rl-dm-a");
    const nameB = uniqueName("rl-dm-b");

    await createProfile(idA.fingerprint, nameA);
    await createProfile(idB.fingerprint, nameB);

    // Create a chat
    const chatRes = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: idA.fingerprint,
      body: JSON.stringify({ recipient: idB.fingerprint }),
    });
    expect(chatRes.status).toBe(201);
    const chatData: any = await chatRes.json();
    const chatId = chatData.id;

    let hitRateLimit = false;

    for (let i = 0; i < 61; i++) {
      const res = await apiFetch(`/chat/${chatId}/messages`, {
        method: "POST",
        fingerprint: idA.fingerprint,
        body: JSON.stringify({ content: `dm-${i}` }),
      });

      if (i < 60) {
        expect(res.status).toBe(201);
      } else {
        expect(res.status).toBe(429);
        hitRateLimit = true;
      }
    }

    expect(hitRateLimit).toBe(true);
  }, 180000);
});

describe("Rate Limiting — Chat Search", () => {
  it("31st chat search within 1 minute gets 429", async () => {
    const identity = generateIdentity();
    const name = uniqueName("rl-search-bot");
    await createProfile(identity.fingerprint, name);

    let hitRateLimit = false;

    for (let i = 0; i < 31; i++) {
      const res = await apiFetch(`/chat/search?q=test-${i}`, {
        fingerprint: identity.fingerprint,
      });

      if (i < 30) {
        expect([200, 404].includes(res.status)).toBe(true);
      } else {
        expect(res.status).toBe(429);
        hitRateLimit = true;
      }
    }

    expect(hitRateLimit).toBe(true);
  }, 120000);
});

// ===========================================================================
// 4. Authentication — 401 without X-Fingerprint
// ===========================================================================

describe("Authentication (401 without X-Fingerprint)", () => {
  const endpoints: Array<{ method: string; path: string }> = [
    { method: "POST", path: "/profiles" },
    { method: "POST", path: "/channels" },
    { method: "POST", path: "/channels/test/messages" },
    { method: "POST", path: "/channels/test/follow" },
    { method: "DELETE", path: "/channels/test/follow" },
    { method: "GET", path: "/channels/test/follow" },
    { method: "POST", path: "/channels/test/follow/fp/approve" },
    { method: "GET", path: "/channels/test/key" },
    { method: "POST", path: "/profiles/ping" },
    { method: "DELETE", path: "/channels/test" },
    { method: "POST", path: "/chat/new" },
    { method: "GET", path: "/chat/list" },
    { method: "POST", path: "/chat/test/messages" },
    { method: "GET", path: "/chat/test/messages" },
    { method: "DELETE", path: "/chat/test" },
    { method: "GET", path: "/chat/search" },
  ];

  for (const { method, path } of endpoints) {
    it(`${method} ${path} — returns 401 without auth`, async () => {
      const res = await apiFetch(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

// ===========================================================================
// 5. Profile-Gated Actions — 403 without profile
// ===========================================================================

describe("Profile-Gated Actions (403 without profile)", () => {
  const noProfile = generateIdentity();
  const dummyChan = uniqueName("nogated");

  const gatedEndpoints: Array<{ method: string; path: string }> = [
    { method: "POST", path: "/channels" },
    { method: "POST", path: `/channels/${dummyChan}/messages` },
    { method: "POST", path: `/channels/${dummyChan}/follow` },
    { method: "POST", path: "/chat/new" },
    { method: "POST", path: "/chat/fake-chat-id/messages" },
  ];

  for (const { method, path } of gatedEndpoints) {
    it(`${method} ${path} — returns 403 without profile`, async () => {
      const res = await apiFetch(path, {
        method,
        fingerprint: noProfile.fingerprint,
        body: JSON.stringify(
          path === "/channels"
            ? { name: uniqueName("noprof"), description: "nope" }
            : path.endsWith("/messages")
            ? { payload: { text: "hi" }, content: "hi" }
            : path === "/chat/new"
            ? { recipient: "SHA256:fake" }
            : { name: dummyChan },
        ),
      });
      expect(res.status).toBe(403);
    });
  }
});

// ===========================================================================
// 6. Encryption — Private Channel
// ===========================================================================

describe("Encryption — Private Channel", () => {
  const ownerBot = createBot("enc-owner");
  const memberBot = createBot("enc-member");
  const outsider = generateIdentity();
  const outsiderName = uniqueName("enc-outsider");
  const privChan = uniqueName("enc-priv");

  afterAll(() => {
    ownerBot.close();
    memberBot.close();
  });

  it("setup: create profiles and private channel", async () => {
    // Owner creates a channel (which triggers profile creation)
    const ch = await ownerBot.createChannel(privChan, "encrypted channel", false);
    expect(ch).toBeDefined();
    expect(ch.name).toBe(privChan);

    // Member also needs a profile
    await memberBot.createChannel(uniqueName("enc-setup"), "setup");

    // Create outsider profile
    await createProfile(outsider.fingerprint, outsiderName);
  });

  it("publish to private channel succeeds via SDK", async () => {
    const msg = await ownerBot.publish(privChan, { secret: "hello" });
    expect(msg).toBeDefined();
    expect(msg.id).toBeTruthy();
  }, 60000);

  it("raw GET returns encrypted payload (enc: prefix)", async () => {
    const res = await apiFetch(`/channels/${privChan}/messages`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.messages ?? body)).toBe(true);

    const messages = body.messages ?? body;
    expect(messages.length).toBeGreaterThan(0);

    // The payload should be encrypted — check for enc: prefix
    const msg = messages[0];
    const payloadStr =
      typeof msg.payload === "string" ? msg.payload : JSON.stringify(msg.payload);
    expect(payloadStr).toMatch(/^enc:/);
  });

  it("active member can fetch encryption key via GET /channels/:name/key", async () => {
    const res = await apiFetch(`/channels/${privChan}/key`, {
      fingerprint: ownerBot.fingerprint,
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toHaveProperty("key");
    expect(typeof body.key).toBe("string");
    expect(body.key.length).toBeGreaterThan(0);
  });

  it("non-member gets 403 on key endpoint", async () => {
    const res = await apiFetch(`/channels/${privChan}/key`, {
      fingerprint: outsider.fingerprint,
    });
    expect(res.status).toBe(403);
  });
});
