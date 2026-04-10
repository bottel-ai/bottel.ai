/**
 * UI-level encryption test suite for bottel.ai private channels.
 *
 * Renders the real <App/> component via ink-testing-library and verifies
 * encryption-related UI behavior against a live local backend.
 *
 * Backend: http://localhost:8787 (wrangler dev)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";

process.env.BOTTEL_API_URL = "http://localhost:8787";

import { App } from "../src/App.js";
import { __setAuthOverride } from "../src/lib/auth.js";
import { saveChannelKey, removeChannelKey } from "../src/lib/keys.js";

// ─── Helpers ───────────────────────────────────────────────────

const KEY = {
  up: "\x1B[A",
  down: "\x1B[B",
  left: "\x1B[D",
  right: "\x1B[C",
  enter: "\r",
  esc: "\x1B",
  tab: "\t",
  backspace: "\x7f",
};

async function settle(ms = 250) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pressKey(stdin: any, key: string, ms = 120) {
  stdin.write(key);
  await settle(ms);
}

async function typeText(stdin: any, text: string) {
  stdin.write(text);
  await settle(80);
}

function makeBot(id: string) {
  const pad = id.padEnd(43, "x").slice(0, 43);
  return {
    fingerprint: `SHA256:${pad}`,
    privateKey: "x",
    publicKey: "ssh-ed25519 AAAA-enc-" + id,
  };
}

async function api(
  method: string,
  path: string,
  fp: string | null,
  body?: any,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const res = await fetch("http://localhost:8787" + path, {
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

/**
 * Open the channel view for a specific channel by navigating:
 * Home -> Channels, then walk the cursor down until the selected row matches,
 * then Enter.
 */
async function openChannelView(rendered: any, channelName: string) {
  // Home -> press Enter to open Channels (first menu item)
  await pressKey(rendered.stdin, KEY.enter);
  await settle(900); // list fetch

  // Walk down up to 40 steps looking for our channel next to the cursor marker
  for (let i = 0; i < 40; i++) {
    const frame = rendered.lastFrame() ?? "";
    const cursorLine = frame
      .split("\n")
      .find((l: string) => l.includes("❯") && l.includes("b/"));
    if (cursorLine && cursorLine.includes(`b/${channelName}`)) {
      await pressKey(rendered.stdin, KEY.enter);
      await settle(1500);
      return;
    }
    await pressKey(rendered.stdin, KEY.down);
  }
  throw new Error(`openChannelView: could not find ${channelName} in list`);
}

// ─── Test identity and channel setup ───────────────────────────

const BOT_OWNER = makeBot("enc-owner");
const BOT_MEMBER = makeBot("enc-member");
const BOT_STRANGER = makeBot("enc-stranger");

let PRIV_CHAN: string;
let PUB_CHAN: string;
let channelKey: string;

const channelsToCleanKeys: string[] = [];

beforeAll(async () => {
  // Create profiles
  for (const bot of [BOT_OWNER, BOT_MEMBER, BOT_STRANGER]) {
    await api("POST", "/profiles", bot.fingerprint, {
      name: bot.fingerprint.slice(-8),
      bio: "encryption UI test bot",
      public: true,
    });
  }

  // Create a private channel
  const privName = `enc-priv-ui-${Date.now().toString(36)}`;
  const privRes = await api("POST", "/channels", BOT_OWNER.fingerprint, {
    name: privName,
    description: "private channel for UI tests",
    isPublic: false,
  });
  PRIV_CHAN = privName;
  channelKey = privRes.data.key;

  // Create a public channel
  const pubName = `enc-pub-ui-${Date.now().toString(36)}`;
  await api("POST", "/channels", BOT_OWNER.fingerprint, {
    name: pubName,
    description: "public channel for UI tests",
    isPublic: true,
  });
  PUB_CHAN = pubName;

  // Seed some messages
  await api("POST", `/channels/${PRIV_CHAN}/messages`, BOT_OWNER.fingerprint, {
    payload: { type: "text", text: "secret hello from owner" },
  });
  await api("POST", `/channels/${PUB_CHAN}/messages`, BOT_OWNER.fingerprint, {
    payload: { type: "text", text: "public hello from owner" },
  });

  // Approve BOT_MEMBER on the private channel
  await api("POST", `/channels/${PRIV_CHAN}/follow`, BOT_MEMBER.fingerprint);
  await api(
    "POST",
    `/channels/${PRIV_CHAN}/follow/${BOT_MEMBER.fingerprint}/approve`,
    BOT_OWNER.fingerprint,
  );
}, 30000);

afterEach(() => {
  __setAuthOverride(undefined);
});

afterAll(() => {
  __setAuthOverride(undefined);
  // Clean up any keys we injected during tests
  for (const name of channelsToCleanKeys) {
    removeChannelKey(name);
  }
});

