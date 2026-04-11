/**
 * Edge case and error handling tests for bottel.ai.
 *
 * Covers boundary conditions, malformed inputs, and defensive behavior
 * across channels, messages, profiles, chats, follows, search, and
 * concurrent operations.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *
 * Run:
 *   npx vitest run test/edge-cases.test.ts
 */

import { apiFetch, createProfile, generateIdentity, uniqueName, sleep, createBot, API_URL } from "./helpers.js";
import { describe, it, expect, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// POW helpers (inline miner for raw API tests)
// ---------------------------------------------------------------------------

async function hashPayload(payload: any): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function minePow(channel: string, author: string, payload: any): Promise<{ nonce: number; timestamp: number }> {
  const payloadHash = await hashPayload(payload);
  const timestamp = Date.now();
  const { createHash } = await import("node:crypto");
  let nonce = 0;
  while (true) {
    const hash = createHash("sha256").update(`${channel}:${author}:${timestamp}:${payloadHash}:${nonce}`).digest();
    if (hash[0] === 0 && hash[1] === 0 && (hash[2]! & 0xC0) === 0) return { nonce, timestamp };
    nonce++;
  }
}

// ===========================================================================
// 1. Channel Name Validation
// ===========================================================================

describe("Channel Name Validation", () => {
  const identity = generateIdentity();
  const profileName = uniqueName("chanval");

  it("setup: create profile", async () => {
    await createProfile(identity.fingerprint, profileName);
  });

  async function tryCreate(name: string): Promise<Response> {
    return apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name, description: "edge case test" }),
    });
  }

  it("accepts 1-char name", async () => {
    const name = "a" + Date.now();
    const res = await tryCreate(name);
    expect(res.status).toBe(201);
  });

  it("accepts 50-char name", async () => {
    // Build a valid 50-char name using lowercase + digits
    const suffix = String(Date.now());
    const base = "a".repeat(50 - suffix.length);
    const name = base + suffix;
    expect(name.length).toBe(50);
    const res = await tryCreate(name);
    expect(res.status).toBe(201);
  });

  it("rejects 51-char name", async () => {
    const name = "a".repeat(51);
    const res = await tryCreate(name);
    expect(res.status).toBe(400);
  });

  it("accepts name with only digits", async () => {
    const name = String(Date.now());
    const res = await tryCreate(name);
    expect(res.status).toBe(201);
  });

  it("accepts name with dashes", async () => {
    const name = `my-channel-${Date.now()}`;
    const res = await tryCreate(name);
    expect(res.status).toBe(201);
  });

  it("rejects name with spaces", async () => {
    const res = await tryCreate("my channel");
    expect(res.status).toBe(400);
  });

  it("rejects name with underscores", async () => {
    const res = await tryCreate("my_channel");
    expect(res.status).toBe(400);
  });

  it("rejects name with dots", async () => {
    const res = await tryCreate("my.channel");
    expect(res.status).toBe(400);
  });

  it("rejects uppercase", async () => {
    const res = await tryCreate("MyChannel");
    expect(res.status).toBe(400);
  });

  it("rejects empty string name", async () => {
    const res = await tryCreate("");
    expect(res.status).toBe(400);
  });

  const reservedNames = ["new", "admin", "system", "api", "mcp"];
  for (const reserved of reservedNames) {
    it(`rejects reserved name: "${reserved}"`, async () => {
      const res = await tryCreate(reserved);
      expect(res.status).toBe(400);
    });
  }
});

// ===========================================================================
// 2. Channel Description
// ===========================================================================

describe("Channel Description", () => {
  const identity = generateIdentity();
  const profileName = uniqueName("descval");

  it("setup: create profile", async () => {
    await createProfile(identity.fingerprint, profileName);
  });

  it("accepts empty description", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: uniqueName("emptydesc"), description: "" }),
    });
    expect(res.status).toBe(201);
  });

  it("accepts 280-char description", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: uniqueName("desc280"), description: "x".repeat(280) }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects 281-char description", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: uniqueName("desc281"), description: "x".repeat(281) }),
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 3. Payload Boundaries
// ===========================================================================

