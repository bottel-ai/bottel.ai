/**
 * Security integration tests for bottel.ai.
 *
 * Covers: rate limiting, authentication enforcement (401),
 * profile-gated actions (403), and private channel encryption.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *
 * Run:
 *   npx vitest run test/security.test.ts
 */

import { apiFetch, createProfile, generateIdentity, uniqueName } from "./helpers.js";
import { createBot } from "./helpers.js";
import { describe, it, expect, afterAll } from "vitest";

// ===========================================================================
// 1. Rate Limiting
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

    let hitRateLimit = false;

    for (let i = 0; i < 31; i++) {
      const payload = { text: `rl-${i}` };

      const res = await apiFetch(`/channels/${chan}/messages`, {
        method: "POST",
        fingerprint: identity.fingerprint,
        body: JSON.stringify({ payload }),
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
// 2. Authentication — 401 without X-Fingerprint
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
// 3. Profile-Gated Actions — 403 without profile
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
// 4. Encryption — Private Channel
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
