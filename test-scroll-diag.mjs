// test-scroll-diag.mjs — Diagnose scroll-skip bug in ChannelView.
//
// When the user continuously presses Up/PageUp, some messages get skipped.
// This test captures frames after each key press to detect whether
// scrollBy() actually changes the rendered output on every press.
//
// Run:
//   PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npx tsc && node test-scroll-diag.mjs
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
  publicKey: "ssh-ed25519 AAAA-scrolldiag",
  fingerprint: "SHA256:scrolldiag-test-" + Date.now().toString(36).padEnd(32, "z"),
};

const CHANNEL = "scrolldiag-" + Date.now().toString(36);
const MSG_COUNT = 15; // within rate limit
const TAIL_MARKER = "TAIL_" + Math.random().toString(36).slice(2, 8);
const HEAD_MARKER = "HEAD_" + Math.random().toString(36).slice(2, 8);

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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
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

// ─── Setup: create bot profile, channel, and 15 messages ──────

console.log("[setup] Creating profile and channel...");
await api("POST", "/profiles", BOT.fingerprint, {
  name: "ScrollDiagBot",
  bio: "scroll diagnostic test bot",
  public: true,
});

await api("POST", "/channels", BOT.fingerprint, {
  name: CHANNEL,
  description: "scroll diagnostic test channel",
});

console.log(`[setup] Publishing ${MSG_COUNT} messages...`);
for (let i = 0; i < MSG_COUNT; i++) {
  let text;
  if (i === 0) {
    text = HEAD_MARKER;
  } else if (i === MSG_COUNT - 1) {
    text = TAIL_MARKER;
  } else {
    text = `scroll-msg-${String(i).padStart(3, "0")}`;
  }
  const payload = { type: "text", text };
  const pow = await minePow(CHANNEL, BOT.fingerprint, payload);
  await api("POST", `/channels/${CHANNEL}/messages`, BOT.fingerprint, {
    payload, pow,
  });
}
console.log("[setup] Done.\n");

// ─── Diagnostic: Press Up 5 times, capture frame after each ──

console.log("=== Diagnostic: Up Arrow x5 ===\n");

__setAuthOverride(BOT);
const { lastFrame, stdin, unmount } = render(React.createElement(App));

try {
  await openChannelView(stdin);

  // Extra settle for auto-scroll-to-bottom
  await settle(500);

  const upFrames = [];

  // Capture initial frame (should show latest messages at bottom)
  const initialFrame = strip(lastFrame() ?? "");
  upFrames.push(initialFrame);
  console.log(`[initial] Frame length: ${initialFrame.length} chars`);
  console.log(`[initial] Contains TAIL_MARKER: ${initialFrame.includes(TAIL_MARKER)}`);
  console.log(`[initial] Contains HEAD_MARKER: ${initialFrame.includes(HEAD_MARKER)}`);

  // Press Up 5 times, capture after each
  for (let i = 0; i < 5; i++) {
    press(stdin, KEY.up);
    await settle(150); // give ink time to re-render
    const frame = strip(lastFrame() ?? "");
    upFrames.push(frame);
    const changed = frame !== upFrames[i]; // compare to previous frame
    console.log(`[Up ${i + 1}] Frame length: ${frame.length}, changed: ${changed}`);
  }

  // Report which Up presses actually changed the frame
  console.log("\n--- Up Arrow Summary ---");
  let upChanges = 0;
  let upStalls = 0;
  for (let i = 1; i < upFrames.length; i++) {
    const changed = upFrames[i] !== upFrames[i - 1];
    if (changed) upChanges++;
    else upStalls++;
    console.log(`  Press ${i}: ${changed ? "CHANGED" : "STALLED (no change)"}`);
  }
  console.log(`  Total: ${upChanges} changed, ${upStalls} stalled out of 5 presses`);

  // ─── Diagnostic: PageDown x3 from current position ──────────

  console.log("\n=== Diagnostic: PageDown x3 ===\n");

  const pdFrames = [];

  // Capture frame before PageDown presses
  const beforePd = strip(lastFrame() ?? "");
  pdFrames.push(beforePd);
  console.log(`[before PageDown] Frame length: ${beforePd.length} chars`);

  for (let i = 0; i < 3; i++) {
    press(stdin, KEY.pageDown);
    await settle(150);
    const frame = strip(lastFrame() ?? "");
    pdFrames.push(frame);
    const changed = frame !== pdFrames[i];
    console.log(`[PageDown ${i + 1}] Frame length: ${frame.length}, changed: ${changed}`);
  }

  console.log("\n--- PageDown Summary ---");
  let pdChanges = 0;
  let pdStalls = 0;
  for (let i = 1; i < pdFrames.length; i++) {
    const changed = pdFrames[i] !== pdFrames[i - 1];
    if (changed) pdChanges++;
    else pdStalls++;
    console.log(`  Press ${i}: ${changed ? "CHANGED" : "STALLED (no change)"}`);
  }
  console.log(`  Total: ${pdChanges} changed, ${pdStalls} stalled out of 3 presses`);

  // ─── Diagnostic: PageUp x5 from bottom ──────────────────────

  console.log("\n=== Diagnostic: PageUp x5 (from bottom) ===\n");

  // First scroll back to bottom
  for (let i = 0; i < 10; i++) {
    press(stdin, KEY.pageDown);
    await settle(50);
  }
  await settle(300);

  const puFrames = [];
  const beforePu = strip(lastFrame() ?? "");
  puFrames.push(beforePu);
  console.log(`[before PageUp] Frame length: ${beforePu.length} chars`);
  console.log(`[before PageUp] Contains TAIL_MARKER: ${beforePu.includes(TAIL_MARKER)}`);

  for (let i = 0; i < 5; i++) {
    press(stdin, KEY.pageUp);
    await settle(150);
    const frame = strip(lastFrame() ?? "");
    puFrames.push(frame);
    const changed = frame !== puFrames[i];
    console.log(`[PageUp ${i + 1}] Frame length: ${frame.length}, changed: ${changed}`);
  }

  console.log("\n--- PageUp Summary ---");
  let puChanges = 0;
  let puStalls = 0;
  for (let i = 1; i < puFrames.length; i++) {
    const changed = puFrames[i] !== puFrames[i - 1];
    if (changed) puChanges++;
    else puStalls++;
    console.log(`  Press ${i}: ${changed ? "CHANGED" : "STALLED (no change)"}`);
  }
  console.log(`  Total: ${puChanges} changed, ${puStalls} stalled out of 5 presses`);

  // ─── Overall verdict ────────────────────────────────────────

  console.log("\n========================================");
  console.log("OVERALL DIAGNOSTIC RESULTS");
  console.log("========================================");

  const totalStalls = upStalls + pdStalls + puStalls;
  const totalPresses = 5 + 3 + 5;

  if (totalStalls === 0) {
    console.log("RESULT: All key presses produced frame changes. scrollBy() appears to work.");
  } else {
    console.log(`RESULT: ${totalStalls}/${totalPresses} key presses produced NO frame change.`);
    console.log("This confirms messages are being skipped — scrollBy() may be broken or");
    console.log("the scroll offset is not being applied correctly on every press.");
  }

  if (upStalls > 0) {
    console.log(`  -> Up Arrow: ${upStalls}/5 stalled`);
  }
  if (puStalls > 0) {
    console.log(`  -> PageUp: ${puStalls}/5 stalled`);
  }
  if (pdStalls > 0) {
    console.log(`  -> PageDown: ${pdStalls}/3 stalled`);
  }

  console.log("========================================\n");

} finally {
  unmount();
  __setAuthOverride(undefined);
}

process.exit(0);
