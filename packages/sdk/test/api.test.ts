/**
 * Comprehensive API integration tests for the bottel.ai backend.
 *
 * Tests raw HTTP endpoints directly via fetch() — no SDK layer.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *     (e.g. `wrangler dev` in the worker package).
 *
 * Run:
 *   npx vitest run test/api.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, createProfile, generateIdentity, uniqueName, sleep, API_URL } from "./helpers.js";

const { subtle } = globalThis.crypto ?? (await import("node:crypto")).webcrypto;

// ---------------------------------------------------------------------------
// POW helpers (inline miner for raw API tests)
// ---------------------------------------------------------------------------

async function hashPayload(payload: any): Promise<string> {
  const json = JSON.stringify(payload);
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(json));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function minePow(
  channel: string,
  author: string,
  payload: any,
): Promise<{ nonce: number; timestamp: number }> {
  const payloadHash = await hashPayload(payload);
  const timestamp = Date.now();
  let nonce = 0;
  while (true) {
    const challenge = `${channel}:${author}:${timestamp}:${payloadHash}:${nonce}`;
    const buf = await subtle.digest("SHA-256", new TextEncoder().encode(challenge));
    const arr = new Uint8Array(buf);
    // 18 leading zero bits
    if (arr[0] === 0 && arr[1] === 0 && (arr[2] & 0xc0) === 0) {
      return { nonce, timestamp };
    }
    nonce++;
  }
}

// ===========================================================================
// 1. Health & Stats
// ===========================================================================

describe("Health & Stats", () => {
  it("GET / — returns service info", async () => {
    const res = await apiFetch("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("surfaces");
  });

  it("GET /stats — returns aggregate stats", async () => {
    const res = await apiFetch("/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("channels");
    expect(body).toHaveProperty("users");
    expect(body).toHaveProperty("messages");
    expect(typeof body.channels).toBe("number");
    expect(typeof body.users).toBe("number");
    expect(typeof body.messages).toBe("number");
  });
});

// ===========================================================================
// 2. Profiles
// ===========================================================================

describe("Profiles", () => {
  const identity = generateIdentity();
  const profileName = uniqueName("profbot");

  it("POST /profiles — 401 without auth", async () => {
    const res = await apiFetch("/profiles", {
      method: "POST",
      body: JSON.stringify({ name: "nobody" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /profiles — 400 without name", async () => {
    const res = await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /profiles — create profile", async () => {
    const res = await apiFetch("/profiles", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: profileName, bio: "test bot bio", public: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(profileName);
  });

  it("GET /profiles — list public profiles", async () => {
    const res = await apiFetch("/profiles");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((p: any) => p.fingerprint === identity.fingerprint);
    expect(found).toBeDefined();
    expect(found.name).toBe(profileName);
  });

  it("GET /profiles?q=term — search by name/bio", async () => {
    const res = await apiFetch(`/profiles?q=${encodeURIComponent(profileName)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((p: any) => p.fingerprint === identity.fingerprint);
    expect(found).toBeDefined();
  });

  it("GET /profiles — does NOT return private profiles", async () => {
    const pvt = generateIdentity();
    const pvtName = uniqueName("private-bot");
    await createProfile(pvt.fingerprint, pvtName, { isPublic: false });

    const res = await apiFetch("/profiles");
    const body = await res.json();
    const found = body.find((p: any) => p.fingerprint === pvt.fingerprint);
    expect(found).toBeUndefined();
  });

  it("GET /profiles/:fp — single profile with online status", async () => {
    const res = await apiFetch(`/profiles/${encodeURIComponent(identity.fingerprint)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fingerprint).toBe(identity.fingerprint);
    expect(body.name).toBe(profileName);
    expect(body).toHaveProperty("online");
  });

  it("GET /profiles/:fp — 404 for nonexistent", async () => {
    const res = await apiFetch("/profiles/SHA256:nonexistent-fp-that-doesnt-exist");
    expect(res.status).toBe(404);
  });

  it("POST /profiles/ping — update online_at (needs auth)", async () => {
    const res = await apiFetch("/profiles/ping", {
      method: "POST",
      fingerprint: identity.fingerprint,
    });
    expect(res.status).toBe(200);
  });

  it("POST /profiles/ping — 401 without auth", async () => {
    const res = await apiFetch("/profiles/ping", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 3. Channels CRUD
// ===========================================================================

describe("Channels CRUD", () => {
  const creator = generateIdentity();
  const creatorName = uniqueName("chanbot");
  const other = generateIdentity();
  const otherName = uniqueName("otherbot");
  const channelName = uniqueName("testchan");

  beforeAll(async () => {
    await createProfile(creator.fingerprint, creatorName);
    await createProfile(other.fingerprint, otherName);
  });

  it("POST /channels — 401 without auth", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      body: JSON.stringify({ name: uniqueName("noauth"), description: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /channels — 403 without profile", async () => {
    const noProfile = generateIdentity();
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: noProfile.fingerprint,
      body: JSON.stringify({ name: uniqueName("noprof"), description: "nope" }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /channels — create public channel (201)", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: channelName, description: "a test channel" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe(channelName);
  });

  it("POST /channels — create private channel, returns key", async () => {
    const pvtName = uniqueName("pvtchan");
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: pvtName, description: "private", isPublic: false }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe(pvtName);
    expect(body).toHaveProperty("key");
    expect(typeof body.key).toBe("string");
  });

  it("POST /channels — 400 for invalid name (uppercase)", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: "UpperCase", description: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /channels — 400 for invalid name (special chars)", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: "no spaces!", description: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /channels — 400 for invalid name (empty)", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: "", description: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /channels — 400 for invalid name (>50 chars)", async () => {
    const longName = "a".repeat(51);
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: longName, description: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /channels — 400 for reserved names", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: "general", description: "reserved" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /channels — 400 for description >280 chars", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: uniqueName("longdesc"), description: "x".repeat(281) }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /channels — 409 for duplicate name", async () => {
    const res = await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: channelName, description: "duplicate" }),
    });
    expect(res.status).toBe(409);
  });

  it("GET /channels — list channels", async () => {
    const res = await apiFetch("/channels");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("GET /channels?sort=messages — sort by message count", async () => {
    const res = await apiFetch("/channels?sort=messages");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /channels?sort=recent — sort by created_at", async () => {
    const res = await apiFetch("/channels?sort=recent");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /channels?q=term — FTS5 search", async () => {
    const res = await apiFetch(`/channels?q=${encodeURIComponent(channelName)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((c: any) => c.name === channelName);
    expect(found).toBeDefined();
  });

  it("GET /channels/:name — channel + messages", async () => {
    const res = await apiFetch(`/channels/${channelName}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("channel");
    expect(body).toHaveProperty("messages");
    expect(body.channel.name).toBe(channelName);
  });

  it("GET /channels/:name — 404 for nonexistent", async () => {
    const res = await apiFetch("/channels/this-channel-does-not-exist-xyz");
    expect(res.status).toBe(404);
  });

  it("DELETE /channels/:name — 401 without auth", async () => {
    const res = await apiFetch(`/channels/${channelName}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("DELETE /channels/:name — 403 for non-creator", async () => {
    const res = await apiFetch(`/channels/${channelName}`, {
      method: "DELETE",
      fingerprint: other.fingerprint,
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /channels/:name — 404 for nonexistent", async () => {
    const res = await apiFetch("/channels/nonexistent-del-xyz", {
      method: "DELETE",
      fingerprint: creator.fingerprint,
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /channels/:name — delete (creator only, 204)", async () => {
    const toDelete = uniqueName("delchan");
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: toDelete, description: "to delete" }),
    });

    const res = await apiFetch(`/channels/${toDelete}`, {
      method: "DELETE",
      fingerprint: creator.fingerprint,
    });
    expect(res.status).toBe(204);
  });
});

// ===========================================================================
// 4. Channel Messages
// ===========================================================================

describe("Channel Messages", () => {
  const author = generateIdentity();
  const authorName = uniqueName("msgbot");
  const other = generateIdentity();
  const otherName = uniqueName("otherbot");
  const chan = uniqueName("msgchan");

  beforeAll(async () => {
    await createProfile(author.fingerprint, authorName);
    await createProfile(other.fingerprint, otherName);
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: author.fingerprint,
      body: JSON.stringify({ name: chan, description: "message tests" }),
    });
  });

  it("POST /channels/:name/messages — 401 without auth", async () => {
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      body: JSON.stringify({ payload: { text: "hi" } }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /channels/:name/messages — 403 without profile", async () => {
    const noProf = generateIdentity();
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: noProf.fingerprint,
      body: JSON.stringify({ payload: { text: "hi" } }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /channels/:name/messages — 400 without pow field", async () => {
    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: author.fingerprint,
      body: JSON.stringify({ payload: { text: "no pow" } }),
    });
    expect(res.status).toBe(400);
  });

  let firstMsgId: string;

  it("POST /channels/:name/messages — publish with valid POW (201)", async () => {
    const payload = { text: "hello world" };
    const pow = await minePow(chan, author.fingerprint, payload);

    const res = await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: author.fingerprint,
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
    firstMsgId = body.id;
  });

  it("GET /channels/:name/messages — returns messages", async () => {
    const res = await apiFetch(`/channels/${chan}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /channels/:name/messages?before=&limit= — pagination", async () => {
    // Publish a second message so there are at least 2
    const payload2 = { text: "second message" };
    const pow2 = await minePow(chan, author.fingerprint, payload2);
    await apiFetch(`/channels/${chan}/messages`, {
      method: "POST",
      fingerprint: author.fingerprint,
      body: JSON.stringify({ payload: payload2, nonce: pow2.nonce, timestamp: pow2.timestamp }),
    });

    const res = await apiFetch(`/channels/${chan}/messages?limit=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);

    // Paginate before the first result
    const beforeId = body[0].id;
    const res2 = await apiFetch(`/channels/${chan}/messages?before=${beforeId}&limit=10`);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(Array.isArray(body2)).toBe(true);
  });

  it("DELETE /channels/:name/messages/:id — 403 for non-author", async () => {
    const res = await apiFetch(`/channels/${chan}/messages/${firstMsgId}`, {
      method: "DELETE",
      fingerprint: other.fingerprint,
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /channels/:name/messages/:id — 404 for nonexistent", async () => {
    const res = await apiFetch(`/channels/${chan}/messages/99999999`, {
      method: "DELETE",
      fingerprint: author.fingerprint,
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /channels/:name/messages/:id — delete own message (204)", async () => {
    const res = await apiFetch(`/channels/${chan}/messages/${firstMsgId}`, {
      method: "DELETE",
      fingerprint: author.fingerprint,
    });
    expect(res.status).toBe(204);
  });

  it("POST /channels/:name/search?q=term — FTS5 search messages", async () => {
    const res = await apiFetch(`/channels/${chan}/search?q=second`, {
      method: "POST",
      fingerprint: author.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /channels/:name/search — 400 without q", async () => {
    const res = await apiFetch(`/channels/${chan}/search`, {
      method: "POST",
      fingerprint: author.fingerprint,
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 5. Channel Follows
// ===========================================================================

describe("Channel Follows", () => {
  const creator = generateIdentity();
  const creatorName = uniqueName("followcreator");
  const follower = generateIdentity();
  const followerName = uniqueName("followerbot");
  const other = generateIdentity();
  const otherName = uniqueName("otherfollower");
  const pubChan = uniqueName("pubfollow");
  const pvtChan = uniqueName("pvtfollow");

  beforeAll(async () => {
    await createProfile(creator.fingerprint, creatorName);
    await createProfile(follower.fingerprint, followerName);
    await createProfile(other.fingerprint, otherName);

    await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: pubChan, description: "public follow test" }),
    });
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: pvtChan, description: "private follow test", isPublic: false }),
    });
  });

  it("POST /channels/:name/follow — follow public channel (active)", async () => {
    const res = await apiFetch(`/channels/${pubChan}/follow`, {
      method: "POST",
      fingerprint: follower.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  it("POST /channels/:name/follow — follow private channel (pending)", async () => {
    const res = await apiFetch(`/channels/${pvtChan}/follow`, {
      method: "POST",
      fingerprint: follower.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  it("POST /channels/:name/follow — duplicate returns already:true", async () => {
    const res = await apiFetch(`/channels/${pubChan}/follow`, {
      method: "POST",
      fingerprint: follower.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already).toBe(true);
  });

  it("POST /channels/:name/follow — 404 for nonexistent channel", async () => {
    const res = await apiFetch("/channels/nonexistent-follow-xyz/follow", {
      method: "POST",
      fingerprint: follower.fingerprint,
    });
    expect(res.status).toBe(404);
  });

  it("GET /channels/:name/follow — check follow status", async () => {
    const res = await apiFetch(`/channels/${pubChan}/follow`, {
      fingerprint: follower.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
  });

  it("GET /channels/:name/followers — list followers", async () => {
    const res = await apiFetch(`/channels/${pubChan}/followers`, {
      fingerprint: creator.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /channels/:name/followers?status=pending — filter", async () => {
    const res = await apiFetch(`/channels/${pvtChan}/followers?status=pending`, {
      fingerprint: creator.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const pending = body.find((f: any) => f.fingerprint === follower.fingerprint);
    expect(pending).toBeDefined();
  });

  it("POST /channels/:name/follow/:fp/approve — 403 for non-creator", async () => {
    const res = await apiFetch(
      `/channels/${pvtChan}/follow/${encodeURIComponent(follower.fingerprint)}/approve`,
      {
        method: "POST",
        fingerprint: other.fingerprint,
      },
    );
    expect(res.status).toBe(403);
  });

  it("POST /channels/:name/follow/:fp/approve — approve pending", async () => {
    const res = await apiFetch(
      `/channels/${pvtChan}/follow/${encodeURIComponent(follower.fingerprint)}/approve`,
      {
        method: "POST",
        fingerprint: creator.fingerprint,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  it("POST /channels/:name/follow/:fp/approve — 404 no pending request", async () => {
    const nobody = generateIdentity();
    const res = await apiFetch(
      `/channels/${pvtChan}/follow/${encodeURIComponent(nobody.fingerprint)}/approve`,
      {
        method: "POST",
        fingerprint: creator.fingerprint,
      },
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /channels/:name/follow — unfollow (204)", async () => {
    const res = await apiFetch(`/channels/${pubChan}/follow`, {
      method: "DELETE",
      fingerprint: follower.fingerprint,
    });
    expect(res.status).toBe(204);
  });
});

// ===========================================================================
// 6. Channel Encryption Key
// ===========================================================================

describe("Channel Encryption Key", () => {
  const creator = generateIdentity();
  const creatorName = uniqueName("keybot");
  const member = generateIdentity();
  const memberName = uniqueName("membot");
  const nonMember = generateIdentity();
  const nonMemberName = uniqueName("nobot");
  const pvtChan = uniqueName("keychan");

  beforeAll(async () => {
    await createProfile(creator.fingerprint, creatorName);
    await createProfile(member.fingerprint, memberName);
    await createProfile(nonMember.fingerprint, nonMemberName);

    // Create private channel
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: creator.fingerprint,
      body: JSON.stringify({ name: pvtChan, description: "key test", isPublic: false }),
    });

    // Member follows and gets approved
    await apiFetch(`/channels/${pvtChan}/follow`, {
      method: "POST",
      fingerprint: member.fingerprint,
    });
    await apiFetch(
      `/channels/${pvtChan}/follow/${encodeURIComponent(member.fingerprint)}/approve`,
      {
        method: "POST",
        fingerprint: creator.fingerprint,
      },
    );
  });

  it("GET /channels/:name/key — returns key for active members", async () => {
    const res = await apiFetch(`/channels/${pvtChan}/key`, {
      fingerprint: member.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("key");
    expect(typeof body.key).toBe("string");
  });

  it("GET /channels/:name/key — 403 for non-members", async () => {
    const res = await apiFetch(`/channels/${pvtChan}/key`, {
      fingerprint: nonMember.fingerprint,
    });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 7. Direct Chats
// ===========================================================================

describe("Direct Chats", () => {
  const userA = generateIdentity();
  const userAName = uniqueName("chatbota");
  const userB = generateIdentity();
  const userBName = uniqueName("chatbotb");
  let chatId: string;

  beforeAll(async () => {
    await createProfile(userA.fingerprint, userAName);
    await createProfile(userB.fingerprint, userBName);
  });

  it("POST /chat/new — 401 without auth", async () => {
    const res = await apiFetch("/chat/new", {
      method: "POST",
      body: JSON.stringify({ participant: userB.fingerprint }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /chat/new — 400 without participant", async () => {
    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /chat/new — 404 for nonexistent participant", async () => {
    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({ participant: "SHA256:doesnotexist" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /chat/new — 400 for self-chat", async () => {
    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({ participant: userA.fingerprint }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /chat/new — create chat (201)", async () => {
    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({ participant: userB.fingerprint }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    chatId = body.id;
  });

  it("POST /chat/new — returns existing chat if already exists", async () => {
    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({ participant: userB.fingerprint }),
    });
    // Should return the same chat, not create a new one
    const body = await res.json();
    expect(body.id).toBe(chatId);
  });

  it("POST /chat/new — finds participant by name", async () => {
    const userC = generateIdentity();
    const userCName = uniqueName("chatbotc");
    await createProfile(userC.fingerprint, userCName);

    const res = await apiFetch("/chat/new", {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({ participant: userCName }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
  });

  it("GET /chat/list — 401 without auth", async () => {
    const res = await apiFetch("/chat/list");
    expect(res.status).toBe(401);
  });

  it("GET /chat/list — list chats", async () => {
    const res = await apiFetch("/chat/list", {
      fingerprint: userA.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    const found = body.find((c: any) => c.id === chatId);
    expect(found).toBeDefined();
  });

  it("POST /chat/:id/messages — 400 without content", async () => {
    const res = await apiFetch(`/chat/${chatId}/messages`, {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /chat/:id/messages — send DM (201)", async () => {
    const res = await apiFetch(`/chat/${chatId}/messages`, {
      method: "POST",
      fingerprint: userA.fingerprint,
      body: JSON.stringify({ content: "hello from A" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.content).toBe("hello from A");
    expect(body.sender).toBe(userA.fingerprint);
  });

  it("GET /chat/:id/messages — paginated messages", async () => {
    // Send a second message for pagination
    await apiFetch(`/chat/${chatId}/messages`, {
      method: "POST",
      fingerprint: userB.fingerprint,
      body: JSON.stringify({ content: "reply from B" }),
    });

    const res = await apiFetch(`/chat/${chatId}/messages?limit=1`, {
      fingerprint: userA.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
  });

  it("GET /chat/search?q=term — search bots", async () => {
    const res = await apiFetch(`/chat/search?q=${encodeURIComponent(userBName)}`, {
      fingerprint: userA.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((b: any) => b.fingerprint === userB.fingerprint);
    expect(found).toBeDefined();
  });

  it("GET /chat/search?q=term — excludes self", async () => {
    const res = await apiFetch(`/chat/search?q=${encodeURIComponent(userAName)}`, {
      fingerprint: userA.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const found = body.find((b: any) => b.fingerprint === userA.fingerprint);
    expect(found).toBeUndefined();
  });

  it("GET /chat/search?q=x — empty for <2 chars", async () => {
    const res = await apiFetch("/chat/search?q=x", {
      fingerprint: userA.fingerprint,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("GET /chat/search — 401 without auth", async () => {
    const res = await apiFetch("/chat/search?q=test");
    expect(res.status).toBe(401);
  });

  it("DELETE /chat/:id — 403 for non-creator", async () => {
    const res = await apiFetch(`/chat/${chatId}`, {
      method: "DELETE",
      fingerprint: userB.fingerprint,
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /chat/:id — delete chat (creator, 204)", async () => {
    const res = await apiFetch(`/chat/${chatId}`, {
      method: "DELETE",
      fingerprint: userA.fingerprint,
    });
    expect(res.status).toBe(204);
  });
});

// ===========================================================================
// 8. MCP Endpoint
// ===========================================================================

describe("MCP Endpoint", () => {
  const identity = generateIdentity();
  const mcpName = uniqueName("mcpbot");
  const mcpChan = uniqueName("mcpchan");

  beforeAll(async () => {
    await createProfile(identity.fingerprint, mcpName);
    await apiFetch("/channels", {
      method: "POST",
      fingerprint: identity.fingerprint,
      body: JSON.stringify({ name: mcpChan, description: "mcp test channel" }),
    });
  });

  it("POST /mcp/channels — initialize method", async () => {
    const res = await apiFetch("/mcp/channels", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result).toBeDefined();
    expect(body.result).toHaveProperty("protocolVersion");
    expect(body.result).toHaveProperty("serverInfo");
  });

  it("POST /mcp/channels — tools/list", async () => {
    const res = await apiFetch("/mcp/channels", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toHaveProperty("tools");
    expect(Array.isArray(body.result.tools)).toBe(true);
    expect(body.result.tools.length).toBeGreaterThan(0);
  });

  it("POST /mcp/channels — tools/call channels/list", async () => {
    const res = await apiFetch("/mcp/channels", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "channels/list",
          arguments: {},
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result).toHaveProperty("content");
  });

  it("POST /mcp/channels — tools/call channels/get", async () => {
    const res = await apiFetch("/mcp/channels", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "channels/get",
          arguments: { name: mcpChan },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result).toHaveProperty("content");
  });

  it("POST /mcp/channels — unknown method returns -32601", async () => {
    const res = await apiFetch("/mcp/channels", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "nonexistent/method",
        params: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32601);
  });
});
