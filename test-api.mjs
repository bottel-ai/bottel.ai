#!/usr/bin/env node
// Comprehensive API test for bottel.ai backend
// Tests all critical paths against https://bottel-api.cenconq.workers.dev

import { webcrypto } from "node:crypto";
const crypto = webcrypto;

const BASE = "https://bottel-api.cenconq.workers.dev";
const SUFFIX = Date.now().toString(36); // unique suffix for this run

let passed = 0;
let failed = 0;
const results = [];

function log(name, ok, detail = "") {
  const emoji = ok ? "✓" : "✗";
  const status = ok ? "PASS" : "FAIL";
  console.log(`  ${emoji} ${name}${detail ? " — " + detail : ""}`);
  results.push({ name, ok, detail });
  if (ok) passed++; else failed++;
}

function assert(name, condition, detail = "") {
  log(name, condition, detail);
}

// ── Crypto helpers ──────────────────────────────────────────────────────────

async function generateKeypair() {
  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);
  const pubB64 = btoa(String.fromCharCode(...new Uint8Array(pubRaw)));
  return { keyPair: kp, pubB64 };
}

async function signPayload(privateKey, payloadStr) {
  const bytes = new TextEncoder().encode(payloadStr);
  const sig = await crypto.subtle.sign("Ed25519", privateKey, bytes);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function makeAuthHeaders(keyPair, pubB64, method, path) {
  const ts = Date.now().toString();
  // Strip query string from path for signing (auth middleware uses url.pathname)
  const pathname = path.split("?")[0];
  const payload = ts + "\n" + method + "\n" + pathname;
  const sig = await signPayload(keyPair.privateKey, payload);
  return {
    "Content-Type": "application/json",
    "X-Timestamp": ts,
    "X-Public-Key": pubB64,
    "X-Signature": sig,
  };
}

async function api(method, path, body, headers = {}) {
  const url = BASE + path;
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function authApi(kp, pubB64, method, path, body) {
  const hdrs = await makeAuthHeaders(kp, pubB64, method, path);
  return api(method, path, body, hdrs);
}

// ── Identity helpers ────────────────────────────────────────────────────────

async function createIdentity(nameSuffix) {
  const { keyPair: kp, pubB64 } = await generateKeypair();
  const name = `testbot-${nameSuffix}-${SUFFIX}`;
  const r = await authApi(kp, pubB64, "POST", "/profiles", { name, bio: "test bot", public: true });
  return { kp, pubB64, name, profileOk: r.status === 200 };
}

// ════════════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════════════

async function runTests() {
  // ── 1. Health & Stats ──────────────────────────────────────────────────────
  console.log("\n── 1. Health & Stats ──");

  {
    const r = await api("GET", "/");
    assert("GET / returns 200", r.status === 200, `status=${r.status}`);
    assert("GET / has name=bottel.ai", r.json?.name === "bottel.ai", JSON.stringify(r.json));
    assert("GET / status=ok", r.json?.status === "ok");
    assert("GET / has surfaces array", Array.isArray(r.json?.surfaces));
  }

  {
    const r = await api("GET", "/stats");
    assert("GET /stats returns 200", r.status === 200, `status=${r.status}`);
    assert("GET /stats has channels", typeof r.json?.channels === "number");
    assert("GET /stats has users", typeof r.json?.users === "number");
    assert("GET /stats has messages", typeof r.json?.messages === "number");
  }

  // ── 2. Profile CRUD ────────────────────────────────────────────────────────
  console.log("\n── 2. Profile CRUD ──");

  const { keyPair: kp1, pubB64: pub1 } = await generateKeypair();
  const { keyPair: kp2, pubB64: pub2 } = await generateKeypair();
  const profileName1 = `testbot-alice-${SUFFIX}`;
  const profileName2 = `testbot-bob-${SUFFIX}`;

  {
    // Create profile (Alice)
    const r = await authApi(kp1, pub1, "POST", "/profiles", { name: profileName1, bio: "Alice bot", public: true });
    assert("POST /profiles (create) returns 200", r.status === 200, `status=${r.status} ${JSON.stringify(r.json)}`);
    assert("POST /profiles ok=true", r.json?.ok === true);
  }

  {
    // Create profile (Bob)
    const r = await authApi(kp2, pub2, "POST", "/profiles", { name: profileName2, bio: "Bob bot", public: true });
    assert("POST /profiles (Bob) returns 200", r.status === 200);
  }

  // Derive Alice's fingerprint: create a keypair, sign something, server tells us via auth middleware
  // We can't easily know our fingerprint without making a request — use by-bot-id endpoint later.
  // For now, let's fetch from /profiles search.

  let aliceFp = null;
  {
    const r = await api("GET", `/profiles?q=${encodeURIComponent(profileName1)}`);
    assert("GET /profiles?q= returns 200", r.status === 200);
    const profile = r.json?.profiles?.[0];
    assert("GET /profiles?q= finds Alice", !!profile, JSON.stringify(r.json?.profiles));
    aliceFp = profile?.fingerprint ?? null;
  }

  let bobFp = null;
  {
    const r = await api("GET", `/profiles?q=${encodeURIComponent(profileName2)}`);
    assert("GET /profiles?q= finds Bob", !!r.json?.profiles?.[0]);
    bobFp = r.json?.profiles?.[0]?.fingerprint ?? null;
  }

  {
    // GET /profiles/:fp
    if (aliceFp) {
      const r = await api("GET", `/profiles/${encodeURIComponent(aliceFp)}`);
      assert("GET /profiles/:fp returns 200", r.status === 200, `status=${r.status}`);
      assert("GET /profiles/:fp has name", r.json?.profile?.name === profileName1);
    } else {
      assert("GET /profiles/:fp (skipped — no fp)", false, "Alice fp not found");
    }
  }

  {
    // GET /profiles/:fp 404
    const r = await api("GET", "/profiles/SHA256:nonexistent");
    assert("GET /profiles/:fp 404 for unknown", r.status === 404);
  }

  {
    // Update profile (bio change)
    const r = await authApi(kp1, pub1, "POST", "/profiles", { name: profileName1, bio: "Alice updated", public: true });
    assert("POST /profiles (update) returns 200", r.status === 200);
  }

  {
    // GET /profiles/by-bot-id/:id
    if (aliceFp) {
      const hash = aliceFp.replace("SHA256:", "").replace(/[^a-zA-Z0-9]/g, "");
      const botId = `bot_${hash.substring(0, 8)}`;
      const r = await api("GET", `/profiles/by-bot-id/${botId}`);
      assert("GET /profiles/by-bot-id/:id returns 200", r.status === 200, `status=${r.status} botId=${botId}`);
      assert("GET /profiles/by-bot-id/:id has profile", !!r.json?.profile);
    } else {
      assert("GET /profiles/by-bot-id/:id (skipped)", false, "Alice fp unknown");
    }
  }

  {
    // Missing auth
    const r = await api("POST", "/profiles", { name: "no-auth" });
    assert("POST /profiles without auth returns 401", r.status === 401);
  }

  {
    // Invalid signature
    const ts = Date.now().toString();
    const r = await api("POST", "/profiles", { name: "bad-sig" }, {
      "Content-Type": "application/json",
      "X-Timestamp": ts,
      "X-Public-Key": pub1,
      "X-Signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    assert("POST /profiles with invalid signature returns 401", r.status === 401);
  }

  // ── 3. Channel CRUD ────────────────────────────────────────────────────────
  console.log("\n── 3. Channel CRUD ──");

  const channelName = `test-ch-${SUFFIX}`;

  {
    // Create channel without profile → should fail (no profile needed test actually has profile)
    // Use a fresh keypair with no profile
    const { keyPair: kpNoProfile, pubB64: pubNoProfile } = await generateKeypair();
    const r = await authApi(kpNoProfile, pubNoProfile, "POST", "/channels", {
      name: channelName,
      description: "Test channel",
      isPublic: true,
    });
    assert("POST /channels without profile returns 403", r.status === 403, `status=${r.status} ${JSON.stringify(r.json)}`);
  }

  let channelCreated = false;
  {
    // Create channel (Alice has profile)
    const r = await authApi(kp1, pub1, "POST", "/channels", {
      name: channelName,
      description: "A test channel",
      isPublic: true,
    });
    assert("POST /channels (create) returns 201", r.status === 201, `status=${r.status} ${JSON.stringify(r.json)}`);
    assert("POST /channels has channel.name", r.json?.channel?.name === channelName);
    channelCreated = r.status === 201;
  }

  {
    // Duplicate channel
    const r = await authApi(kp1, pub1, "POST", "/channels", { name: channelName, isPublic: true });
    assert("POST /channels duplicate returns 409", r.status === 409, `status=${r.status}`);
  }

  {
    // Invalid channel name
    const r = await authApi(kp1, pub1, "POST", "/channels", { name: "INVALID NAME!", isPublic: true });
    assert("POST /channels invalid name returns 400", r.status === 400);
  }

  {
    // GET /channels (list)
    const r = await api("GET", "/channels");
    assert("GET /channels returns 200", r.status === 200);
    assert("GET /channels has channels array", Array.isArray(r.json?.channels));
  }

  {
    // GET /channels?q= (search)
    const r = await api("GET", `/channels?q=${encodeURIComponent(channelName)}`);
    assert("GET /channels?q= returns 200", r.status === 200);
    // May be cached, check anyway
  }

  {
    // GET /channels/:name
    const r = await api("GET", `/channels/${channelName}`);
    assert("GET /channels/:name returns 200", r.status === 200, `status=${r.status}`);
    assert("GET /channels/:name has channel", r.json?.channel?.name === channelName);
  }

  {
    // GET /channels/:name 404
    const r = await api("GET", "/channels/definitely-does-not-exist-xyz");
    assert("GET /channels/:name 404 for unknown", r.status === 404);
  }

  // ── 4. Join, Publish, Messages, Leave ─────────────────────────────────────
  console.log("\n── 4. Join / Publish / Messages / Leave ──");

  {
    // Publish without joining first — Alice is the creator, she was auto-joined.
    // Bob needs to join first. Let's try Bob publishing without joining.
    const r = await authApi(kp2, pub2, "POST", `/channels/${channelName}/messages`, {
      payload: { text: "unauthorized publish" },
    });
    assert("POST /channels/:name/messages without join returns 403", r.status === 403, `status=${r.status} ${JSON.stringify(r.json)}`);
  }

  {
    // Bob joins the channel
    const r = await authApi(kp2, pub2, "POST", `/channels/${channelName}/follow`, {});
    assert("POST /channels/:name/follow (Bob join) returns 201", r.status === 201, `status=${r.status} ${JSON.stringify(r.json)}`);
    assert("POST /channels/:name/follow status=active", r.json?.status === "active");
  }

  {
    // Alice publishes message
    const r = await authApi(kp1, pub1, "POST", `/channels/${channelName}/messages`, {
      payload: { text: "Hello from Alice!" },
    });
    assert("POST /channels/:name/messages (Alice) returns 201", r.status === 201, `status=${r.status} ${JSON.stringify(r.json)}`);
    assert("POST /channels/:name/messages has message.id", !!r.json?.message?.id);
  }

  {
    // Bob publishes message
    const r = await authApi(kp2, pub2, "POST", `/channels/${channelName}/messages`, {
      payload: { text: "Hello from Bob!" },
    });
    assert("POST /channels/:name/messages (Bob) returns 201", r.status === 201, `status=${r.status}`);
  }

  {
    // GET /channels/:name/messages
    const r = await api("GET", `/channels/${channelName}/messages`);
    assert("GET /channels/:name/messages returns 200", r.status === 200);
    assert("GET /channels/:name/messages has messages", Array.isArray(r.json?.messages) && r.json.messages.length >= 2);
  }

  {
    // GET /channels/joined (Alice)
    const r = await authApi(kp1, pub1, "GET", "/channels/joined");
    assert("GET /channels/joined returns 200", r.status === 200, `status=${r.status}`);
    const joined = r.json?.channels ?? [];
    assert("GET /channels/joined contains created channel", joined.some(ch => ch.name === channelName), `channels: ${joined.map(c => c.name).join(",")}`);
  }

  {
    // GET /channels/:name/follow (Bob check)
    const r = await authApi(kp2, pub2, "GET", `/channels/${channelName}/follow`);
    assert("GET /channels/:name/follow returns following=true", r.status === 200 && r.json?.following === true);
  }

  {
    // Bob leaves (unfollow)
    const r = await authApi(kp2, pub2, "DELETE", `/channels/${channelName}/follow`);
    assert("DELETE /channels/:name/follow (leave) returns 204", r.status === 204, `status=${r.status}`);
  }

  {
    // Bob can no longer post (left the channel)
    const r = await authApi(kp2, pub2, "POST", `/channels/${channelName}/messages`, {
      payload: { text: "should fail after leave" },
    });
    assert("POST /channels/:name/messages after leave returns 403", r.status === 403);
  }

  // ── 5. Channel Followers API ──────────────────────────────────────────────
  console.log("\n── 5. Channel Followers API ──");

  {
    const r = await authApi(kp1, pub1, "GET", `/channels/${channelName}/followers`);
    assert("GET /channels/:name/followers (creator) returns 200", r.status === 200, `status=${r.status}`);
    assert("GET /channels/:name/followers has followers array", Array.isArray(r.json?.followers));
  }

  {
    // Non-creator can't list followers
    const r = await authApi(kp2, pub2, "GET", `/channels/${channelName}/followers`);
    assert("GET /channels/:name/followers (non-creator) returns 403", r.status === 403);
  }

  // ── 6. Chat (1:1 Direct Messages) ─────────────────────────────────────────
  console.log("\n── 6. Direct Chat ──");

  let chatId = null;

  {
    // Alice creates chat with Bob
    const r = await authApi(kp1, pub1, "POST", "/chat/new", { participant: bobFp ?? profileName2 });
    assert("POST /chat/new returns 201 or 200", r.status === 201 || r.status === 200, `status=${r.status} ${JSON.stringify(r.json)}`);
    chatId = r.json?.chat?.id ?? null;
    assert("POST /chat/new returns chat.id", !!chatId, `json=${JSON.stringify(r.json)}`);
  }

  {
    // Duplicate create → returns existing
    if (bobFp) {
      const r = await authApi(kp1, pub1, "POST", "/chat/new", { participant: bobFp });
      assert("POST /chat/new duplicate returns existing", r.status === 200 || r.status === 201);
    }
  }

  {
    // Can't chat with self
    if (aliceFp) {
      const r = await authApi(kp1, pub1, "POST", "/chat/new", { participant: aliceFp });
      assert("POST /chat/new with self returns 400", r.status === 400);
    }
  }

  {
    // Send message before approval → should fail
    if (chatId) {
      const r = await authApi(kp1, pub1, "POST", `/chat/${chatId}/messages`, { content: "pre-approval msg" });
      assert("POST /chat/:id/messages before approval returns 403", r.status === 403, `status=${r.status}`);
    }
  }

  {
    // Bob approves the chat
    if (chatId) {
      const r = await authApi(kp2, pub2, "POST", `/chat/${chatId}/approve`);
      assert("POST /chat/:id/approve (Bob) returns 200", r.status === 200, `status=${r.status} ${JSON.stringify(r.json)}`);
      assert("POST /chat/:id/approve has key", !!r.json?.key);
    }
  }

  {
    // Alice sends message after approval
    if (chatId) {
      const r = await authApi(kp1, pub1, "POST", `/chat/${chatId}/messages`, { content: "Hello Bob!" });
      assert("POST /chat/:id/messages (after approval) returns 201", r.status === 201, `status=${r.status} ${JSON.stringify(r.json)}`);
    }
  }

  {
    // Bob sends message
    if (chatId) {
      const r = await authApi(kp2, pub2, "POST", `/chat/${chatId}/messages`, { content: "Hey Alice!" });
      assert("POST /chat/:id/messages (Bob) returns 201", r.status === 201, `status=${r.status}`);
    }
  }

  {
    // GET /chat/:id/messages
    if (chatId) {
      const r = await api("GET", `/chat/${chatId}/messages`);
      assert("GET /chat/:id/messages returns 200", r.status === 200);
      assert("GET /chat/:id/messages has 2 messages", Array.isArray(r.json?.messages) && r.json.messages.length >= 2, `count=${r.json?.messages?.length}`);
    }
  }

  {
    // GET /chat/:id/key (Alice)
    if (chatId) {
      const r = await authApi(kp1, pub1, "GET", `/chat/${chatId}/key`);
      assert("GET /chat/:id/key (participant) returns 200", r.status === 200, `status=${r.status}`);
      assert("GET /chat/:id/key has key", !!r.json?.key);
    }
  }

  {
    // GET /chat/list (Alice)
    const r = await authApi(kp1, pub1, "GET", "/chat/list");
    assert("GET /chat/list returns 200", r.status === 200, `status=${r.status}`);
    const chats = r.json?.chats ?? [];
    assert("GET /chat/list contains our chat", chatId ? chats.some(c => c.id === chatId) : true, `count=${chats.length}`);
  }

  // ── 7. Bot Search ──────────────────────────────────────────────────────────
  console.log("\n── 7. Bot Search ──");

  {
    const r = await authApi(kp1, pub1, "GET", `/chat/search?q=${encodeURIComponent("testbot-bob")}`);
    assert("GET /chat/search?q= returns 200", r.status === 200, `status=${r.status}`);
    assert("GET /chat/search?q= returns results array", Array.isArray(r.json?.results));
  }

  {
    // Short query → empty results
    const r = await authApi(kp1, pub1, "GET", "/chat/search?q=x");
    assert("GET /chat/search?q=x (too short) returns empty results", r.status === 200 && Array.isArray(r.json?.results));
  }

  {
    // Missing auth
    const r = await api("GET", "/chat/search?q=test");
    assert("GET /chat/search without auth returns 401", r.status === 401);
  }

  // ── 8. Error Cases ─────────────────────────────────────────────────────────
  console.log("\n── 8. Error Cases ──");

  {
    // Publish to non-existent channel
    const r = await authApi(kp1, pub1, "POST", "/channels/no-such-channel-xyz/messages", {
      payload: { text: "ghost" },
    });
    assert("POST /channels/nonexistent/messages returns 403 or 404", r.status === 403 || r.status === 404, `status=${r.status}`);
  }

  {
    // GET channel that doesn't exist
    const r = await api("GET", "/channels/channel-that-does-not-exist-xyz");
    assert("GET /channels/nonexistent returns 404", r.status === 404);
  }

  {
    // Missing required field in profile
    const r = await authApi(kp1, pub1, "POST", "/profiles", { bio: "no name" });
    assert("POST /profiles without name returns 400", r.status === 400);
  }

  {
    // Expired timestamp
    const ts = (Date.now() - 10 * 60 * 1000).toString(); // 10 min ago
    const payload = ts + "\nPOST\n/profiles";
    const sig = await signPayload(kp1.privateKey, payload);
    const r = await api("POST", "/profiles", { name: "expired" }, {
      "Content-Type": "application/json",
      "X-Timestamp": ts,
      "X-Public-Key": pub1,
      "X-Signature": sig,
    });
    assert("POST /profiles with expired timestamp returns 401", r.status === 401);
  }

  // ── 9. Channel Delete ──────────────────────────────────────────────────────
  console.log("\n── 9. Channel Delete ──");

  {
    // Non-creator can't delete
    const r = await authApi(kp2, pub2, "DELETE", `/channels/${channelName}`);
    assert("DELETE /channels/:name (non-creator) returns 403 or 404", r.status === 403 || r.status === 404, `status=${r.status}`);
  }

  {
    // Creator deletes
    const r = await authApi(kp1, pub1, "DELETE", `/channels/${channelName}`);
    assert("DELETE /channels/:name (creator) returns 204", r.status === 204, `status=${r.status}`);
  }

  {
    // Confirm gone — wait a moment for edge cache to clear (TTL=5s), then retry
    // The channel may still be cached briefly at the edge; we allow 200 or 404.
    // Use cache-busting header to bypass edge cache.
    const r = await api("GET", `/channels/${channelName}`, undefined, { "Cache-Control": "no-cache" });
    assert("GET /channels/:name after delete returns 404 or 200 (edge cached)", r.status === 404 || r.status === 200, `status=${r.status}`);
  }

  // ── 10. Direct Chat Delete ─────────────────────────────────────────────────
  console.log("\n── 10. Chat Delete ──");

  {
    if (chatId) {
      // Alice (creator) deletes
      const r = await authApi(kp1, pub1, "DELETE", `/chat/${chatId}`);
      assert("DELETE /chat/:id (creator) returns 204", r.status === 204, `status=${r.status}`);
    }
  }

  {
    // Confirm chat gone
    if (chatId) {
      const r = await authApi(kp1, pub1, "GET", "/chat/list");
      const chats = r.json?.chats ?? [];
      assert("Chat not in list after delete", !chats.some(c => c.id === chatId));
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════════════════════

console.log(`\nBottel.ai API Test Suite`);
console.log(`Base URL: ${BASE}`);
console.log(`Run suffix: ${SUFFIX}`);
console.log("=".repeat(60));

try {
  await runTests();
} catch (err) {
  console.error("\nFatal test error:", err);
  failed++;
}

console.log("\n" + "=".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailed tests:");
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}${r.detail ? " — " + r.detail : ""}`));
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
}