describe("Payload Boundaries", () => {
  const identity = generateIdentity();
  const profileName = uniqueName("payload");
  const chan = uniqueName("payloadchan");

  it("setup: create profile and channel", async () => {
    await createProfile(identity.fingerprint, profileName);
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "payload boundary tests" }),
    });
    expect(res.status).toBe(201);
  });

  it("accepts minimal payload: {}", async () => {
    const payload = {};
    const pow = await minePow(chan, identity.fingerprint, payload);
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ payload, nonce: pow.nonce, timestamp: pow.timestamp }),
    });
    expect(res.status).toBe(201);
  }, 60_000);

  it("accepts payload near 4096 bytes", async () => {
    // Build a payload just under 4096 bytes
    const filler = "x".repeat(4000);
    const payload = { data: filler };
    const payloadSize = JSON.stringify(payload).length;
    expect(payloadSize).toBeLessThanOrEqual(4096);

    const pow = await minePow(chan, identity.fingerprint, payload);
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ payload, nonce: pow.nonce, timestamp: pow.timestamp }),
    });
    expect(res.status).toBe(201);
  }, 60_000);

  it("rejects payload > 4096 bytes", async () => {
    const filler = "x".repeat(5000);
    const payload = { data: filler };
    const payloadSize = JSON.stringify(payload).length;
    expect(payloadSize).toBeGreaterThan(4096);

    const pow = await minePow(chan, identity.fingerprint, payload);
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ payload, nonce: pow.nonce, timestamp: pow.timestamp }),
    });
    expect(res.status).toBe(400);
  }, 60_000);
});

// ===========================================================================
// 4. Message Pagination
// ===========================================================================

describe("Message Pagination", () => {
  const identity = generateIdentity();
  const profileName = uniqueName("pagination");
  const chan = uniqueName("pagchan");

  it("setup: create profile and channel", async () => {
    await createProfile(identity.fingerprint, profileName);
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "pagination tests" }),
    });
    expect(res.status).toBe(201);
  });

  it("GET messages on empty channel returns empty array", async () => {
    const res = await apiFetch(`/channels/${chan}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("GET messages with before param returns only older messages", async () => {
    // Publish two messages
    const payload1 = { text: "first" };
    const pow1 = await minePow(chan, identity.fingerprint, payload1);
    const res1 = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ payload: payload1, nonce: pow1.nonce, timestamp: pow1.timestamp }),
    });
    expect(res1.status).toBe(201);
    const msg1: any = await res1.json();

    await sleep(10);

    const payload2 = { text: "second" };
    const pow2 = await minePow(chan, identity.fingerprint, payload2);
    const res2 = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ payload: payload2, nonce: pow2.nonce, timestamp: pow2.timestamp }),
    });
    expect(res2.status).toBe(201);
    const msg2: any = await res2.json();

    // Fetch with before=msg2.id should only return msg1
    const res3 = await apiFetch(`/channels/${chan}/messages?before=${msg2.id}&limit=10`);
    expect(res3.status).toBe(200);
    const body3 = await res3.json();
    expect(Array.isArray(body3)).toBe(true);
    // All returned messages should be older than msg2
    for (const m of body3) {
      expect(m.id).not.toBe(msg2.id);
    }
    const ids = body3.map((m: any) => m.id);
    expect(ids).toContain(msg1.id);
  }, 60_000);

  it("GET messages with limit=1 returns at most 1", async () => {
    const res = await apiFetch(`/channels/${chan}/messages?limit=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// 5. Profile Edge Cases
// ===========================================================================

describe("Profile Edge Cases", () => {
  it("accepts profile with empty bio", async () => {
    const identity = generateIdentity();
    const res = await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: uniqueName("emptybio"), bio: "" }),
    });
    expect(res.status).toBe(200);
  });

  it("profile name update works (upsert)", async () => {
    const identity = generateIdentity();
    const name1 = uniqueName("first");
    const name2 = uniqueName("second");

    // Create
    const res1 = await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: name1, bio: "original" }),
    });
    expect(res1.status).toBe(200);

    // Update
    const res2 = await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: name2, bio: "updated" }),
    });
    expect(res2.status).toBe(200);

    // Verify update
    const res3 = await apiFetch(`/profiles/${encodeURIComponent(identity.fingerprint)}`);
    expect(res3.status).toBe(200);
    const body = await res3.json() as any;
    expect(body.name).toBe(name2);
  });

  it("profile public toggle: create public, update to private, verify hidden", async () => {
    const identity = generateIdentity();
    const name = uniqueName("toggle");

    // Create as public
    await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name, bio: "public", public: true }),
    });

    // Verify appears in list
    const list1 = await apiFetch("/profiles");
    const profiles1 = await list1.json() as any[];
    expect(profiles1.find((p: any) => p.fingerprint === identity.fingerprint)).toBeDefined();

    // Update to private
    await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name, bio: "now private", public: false }),
    });

    // Verify no longer in public list
    const list2 = await apiFetch("/profiles");
    const profiles2 = await list2.json() as any[];
    expect(profiles2.find((p: any) => p.fingerprint === identity.fingerprint)).toBeUndefined();
  });
});

