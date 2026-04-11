// test-prefetch-newmsg.mjs — Verify new-message indicator and auto-scroll behavior.
//
// Run:
//   PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npx tsc && node test-prefetch-newmsg.mjs
//
// Requires backend running at :8787 with a fresh DB.

process.env.BOTTEL_API_URL = "http://localhost:8787";

import React from "react";
import { render } from "ink-testing-library";
import { App } from "./dist/src/App.js";
import { __setAuthOverride } from "./dist/src/lib/auth.js";
import { minePow } from "./dist/src/lib/pow.js";

// ─── Constants ─────────────────────────────────────────────────

const BASE = process.env.BOTTEL_API_URL;

const BOT_VIEWER = {
  privateKey: "x",
  publicKey: "ssh-ed25519 AAAA-prefetchtest-viewer",
  fingerprint: "SHA256:prefetch-viewer-" + Date.now().toString(36).padEnd(32, "z"),
};

const BOT_SENDER = {
  privateKey: "x",
  publicKey: "ssh-ed25519 AAAA-prefetchtest-sender",
  fingerprint: "SHA256:prefetch-sender-" + Date.now().toString(36).padEnd(32, "z"),
};

const CHANNEL = "newmsg-" + Date.now().toString(36);
const MSG_COUNT = 15;
const NEW_MSG_TEXT = "LIVEMSG_" + Math.random().toString(36).slice(2, 8);

const KEY = {
  down: "\x1B[B",
  up: "\x1B[A",
  enter: "\r",
  esc: "\x1B",
  pageDown: "\x1B[6~",
  pageUp: "\x1B[5~",
  g: "g",
};

// ─── Helpers ───────────────────────────────────────────────────

function strip(s) {
  return (s || "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

async function settle(ms = 300) {
  await new Promise((r) => setTimeout(r, ms));
}

async function api(method, path, fp, body) {
  const headers = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return json;
}

function press(stdin, key) {
  stdin.write(key);
}

/** Navigate from Home -> Channels -> first channel in list -> Enter */
async function openChannelView(stdin) {
  // Home screen: cursor starts on "Channels" (index 0). Press Enter.
  press(stdin, KEY.enter);
  await settle(800); // wait for channel list fetch

  // Channel list: press Enter on first item (our channel should be there).
  press(stdin, KEY.enter);
  await settle(2000); // wait for getChannel + min spinner (>=1000ms) + ws connect
}

/** Publish a message to the channel via API using the sender bot. */
async function publishMessage(text) {
  const payload = { type: "text", text };
  const pow = await minePow(CHANNEL, BOT_SENDER.fingerprint, payload);
  await api("POST", `/channels/${CHANNEL}/messages`, BOT_SENDER.fingerprint, {
    payload, pow,
  });
}

// ─── Test runner ───────────────────────────────────────────────

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

// ─── Setup: create bot profiles, channel, and seed messages ───

console.log("[setup] Creating profiles and channel...");
await api("POST", "/profiles", BOT_VIEWER.fingerprint, {
  name: "ViewerBot",
  bio: "viewer test bot",
  public: true,
});
await api("POST", "/profiles", BOT_SENDER.fingerprint, {
  name: "SenderBot",
  bio: "sender test bot",
  public: true,
});

await api("POST", "/channels", BOT_VIEWER.fingerprint, {
  name: CHANNEL,
  description: "new-message indicator test channel",
});

console.log(`[setup] Publishing ${MSG_COUNT} seed messages...`);
for (let i = 0; i < MSG_COUNT; i++) {
  const text = `seed-${String(i).padStart(3, "0")}-${CHANNEL}`;
  const payload = { type: "text", text };
  const pow = await minePow(CHANNEL, BOT_SENDER.fingerprint, payload);
  await api("POST", `/channels/${CHANNEL}/messages`, BOT_SENDER.fingerprint, {
    payload, pow,
  });
}
console.log("[setup] Done.\n");

// ─── Scenario 1: New message while scrolled up does NOT auto-jump ──

await check("New message while scrolled up does NOT auto-jump", async () => {
  __setAuthOverride(BOT_VIEWER);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Scroll up so we are NOT at the bottom
    for (let i = 0; i < 10; i++) {
      press(stdin, KEY.pageUp);
      await settle(50);
    }
    await settle(300);

    // Publish a new message via the sender bot while viewer is scrolled up
    await publishMessage(NEW_MSG_TEXT);
    await settle(1500); // wait for WS delivery

    const frame = strip(lastFrame() ?? "");

    // The new message should NOT be visible in the viewport (user is scrolled up)
    assert(
      !frame.includes(NEW_MSG_TEXT),
      `Expected new message "${NEW_MSG_TEXT}" to NOT be visible while scrolled up. Frame:\n${frame.slice(0, 800)}`
    );

    // The new-message indicator should be shown
    assert(
      frame.includes("new message") && frame.includes("below"),
      `Expected "new message...below" indicator in frame. Frame:\n${frame.slice(0, 800)}`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 2: g key jumps to bottom and clears counter ────

await check("g key jumps to bottom and clears counter", async () => {
  __setAuthOverride(BOT_VIEWER);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Scroll up
    for (let i = 0; i < 10; i++) {
      press(stdin, KEY.pageUp);
      await settle(50);
    }
    await settle(300);

    // Publish a new message while scrolled up
    const jumpMsg = "JUMPMSG_" + Math.random().toString(36).slice(2, 8);
    await publishMessage(jumpMsg);
    await settle(1500); // wait for WS delivery

    // Verify indicator is showing before pressing g
    let frame = strip(lastFrame() ?? "");
    assert(
      frame.includes("new message"),
      `Expected new-message indicator before pressing g. Frame:\n${frame.slice(0, 800)}`
    );

    // Press g to jump to bottom
    press(stdin, KEY.g);
    await settle(500);

    frame = strip(lastFrame() ?? "");

    // The new message should now be visible
    assert(
      frame.includes(jumpMsg),
      `Expected "${jumpMsg}" visible after pressing g. Frame:\n${frame.slice(0, 800)}`
    );

    // The indicator should be gone
    assert(
      !frame.includes("new messages below") && !frame.includes("new message below"),
      `Expected no "new message(s) below" indicator after pressing g. Frame:\n${frame.slice(0, 800)}`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 3: Auto-scroll when at bottom ─────────────────

await check("Auto-scroll when at bottom", async () => {
  __setAuthOverride(BOT_VIEWER);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Stay at the bottom (do not scroll up). Publish a message.
    const autoMsg = "AUTOMSG_" + Math.random().toString(36).slice(2, 8);
    await publishMessage(autoMsg);
    await settle(1500); // wait for WS delivery + auto-scroll

    const frame = strip(lastFrame() ?? "");

    // The message should appear in the frame (auto-scrolled to show it)
    assert(
      frame.includes(autoMsg),
      `Expected "${autoMsg}" visible via auto-scroll. Frame:\n${frame.slice(0, 800)}`
    );

    // No indicator should be shown since we were at the bottom
    assert(
      !frame.includes("new messages below") && !frame.includes("new message below"),
      `Expected no "new message(s) below" indicator when at bottom. Frame:\n${frame.slice(0, 800)}`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Summary ───────────────────────────────────────────────────

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
for (const r of results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
}
process.exit(results.every((r) => r.pass) ? 0 : 1);