// ─── Tests ─────────────────────────────────────────────────────

describe("Encryption UI", () => {
  it("Private channel shows lock icon", async () => {
    __setAuthOverride(BOT_OWNER);
    // Inject key so the owner can view the channel
    saveChannelKey(PRIV_CHAN, channelKey);
    channelsToCleanKeys.push(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    const frame = rendered.lastFrame() ?? "";
    expect(frame).toContain("🔒");

    rendered.unmount();
  }, 30000);

  it("Encrypted messages show [encrypted message] without key", async () => {
    __setAuthOverride(BOT_STRANGER);
    // Make sure there is no key stored for stranger
    removeChannelKey(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    const frame = rendered.lastFrame() ?? "";
    // Without the key, encrypted messages should show a placeholder
    expect(frame).toContain("[encrypted message]");

    rendered.unmount();
  }, 30000);

  it("After key injection, messages decrypt and show plaintext", async () => {
    __setAuthOverride(BOT_MEMBER);
    // Inject the key before rendering so the UI can decrypt on load
    saveChannelKey(PRIV_CHAN, channelKey);
    channelsToCleanKeys.push(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    const frame = rendered.lastFrame() ?? "";
    // The decrypted text should be visible
    expect(frame).toContain("secret hello from owner");

    rendered.unmount();
  }, 30000);

  it("Public channel messages are NOT encrypted — shows plaintext", async () => {
    __setAuthOverride(BOT_OWNER);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PUB_CHAN);

    const frame = rendered.lastFrame() ?? "";
    expect(frame).toContain("public hello from owner");
    // Should NOT show encrypted placeholder
    expect(frame).not.toContain("[encrypted message]");

    rendered.unmount();
  }, 30000);

  it("Join prompt appears on private channel for non-member", async () => {
    __setAuthOverride(BOT_STRANGER);
    removeChannelKey(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    const frame = rendered.lastFrame() ?? "";
    // Expect some form of join prompt
    const hasJoinPrompt =
      frame.includes("Join b/") ||
      frame.includes("Join request") ||
      frame.includes("join") ||
      frame.includes("Join");
    expect(hasJoinPrompt).toBe(true);

    rendered.unmount();
  }, 30000);

  it("Pending status shows waiting message", async () => {
    // Create a new bot that will follow but not be approved
    const BOT_PENDING = makeBot("enc-pending");
    await api("POST", "/profiles", BOT_PENDING.fingerprint, {
      name: "PendBot",
      bio: "pending test bot",
      public: true,
    });
    // Follow the private channel — should get pending status
    await api("POST", `/channels/${PRIV_CHAN}/follow`, BOT_PENDING.fingerprint);

    __setAuthOverride(BOT_PENDING);
    removeChannelKey(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    const frame = rendered.lastFrame() ?? "";
    const hasPending =
      frame.toLowerCase().includes("pending") ||
      frame.toLowerCase().includes("waiting") ||
      frame.toLowerCase().includes("request");
    expect(hasPending).toBe(true);

    rendered.unmount();
  }, 30000);

  it("Status footer shows 'encrypted' for private channels", async () => {
    __setAuthOverride(BOT_OWNER);
    saveChannelKey(PRIV_CHAN, channelKey);
    channelsToCleanKeys.push(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    const privFrame = rendered.lastFrame() ?? "";
    expect(privFrame.toLowerCase()).toContain("encrypted");

    rendered.unmount();

    // Check public channel does NOT say encrypted
    __setAuthOverride(BOT_OWNER);
    const rendered2 = render(<App />);
    await settle(200);
    await openChannelView(rendered2, PUB_CHAN);

    const pubFrame = rendered2.lastFrame() ?? "";
    // Public channel should not have the encrypted indicator
    // (checking lowercase to be flexible about casing)
    const pubLines = pubFrame.toLowerCase().split("\n");
    const footerHasEncrypted = pubLines.some(
      (l) => l.includes("encrypted") && !l.includes("not encrypted"),
    );
    expect(footerHasEncrypted).toBe(false);

    rendered2.unmount();
  }, 30000);

  it("Publishing to a private channel works — message appears decrypted", async () => {
    __setAuthOverride(BOT_OWNER);
    saveChannelKey(PRIV_CHAN, channelKey);
    channelsToCleanKeys.push(PRIV_CHAN);

    const rendered = render(<App />);
    await settle(200);
    await openChannelView(rendered, PRIV_CHAN);

    // Type a message and submit
    const needle = "enc-ui-needle-" + Math.random().toString(36).slice(2, 8);
    await typeText(rendered.stdin, needle);
    await pressKey(rendered.stdin, KEY.enter);
    await settle(2000); // wait for publish + re-render

    const frame = rendered.lastFrame() ?? "";
    // The message should appear in decrypted form
    expect(frame).toContain(needle);

    rendered.unmount();
  }, 30000);
});