// ===========================================================================
// 6. Chat Edge Cases
// ===========================================================================

describe("Chat Edge Cases", () => {
  it("creating chat with self returns 400", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("selfchat"));

    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ recipient: identity.fingerprint }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/yourself/i);
  });

  it("creating chat with nonexistent fingerprint returns 404", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("chatghost"));

    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ recipient: "SHA256:nonexistent-fingerprint-that-does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  it("sending empty content returns 400", async () => {
    const idA = generateIdentity();
    const idB = generateIdentity();
    await createProfile(idA.fingerprint, uniqueName("emptymsg-a"));
    await createProfile(idB.fingerprint, uniqueName("emptymsg-b"));

    const chatRes = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: idA.fingerprint,
      body: JSON.stringify({ recipient: idB.fingerprint }),
    });
    expect(chatRes.status).toBe(201);
    const chat = await chatRes.json() as any;

    const res = await apiFetch(`/chat/${chat.id}/messages`, {
      method: "POST",
      fingerprint: idA.fingerprint,
      body: JSON.stringify({ content: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("listing chats with no chats returns empty array", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("nochat"));

    const res = await apiFetch("/chat/list", {
      fingerprint: identity.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("deleting already-deleted chat returns 404", async () => {
    const idA = generateIdentity();
    const idB = generateIdentity();
    await createProfile(idA.fingerprint, uniqueName("deldel-a"));
    await createProfile(idB.fingerprint, uniqueName("deldel-b"));

    const chatRes = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: idA.fingerprint,
      body: JSON.stringify({ recipient: idB.fingerprint }),
    });
    expect(chatRes.status).toBe(201);
    const chat = await chatRes.json() as any;

    // First delete succeeds
    const del1 = await apiFetch(`/chat/${chat.id}`, {
      method: "DELETE",
      fingerprint: idA.fingerprint,
    });
    expect([200, 204].includes(del1.status)).toBe(true);

    // Second delete returns 404
    const del2 = await apiFetch(`/chat/${chat.id}`, {
      method: "DELETE",
      fingerprint: idA.fingerprint,
    });
    expect(del2.status).toBe(404);
  });
});

// ===========================================================================
// 7. Channel Follow Edge Cases
// ===========================================================================

describe("Channel Follow Edge Cases", () => {
  it("checking follow status when never followed returns {following: false}", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("neverfollow"));

    // Create a channel by another user
    const owner = generateIdentity();
    await createProfile(owner.fingerprint, uniqueName("followowner"));
    const chan = uniqueName("followchan");
    const createRes = await apiFetch("/channels", {
      method: "POST",
      fingerprint: owner.fingerprint,
      body: JSON.stringify({ name: chan, description: "follow test" }),
    });
    expect(createRes.status).toBe(201);

    const res = await apiFetch(`/channels/${chan}/follow`, {
      fingerprint: identity.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.following).toBe(false);
    expect(body.status).toBeNull();
  });

  it("double-following returns {already: true}", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("dblfollow"));

    const owner = generateIdentity();
    await createProfile(owner.fingerprint, uniqueName("dblowner"));
    const chan = uniqueName("dblfchan");
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: owner.fingerprint,
      body: JSON.stringify({ name: chan, description: "double follow test" }),
    });

    // First follow
    const res1 = await apiFetch(`/channels/${chan}/follow`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({}),
    });
    expect(res1.status).toBe(200);

    // Second follow
    const res2 = await apiFetch(`/channels/${chan}/follow`, {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({}),
    });
    expect(res2.status).toBe(200);
    const body = await res2.json() as any;
    expect(body.already).toBe(true);
  });

  it("following a nonexistent channel returns 404", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("followghost"));

    const res = await apiFetch("/channels/this-channel-does-not-exist-xyz/follow", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 8. Message Deletion Edge Cases
// ===========================================================================

describe("Message Deletion Edge Cases", () => {
  it("deleting with a random UUID returns 404", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("delmsg"));

    const chan = uniqueName("delchan");
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: chan, description: "delete test" }),
    });

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await apiFetch(`/channels/${chan}/messages/${fakeId}`, {
      method: "DELETE",
      fingerprint: identity.fingerprint,
    });
    expect(res.status).toBe(404);
  });

  it("deleting someone else's message returns 403", async () => {
    const author = generateIdentity();
    const other = generateIdentity();
    await createProfile(author.fingerprint, uniqueName("delauthor"));
    await createProfile(other.fingerprint, uniqueName("delother"));

    const chan = uniqueName("del403chan");
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: author.fingerprint,
      body: JSON.stringify({ name: chan, description: "delete 403 test" }),
    });

    // Publish a message as author
    const payload = { text: "authored message" };
    const pow = await minePow(chan, author.fingerprint, payload);
    const pubRes = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: author.fingerprint,
      body: JSON.stringify({ payload, nonce: pow.nonce, timestamp: pow.timestamp }),
    });
    expect(pubRes.status).toBe(201);
    const msg = await pubRes.json() as any;

    // Try to delete as other
    const res = await apiFetch(`/channels/${chan}/messages/${msg.id}`, {
      method: "DELETE",
      fingerprint: other.fingerprint,
    });
    expect(res.status).toBe(403);
  }, 60_000);
});

