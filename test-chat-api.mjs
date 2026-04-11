// test-chat-api.mjs — API-level tests for 1:1 direct chat and profile visibility.
//
// Run:
//   node test-chat-api.mjs
//
// Requires backend running at :8787 with a fresh DB.

const BASE = "http://localhost:8787";

// ─── Bot identities ──────────────────────────────────────────

const suffix = Date.now().toString(36);

const BOT_A = {
  fingerprint: "SHA256:chat-botA-" + suffix.padEnd(32, "a"),
  name: "ChatBotA",
};

const BOT_B = {
  fingerprint: "SHA256:chat-botB-" + suffix.padEnd(32, "b"),
  name: "ChatBotB",
};

const BOT_C = {
  fingerprint: "SHA256:chat-botC-" + suffix.padEnd(32, "c"),
  name: "BotC",
};

// ─── Helpers ─────────────────────────────────────────────────

async function api(method, path, fp, body) {
  const headers = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function apiOk(method, path, fp, body) {
  const { status, json } = await api(method, path, fp, body);
  if (status < 200 || status >= 300) {
    throw new Error(`${method} ${path} -> ${status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, pass: false });
    console.log("FAIL", name, e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Setup: create profiles ──────────────────────────────────

console.log("[setup] Creating profiles for Bot A, B, C...");
await apiOk("POST", "/profiles", BOT_A.fingerprint, {
  name: BOT_A.name,
  bio: "chat test bot A",
  public: true,
});
await apiOk("POST", "/profiles", BOT_B.fingerprint, {
  name: BOT_B.name,
  bio: "chat test bot B",
  public: true,
});
await apiOk("POST", "/profiles", BOT_C.fingerprint, {
  name: BOT_C.name,
  bio: "chat test bot C",
  public: true,
});
console.log("[setup] Profiles created.\n");

// ─── Shared state ────────────────────────────────────────────

let chatId;

// ─── Test 1: Create chat ─────────────────────────────────────

await check("1. Create chat — Bot A creates chat with Bot B", async () => {
  const data = await apiOk("POST", "/chat/new", BOT_A.fingerprint, {
    participant: BOT_B.fingerprint,
  });
  assert(data.chat, "Response should contain chat object");
  assert(data.chat.id, "Chat should have an id");
  assert(
    (data.chat.participant_a === BOT_A.fingerprint && data.chat.participant_b === BOT_B.fingerprint) ||
    (data.chat.participant_a === BOT_B.fingerprint && data.chat.participant_b === BOT_A.fingerprint),
    "Chat should include both participants",
  );
  chatId = data.chat.id;
});

// ─── Test 2: Duplicate chat returns existing ─────────────────

await check("2. Duplicate chat returns existing ID", async () => {
  const data = await apiOk("POST", "/chat/new", BOT_A.fingerprint, {
    participant: BOT_B.fingerprint,
  });
  assertEqual(data.chat.id, chatId, "Duplicate chat ID");
});

// ─── Test 3: Bot B can see the chat ──────────────────────────

await check("3. Bot B can also see the chat via /chat/list", async () => {
  const data = await apiOk("GET", "/chat/list", BOT_B.fingerprint);
  assert(Array.isArray(data.chats), "Response should contain chats array");
  const found = data.chats.find((c) => c.id === chatId);
  assert(found, `Bot B's chat list should include chat ${chatId}`);
  assertEqual(found.other_fp, BOT_A.fingerprint, "other_fp for Bot B");
});

// ─── Test 4: Send message ────────────────────────────────────

await check("4. Send message — Bot A sends 'hello'", async () => {
  const data = await apiOk("POST", `/chat/${chatId}/messages`, BOT_A.fingerprint, {
    content: "hello",
  });
  assert(data.message, "Response should contain message object");
  assertEqual(data.message.content, "hello", "Message content");
  assertEqual(data.message.sender, BOT_A.fingerprint, "Message sender");
  assertEqual(data.message.chat_id, chatId, "Message chat_id");
});

// ─── Test 5: Receive message ────────────────────────────────

await check("5. Receive message — GET messages includes 'hello'", async () => {
  const data = await apiOk("GET", `/chat/${chatId}/messages`, BOT_A.fingerprint);
  assert(Array.isArray(data.messages), "Response should contain messages array");
  const hello = data.messages.find((m) => m.content === "hello");
  assert(hello, "Messages should include 'hello'");
  assertEqual(hello.sender, BOT_A.fingerprint, "hello sender");
});

// ─── Test 6: Bot B sends reply ───────────────────────────────

await check("6. Bot B sends reply — 'hi back'", async () => {
  const data = await apiOk("POST", `/chat/${chatId}/messages`, BOT_B.fingerprint, {
    content: "hi back",
  });
  assert(data.message, "Response should contain message object");
  assertEqual(data.message.content, "hi back", "Reply content");
  assertEqual(data.message.sender, BOT_B.fingerprint, "Reply sender");
});

// ─── Test 7: Both messages visible ──────────────────────────

await check("7. Both messages visible in message list", async () => {
  const data = await apiOk("GET", `/chat/${chatId}/messages`, BOT_B.fingerprint);
  assert(Array.isArray(data.messages), "Response should contain messages array");
  const contents = data.messages.map((m) => m.content);
  assert(contents.includes("hello"), "Messages should include 'hello'");
  assert(contents.includes("hi back"), "Messages should include 'hi back'");
  assert(data.messages.length >= 2, "Should have at least 2 messages");
});

// ─── Test 8: Non-participant cannot read ─────────────────────

await check("8. Non-participant cannot read messages", async () => {
  const { status } = await api("GET", `/chat/${chatId}/messages`, BOT_C.fingerprint);
  // 404 is correct — non-participants can't see the chat exists
  if (status !== 403 && status !== 404) throw new Error(`Expected 403/404, got ${status}`);
});

// ─── Test 9: Non-participant cannot send ─────────────────────

await check("9. Non-participant cannot send messages", async () => {
  const { status } = await api("POST", `/chat/${chatId}/messages`, BOT_C.fingerprint, {
    content: "intruder!",
  });
  if (status !== 403 && status !== 404) throw new Error(`Expected 403/404, got ${status}`);
});

// ─── Test 10: Non-creator cannot delete ──────────────────────
// (run before creator delete so chat still exists)

await check("11. Non-creator cannot delete chat", async () => {
  const { status } = await api("DELETE", `/chat/${chatId}`, BOT_B.fingerprint);
  assertEqual(status, 403, "Non-creator delete status");
});

// ─── Test 11: Creator can delete ─────────────────────────────

await check("10. Creator can delete chat", async () => {
  const { status } = await api("DELETE", `/chat/${chatId}`, BOT_A.fingerprint);
  assertEqual(status, 204, "Creator delete status");
});

// ─── Test 12: Chat gone after delete ─────────────────────────

await check("12. Chat gone after delete", async () => {
  const data = await apiOk("GET", "/chat/list", BOT_A.fingerprint);
  const found = data.chats.find((c) => c.id === chatId);
  assert(!found, "Deleted chat should not appear in list");
});

// ─── Profile Visibility Tests ─────────────────────────────────
// These use channels to verify author_name visibility based on profile public flag.

import { minePow } from "./dist/src/lib/pow.js";

const CHANNEL = "profile-vis-" + suffix;

console.log("\n[setup] Creating channel for profile visibility tests...");
await apiOk("POST", "/channels", BOT_A.fingerprint, {
  name: CHANNEL,
  description: "profile visibility test channel",
});
console.log("[setup] Channel created.\n");

// ─── Test 13: Private profile hides name ─────────────────────

await check("13. Private profile hides name in channel messages", async () => {
  // Set Bot C's profile to private
  await apiOk("POST", "/profiles", BOT_C.fingerprint, {
    name: BOT_C.name,
    bio: "chat test bot C",
    public: false,
  });

  // Post a message to the channel as Bot C
  const payload = { type: "text", text: "private-msg-" + Date.now() };
  const pow = await minePow(CHANNEL, BOT_C.fingerprint, payload);
  await apiOk("POST", `/channels/${CHANNEL}/messages`, BOT_C.fingerprint, {
    payload,
    pow,
  });

  // Fetch channel messages as another bot
  const data = await apiOk("GET", `/channels/${encodeURIComponent(CHANNEL)}`, BOT_A.fingerprint);
  const botCMessages = data.messages.filter((m) => m.author === BOT_C.fingerprint);
  assert(botCMessages.length > 0, "Bot C should have messages in channel");

  const latestMsg = botCMessages[botCMessages.length - 1];
  assertEqual(latestMsg.author_name, null, "author_name when profile is private");
});

// ─── Test 14: Public profile shows name ──────────────────────

await check("14. Public profile shows name in channel messages", async () => {
  // Set Bot C's profile back to public
  await apiOk("POST", "/profiles", BOT_C.fingerprint, {
    name: BOT_C.name,
    bio: "chat test bot C",
    public: true,
  });

  // Post another message to the channel as Bot C
  const payload = { type: "text", text: "public-msg-" + Date.now() };
  const pow = await minePow(CHANNEL, BOT_C.fingerprint, payload);
  await apiOk("POST", `/channels/${CHANNEL}/messages`, BOT_C.fingerprint, {
    payload,
    pow,
  });

  // Fetch channel messages as another bot
  const data = await apiOk("GET", `/channels/${encodeURIComponent(CHANNEL)}`, BOT_A.fingerprint);
  const botCMessages = data.messages.filter((m) => m.author === BOT_C.fingerprint);
  assert(botCMessages.length > 0, "Bot C should have messages in channel");

  // Find the latest message from Bot C (posted while public)
  const latestMsg = botCMessages[botCMessages.length - 1];
  assertEqual(latestMsg.author_name, BOT_C.name, "author_name when profile is public");
});

// ─── Summary ─────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
for (const r of results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
}
process.exit(results.every((r) => r.pass) ? 0 : 1);
