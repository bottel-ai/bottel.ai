// test-fixed-layout.mjs — Verify fixed header/footer behavior in ChannelView.
//
// Run:
//   PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npx tsc && node test-fixed-layout.mjs
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

const BOT = {
  privateKey: "x",
  publicKey: "ssh-ed25519 AAAA-fixtest",
  fingerprint: "SHA256:fixedlayout-test-" + Date.now().toString(36).padEnd(32, "z"),
};

const CHANNEL = "fixlayout-" + Date.now().toString(36);
const MSG_COUNT = 25;
const TAIL_MARKER = "TAIL_MARKER_" + Math.random().toString(36).slice(2, 8);
const HEAD_MARKER = "HEAD_MARKER_" + Math.random().toString(36).slice(2, 8);

const KEY = {
  down: "\x1B[B",
  up: "\x1B[A",
  enter: "\r",
  esc: "\x1B",
  pageDown: "\x1B[6~",
  pageUp: "\x1B[5~",
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

// ─── Setup: create bot profile, channel, and 65 messages ──────

console.log("[setup] Creating profile and channel...");
await api("POST", "/profiles", BOT.fingerprint, {
  name: "FixBot",
  bio: "layout test bot",
  public: true,
});

await api("POST", "/channels", BOT.fingerprint, {
  name: CHANNEL,
  description: "fixed layout test channel",
});

console.log(`[setup] Publishing ${MSG_COUNT} messages...`);
for (let i = 0; i < MSG_COUNT; i++) {
  let text;
  if (i === 0) {
    text = HEAD_MARKER;
  } else if (i === MSG_COUNT - 1) {
    text = TAIL_MARKER;
  } else {
    text = `msg-${String(i).padStart(3, "0")}-${CHANNEL}`;
  }
  const payload = { type: "text", text };
  const pow = await minePow(CHANNEL, BOT.fingerprint, payload);
  await api("POST", `/channels/${CHANNEL}/messages`, BOT.fingerprint, {
    payload, pow,
  });
}
console.log("[setup] Done.\n");

// ─── Scenario 1: Header visible after scrolling down ──────────

await check("Header visible after scrolling down", async () => {
  __setAuthOverride(BOT);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Scroll down several times
    for (let i = 0; i < 10; i++) {
      press(stdin, KEY.pageDown);
      await settle(50);
    }
    await settle(200);

    const frame = strip(lastFrame() ?? "");
    assert(
      frame.includes(`b/${CHANNEL}`),
      `Expected channel name "b/${CHANNEL}" in frame after scrolling down. Frame:\n${frame.slice(0, 500)}`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 2: Input field always visible ───────────────────

await check("Input field always visible", async () => {
  __setAuthOverride(BOT);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Check at initial position (bottom)
    let frame = strip(lastFrame() ?? "");
    const hasPrompt = frame.includes("\u276F") || frame.includes("Reply on");
    assert(hasPrompt, `Expected input prompt at initial position. Frame:\n${frame.slice(0, 500)}`);

    // Scroll up
    for (let i = 0; i < 10; i++) {
      press(stdin, KEY.pageUp);
      await settle(50);
    }
    await settle(200);

    frame = strip(lastFrame() ?? "");
    const hasPromptAfterScroll = frame.includes("\u276F") || frame.includes("Reply on");
    assert(
      hasPromptAfterScroll,
      `Expected input prompt after scrolling up. Frame:\n${frame.slice(0, 500)}`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 3: Status footer always visible ─────────────────

await check("Status footer always visible", async () => {
  __setAuthOverride(BOT);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Check at initial position
    let frame = strip(lastFrame() ?? "");
    const hasStatus = frame.includes("live") || frame.includes("offline");
    const hasMembers = frame.includes("member");
    assert(hasStatus, `Expected "live" or "offline" in frame. Frame:\n${frame.slice(0, 500)}`);
    assert(hasMembers, `Expected "member" in frame. Frame:\n${frame.slice(0, 500)}`);

    // Scroll up
    for (let i = 0; i < 10; i++) {
      press(stdin, KEY.pageUp);
      await settle(50);
    }
    await settle(200);

    frame = strip(lastFrame() ?? "");
    const hasStatusAfter = frame.includes("live") || frame.includes("offline");
    const hasMembersAfter = frame.includes("member");
    assert(hasStatusAfter, `Expected "live"/"offline" after scroll. Frame:\n${frame.slice(0, 500)}`);
    assert(hasMembersAfter, `Expected "member" after scroll. Frame:\n${frame.slice(0, 500)}`);
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 4: Messages scroll while chrome stays ───────────

await check("Messages scroll while chrome stays", async () => {
  __setAuthOverride(BOT);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Capture frame at initial position (scrolled to bottom — should show TAIL_MARKER)
    const frameBottom = strip(lastFrame() ?? "");

    // Scroll up significantly to see different messages
    for (let i = 0; i < 15; i++) {
      press(stdin, KEY.pageUp);
      await settle(50);
    }
    await settle(200);

    const frameTop = strip(lastFrame() ?? "");

    // Both frames should have the header channel name
    assert(
      frameBottom.includes(`b/${CHANNEL}`),
      `Header missing in bottom frame. Frame:\n${frameBottom.slice(0, 500)}`
    );
    assert(
      frameTop.includes(`b/${CHANNEL}`),
      `Header missing in top frame. Frame:\n${frameTop.slice(0, 500)}`
    );

    // Both frames should have the input prompt
    const bottomHasInput = frameBottom.includes("\u276F") || frameBottom.includes("Reply on");
    const topHasInput = frameTop.includes("\u276F") || frameTop.includes("Reply on");
    assert(bottomHasInput, `Input prompt missing in bottom frame`);
    assert(topHasInput, `Input prompt missing in top frame`);

    // The message content should differ between the two scroll positions.
    // At least one of the middle messages visible at top should NOT be visible at bottom,
    // or the TAIL_MARKER should disappear after scrolling up.
    const tailVisibleBottom = frameBottom.includes(TAIL_MARKER);
    const tailVisibleTop = frameTop.includes(TAIL_MARKER);
    assert(
      tailVisibleBottom !== tailVisibleTop || frameBottom !== frameTop,
      `Expected different message content between scroll positions but frames are identical`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 5: Scroll-to-bottom on entry ────────────────────

await check("Scroll-to-bottom on entry", async () => {
  __setAuthOverride(BOT);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Wait an extra beat for auto-scroll-to-bottom to settle
    await settle(500);

    const frame = strip(lastFrame() ?? "");
    assert(
      frame.includes(TAIL_MARKER),
      `Expected TAIL_MARKER "${TAIL_MARKER}" visible on entry (auto-scroll to bottom). Frame:\n${frame.slice(0, 800)}`
    );
  } finally {
    unmount();
    __setAuthOverride(undefined);
  }
});

// ─── Scenario 6: Scroll-up loads older messages ───────────────

await check("Scroll-up loads older messages", async () => {
  __setAuthOverride(BOT);
  const { lastFrame, stdin, unmount } = render(React.createElement(App));
  try {
    await openChannelView(stdin);

    // Aggressively scroll up — PageUp many times to reach the top.
    // Each PageUp moves the viewport ~10 lines. With 65 messages we need
    // many presses to reach offset 0 and trigger loadOlder.
    for (let i = 0; i < 40; i++) {
      press(stdin, KEY.pageUp);
      await settle(50);
    }
    // After reaching the top, one more PageUp should trigger loadOlder
    // (if hasMoreOlder is true and scroll offset is 0).
    press(stdin, KEY.pageUp);
    await settle(1500); // wait for loadOlderMessages to complete

    const frame = strip(lastFrame() ?? "");
    // The HEAD_MARKER was message index 0 — it should be visible
    // either because it was already in the initial 50 messages fetched,
    // or because loadOlder brought it in.
    assert(
      frame.includes(HEAD_MARKER),
      `Expected HEAD_MARKER "${HEAD_MARKER}" visible after scrolling to top. Frame:\n${frame.slice(0, 800)}`
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
