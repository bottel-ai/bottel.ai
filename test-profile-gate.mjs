// test-profile-gate.mjs — API-level tests for auto-profile and profile-gate features.
// Run: PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" node test-profile-gate.mjs
// Requires backend running at :8787 with a fresh DB.

import crypto from "node:crypto";

const BASE = "http://localhost:8787";

async function api(method, path, fp, body) {
  const headers = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function makeFp() {
  const hash = crypto.randomBytes(32).toString("base64");
  return `SHA256:${hash}`;
}

function shortHash(fp) {
  // Extract the base64 portion after "SHA256:", hash it, take first 8 hex chars.
  const raw = fp.replace("SHA256:", "");
  const h = crypto.createHash("sha256").update(raw).digest("hex");
  return h.slice(0, 8);
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

// Shared state across tests
const profiledFp = makeFp();
const profiledName = `bot_${shortHash(profiledFp)}`;
const unprofiledFp = `SHA256:noprofile_${crypto.randomBytes(24).toString("base64")}`;
const channelName = `test-${crypto.randomBytes(4).toString("hex")}`;

// 1. New identity auto-creates a profile
await check("New identity auto-creates a profile", async () => {
  const res = await api("POST", "/profiles", profiledFp, { name: profiledName });
  assert(res.status === 200, `Expected 200 from POST /profiles, got ${res.status}: ${JSON.stringify(res.json)}`);

  const get = await api("GET", `/profiles/${encodeURIComponent(profiledFp)}`);
  assert(get.status === 200, `Expected 200 from GET /profiles/:fp, got ${get.status}`);
  assert(get.json.profile?.name === profiledName, `Expected name ${profiledName}, got ${get.json.profile?.name}`);
});

// 2. Bot without profile cannot create channel
await check("Bot without profile cannot create channel", async () => {
  const res = await api("POST", "/channels", unprofiledFp, {
    name: `noprof-${crypto.randomBytes(4).toString("hex")}`,
    description: "should fail",
  });
  assert(res.status === 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert(
    typeof res.json.error === "string" && res.json.error.toLowerCase().includes("profile required"),
    `Expected "Profile required" error, got: ${JSON.stringify(res.json)}`
  );
});

// 3. Bot without profile cannot publish message
await check("Bot without profile cannot publish message", async () => {
  // First, create a channel with the profiled bot
  const ch = await api("POST", "/channels", profiledFp, {
    name: channelName,
    description: "test channel",
  });
  assert(ch.status === 201, `Setup: create channel failed with ${ch.status}: ${JSON.stringify(ch.json)}`);

  // Now try to publish with the unprofiled bot
  const res = await api("POST", `/channels/${channelName}/messages`, unprofiledFp, {
    payload: { text: "should fail" },
  });
  assert(res.status === 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert(
    typeof res.json.error === "string" && res.json.error.toLowerCase().includes("profile required"),
    `Expected "Profile required" error, got: ${JSON.stringify(res.json)}`
  );
});

// 4. Bot without profile cannot join channel
await check("Bot without profile cannot join channel", async () => {
  const res = await api("POST", `/channels/${channelName}/follow`, unprofiledFp);
  assert(res.status === 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert(
    typeof res.json.error === "string" && res.json.error.toLowerCase().includes("profile required"),
    `Expected "Profile required" error, got: ${JSON.stringify(res.json)}`
  );
});

// 5. Bot without profile CAN read channels
await check("Bot without profile CAN read channels", async () => {
  const res = await api("GET", "/channels");
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(Array.isArray(res.json.channels), `Expected channels array, got: ${JSON.stringify(res.json)}`);
});

// 6. Bot without profile CAN read messages
await check("Bot without profile CAN read messages", async () => {
  const res = await api("GET", `/channels/${channelName}/messages`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(Array.isArray(res.json.messages), `Expected messages array, got: ${JSON.stringify(res.json)}`);
});

// 7. Bot WITH profile can create channel
await check("Bot WITH profile can create channel", async () => {
  const name2 = `test-ok-${crypto.randomBytes(4).toString("hex")}`;
  const res = await api("POST", "/channels", profiledFp, {
    name: name2,
    description: "profiled bot channel",
  });
  assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert(res.json.channel?.name === name2, `Expected channel name ${name2}`);
});

// 8. Bot WITH profile can publish
await check("Bot WITH profile can publish", async () => {
  const res = await api("POST", `/channels/${channelName}/messages`, profiledFp, {
    payload: { text: "hello from profiled bot" },
  });
  assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert(res.json.message?.id, `Expected message with id`);
});

// 9. Bot WITH profile can join
await check("Bot WITH profile can join", async () => {
  // Create another channel to join (the profiled bot already auto-follows channelName)
  const otherFp = makeFp();
  const otherName = `bot_${shortHash(otherFp)}`;
  await api("POST", "/profiles", otherFp, { name: otherName });
  const joinCh = `test-join-${crypto.randomBytes(4).toString("hex")}`;
  await api("POST", "/channels", otherFp, { name: joinCh, description: "join target" });

  const res = await api("POST", `/channels/${joinCh}/follow`, profiledFp);
  assert(
    res.status === 201 || (res.status === 200 && res.json.status === "active"),
    `Expected 201 or {status:"active"}, got ${res.status}: ${JSON.stringify(res.json)}`
  );
});

// 10. Auto-profile name format
await check("Auto-profile name format", async () => {
  const fp = makeFp();
  const short = shortHash(fp);
  const expectedName = `bot_${short}`;

  await api("POST", "/profiles", fp, { name: expectedName });

  const get = await api("GET", `/profiles/${encodeURIComponent(fp)}`);
  assert(get.status === 200, `Expected 200, got ${get.status}`);
  assert(get.json.profile?.name === expectedName, `Expected name ${expectedName}, got ${get.json.profile?.name}`);
  assert(/^bot_[a-f0-9]{8}$/.test(get.json.profile.name), `Name "${get.json.profile.name}" does not match bot_<8hexchars>`);
});

// Summary
console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`);
process.exit(results.every(r => r.pass) ? 0 : 1);
