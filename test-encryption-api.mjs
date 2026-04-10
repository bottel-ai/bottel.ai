/**
 * Standalone API-level encryption test suite for bottel.ai private channels.
 *
 * Runs against a live backend at http://localhost:8787 with a fresh DB.
 * Usage:
 *   PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" node test-encryption-api.mjs
 */
import { createDecipheriv } from "node:crypto";

const BASE = process.env.BOTTEL_API_URL || "http://localhost:8787";

// ─── Decrypt helper ────────────────────────────────────────────

function decrypt(encStr, keyBase64) {
  const data = Buffer.from(encStr.slice(4), "base64"); // strip "enc:"
  const iv = data.subarray(0, 12);
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(12, data.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyBase64, "base64"),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

// ─── Test identity helpers ─────────────────────────────────────

const OWNER_FP =
  "SHA256:enctest-owner-" + Date.now().toString(36).padEnd(32, "a");
const OTHER_FP =
  "SHA256:enctest-other-" + Date.now().toString(36).padEnd(32, "b");
const OUTSIDER_FP =
  "SHA256:enctest-outsider-" + Date.now().toString(36).padEnd(32, "c");

const PUB_CHAN = "enc-pub-" + Date.now().toString(36);
const PRIV_CHAN = "enc-priv-" + Date.now().toString(36);

async function api(method, path, fp, body) {
  const headers = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

// ─── Runner ────────────────────────────────────────────────────

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// ─── Setup ─────────────────────────────────────────────────────

async function setup() {
  // Create profiles for all test bots
  await api("POST", "/profiles", OWNER_FP, {
    name: "EncOwner",
    bio: "encryption test owner",
    public: true,
  });
  await api("POST", "/profiles", OTHER_FP, {
    name: "EncOther",
    bio: "encryption test other",
    public: true,
  });
  await api("POST", "/profiles", OUTSIDER_FP, {
    name: "EncOutsider",
    bio: "encryption test outsider",
    public: true,
  });
}

// ─── Variables shared across tests ─────────────────────────────

let privateChannelKey = null;

// ─── Scenarios ─────────────────────────────────────────────────

async function runTests() {
  await setup();

  // 1. Create public channel — response has NO key field
  await check("Create public channel — no key in response", async () => {
    const { status, data } = await api("POST", "/channels", OWNER_FP, {
      name: PUB_CHAN,
      description: "public test channel",
      isPublic: true,
    });
    assert(status >= 200 && status < 300, `status ${status}`);
    assert(data.channel, "response should have channel object");
    assert(
      data.key === undefined || data.key === null,
      `public channel should not have key, got: ${data.key}`,
    );
  });

  // 2. Create private channel — response HAS a key field (base64 string)
  await check("Create private channel — key in response", async () => {
    const { status, data } = await api("POST", "/channels", OWNER_FP, {
      name: PRIV_CHAN,
      description: "private test channel",
      isPublic: false,
    });
    assert(status >= 200 && status < 300, `status ${status}`);
    assert(data.channel, "response should have channel object");
    assert(
      typeof data.key === "string" && data.key.length > 0,
      `private channel should have base64 key, got: ${JSON.stringify(data.key)}`,
    );
    // Validate it looks like base64
    const buf = Buffer.from(data.key, "base64");
    assert(buf.length === 32, `key should be 32 bytes (AES-256), got ${buf.length}`);
    privateChannelKey = data.key;
  });

  // 3. Publish to public channel — payload stored as plain JSON
  await check(
    "Publish to public channel — payload is plain JSON",
    async () => {
      const payload = { type: "text", text: "hello public world" };
      await api("POST", `/channels/${PUB_CHAN}/messages`, OWNER_FP, { payload });
      const { data } = await api("GET", `/channels/${PUB_CHAN}/messages`, null);
      assert(Array.isArray(data.messages), "expected messages array");
      const msg = data.messages.find(
        (m) =>
          typeof m.payload === "object" && m.payload.text === "hello public world",
      );
      assert(msg, "public message payload should be parseable JSON object");
    },
  );

  // 4. Publish to private channel — payload stored encrypted
  await check(
    "Publish to private channel — payload starts with enc:",
    async () => {
      const payload = { type: "text", text: "secret message" };
      await api("POST", `/channels/${PRIV_CHAN}/messages`, OWNER_FP, { payload });
      const { data } = await api("GET", `/channels/${PRIV_CHAN}/messages`, null);
      assert(Array.isArray(data.messages), "expected messages array");
      const msg = data.messages[data.messages.length - 1];
      assert(
        typeof msg.payload === "string" && msg.payload.startsWith("enc:"),
        `expected encrypted payload, got: ${JSON.stringify(msg.payload).slice(0, 80)}`,
      );
    },
  );

  // 5. Decrypt with correct key — matches original plaintext
  await check(
    "Decrypt with correct key — matches original plaintext",
    async () => {
      assert(privateChannelKey, "need private channel key from test 2");
      const { data } = await api("GET", `/channels/${PRIV_CHAN}/messages`, null);
      const msg = data.messages.find(
        (m) => typeof m.payload === "string" && m.payload.startsWith("enc:"),
      );
      assert(msg, "expected an encrypted message");
      const plaintext = decrypt(msg.payload, privateChannelKey);
      const parsed = JSON.parse(plaintext);
      assert(
        parsed.text === "secret message",
        `decrypted text mismatch: ${parsed.text}`,
      );
    },
  );

  // 6. Non-member cannot get key
  await check("Non-member cannot get key — 403", async () => {
    const { status } = await api(
      "GET",
      `/channels/${PRIV_CHAN}/key`,
      OUTSIDER_FP,
    );
    assert(status === 403, `expected 403, got ${status}`);
  });

  // 7. Pending member cannot get key
  await check("Pending member cannot get key — 403", async () => {
    // OTHER follows the private channel → should be pending
    const followRes = await api(
      "POST",
      `/channels/${PRIV_CHAN}/follow`,
      OTHER_FP,
    );
    assert(
      followRes.data.status === "pending",
      `expected pending, got ${followRes.data.status}`,
    );
    // Try to get key while pending
    const { status } = await api(
      "GET",
      `/channels/${PRIV_CHAN}/key`,
      OTHER_FP,
    );
    assert(status === 403, `expected 403 for pending member, got ${status}`);
  });

  // 8. Approved member gets key
  await check("Approved member gets key after approval", async () => {
    // Owner approves OTHER
    const approveRes = await api(
      "POST",
      `/channels/${PRIV_CHAN}/follow/${OTHER_FP}/approve`,
      OWNER_FP,
    );
    assert(
      approveRes.data.status === "active",
      `expected active after approve, got ${approveRes.data.status}`,
    );
    // Now OTHER can get the key
    const keyRes = await api("GET", `/channels/${PRIV_CHAN}/key`, OTHER_FP);
    assert(keyRes.status === 200, `expected 200, got ${keyRes.status}`);
    assert(
      typeof keyRes.data.key === "string" && keyRes.data.key.length > 0,
      `expected key string, got ${JSON.stringify(keyRes.data.key)}`,
    );
  });

  // 9. Key from approve matches create key
  await check(
    "Key from approve matches key from channel creation",
    async () => {
      const keyRes = await api("GET", `/channels/${PRIV_CHAN}/key`, OTHER_FP);
      assert(
        keyRes.data.key === privateChannelKey,
        `keys don't match: approve=${keyRes.data.key}, create=${privateChannelKey}`,
      );
    },
  );

  // 10. Multiple messages, all encrypted
  await check(
    "Multiple messages — all payloads start with enc:",
    async () => {
      for (let i = 0; i < 5; i++) {
        await api("POST", `/channels/${PRIV_CHAN}/messages`, OWNER_FP, {
          payload: { type: "text", text: `bulk-msg-${i}` },
        });
      }
      const { data } = await api("GET", `/channels/${PRIV_CHAN}/messages`, null);
      assert(Array.isArray(data.messages), "expected messages array");
      // All messages in the private channel should be encrypted
      const nonEncrypted = data.messages.filter(
        (m) =>
          !(typeof m.payload === "string" && m.payload.startsWith("enc:")),
      );
      assert(
        nonEncrypted.length === 0,
        `found ${nonEncrypted.length} non-encrypted messages in private channel`,
      );
    },
  );

  // 11. Public channel messages are NOT encrypted
  await check(
    "Public channel messages are NOT encrypted",
    async () => {
      // Publish a few more to be sure
      await api("POST", `/channels/${PUB_CHAN}/messages`, OWNER_FP, {
        payload: { type: "text", text: "still public" },
      });
      const { data } = await api("GET", `/channels/${PUB_CHAN}/messages`, null);
      assert(Array.isArray(data.messages), "expected messages array");
      const encrypted = data.messages.filter(
        (m) => typeof m.payload === "string" && m.payload.startsWith("enc:"),
      );
      assert(
        encrypted.length === 0,
        `found ${encrypted.length} encrypted messages in public channel`,
      );
    },
  );

  // 12. Channel list doesn't leak keys
  await check(
    "Channel list does NOT contain encryption_key",
    async () => {
      const { data } = await api("GET", "/channels", null);
      const raw = JSON.stringify(data);
      assert(
        !raw.includes("encryption_key"),
        'channel list response contains "encryption_key"',
      );
      // Also check that the private channel key value isn't in the listing
      if (privateChannelKey) {
        assert(
          !raw.includes(privateChannelKey),
          "channel list response leaks the actual key value",
        );
      }
    },
  );

  // ─── Summary ───────────────────────────────────────────────────
  console.log(
    `\n${results.filter((r) => r.pass).length}/${results.length} passed`,
  );
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

runTests().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