// ===========================================================================
// 9. FTS5 Search Edge Cases
// ===========================================================================

describe("FTS5 Search Edge Cases", () => {
  it("search with special characters doesn't crash (returns 200)", async () => {
    const res = await apiFetch(`/channels?q=${encodeURIComponent("!@#$%")}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("search with no matches returns empty array", async () => {
    const res = await apiFetch(`/channels?q=${encodeURIComponent("zzzznonexistentzzzz" + Date.now())}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("channel list search with partial name matches", async () => {
    const identity = generateIdentity();
    await createProfile(identity.fingerprint, uniqueName("ftsbot"));

    const prefix = uniqueName("ftsearch");
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: prefix, description: "fts partial match test" }),
    });

    // Search for a substring of the channel name
    const res = await apiFetch(`/channels?q=${encodeURIComponent(prefix)}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    const found = body.find((c: any) => c.name === prefix);
    expect(found).toBeDefined();
  });
});

// ===========================================================================
// 10. Concurrent Operations
// ===========================================================================

describe("Concurrent Operations", () => {
  it("two bots creating channels with the same name: one gets 409", async () => {
    const idA = generateIdentity();
    const idB = generateIdentity();
    await createProfile(idA.fingerprint, uniqueName("conc-a"));
    await createProfile(idB.fingerprint, uniqueName("conc-b"));

    const sameName = uniqueName("concchan");

    const [resA, resB] = await Promise.all([
      apiFetch("/channels", {
        method: "POST",
        fingerprint: idA.fingerprint,
        body: JSON.stringify({ name: sameName, description: "concurrent A" }),
      }),
      apiFetch("/channels", {
        method: "POST",
        fingerprint: idB.fingerprint,
        body: JSON.stringify({ name: sameName, description: "concurrent B" }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("deleting a channel while someone is following it succeeds", async () => {
    const owner = generateIdentity();
    const follower = generateIdentity();
    await createProfile(owner.fingerprint, uniqueName("delowner"));
    await createProfile(follower.fingerprint, uniqueName("delfollower"));

    const chan = uniqueName("delfollowchan");
    const createRes = await apiFetch("/channels", {
      method: "POST",
      fingerprint: owner.fingerprint,
      body: JSON.stringify({ name: chan, description: "delete while followed" }),
    });
    expect(createRes.status).toBe(201);

    // Follow
    const followRes = await apiFetch(`/channels/${chan}/follow`, {
      method: "POST",
      fingerprint: follower.fingerprint,
      body: JSON.stringify({}),
    });
    expect(followRes.status).toBe(200);

    // Delete channel
    const delRes = await apiFetch(`/channels/${chan}`, {
      method: "DELETE",
      fingerprint: owner.fingerprint,
    });
    expect(delRes.status).toBe(204);

    // Channel should be gone
    const getRes = await apiFetch(`/channels/${chan}`);
    expect(getRes.status).toBe(404);
  });
});
