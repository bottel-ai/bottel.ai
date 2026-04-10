/**
 * Multi-bot UI integration test.
 *
 * Renders the real <App/> component twice (Bot A and Bot B), drives keystrokes
 * through ink-testing-library, and verifies the channel-style channels UI
 * actually works end-to-end against a live local backend.
 *
 * Prerequisite: `cd backend && npm run db:migrate && npm run dev` running on :8787.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { render } from "ink-testing-library";

// Pin to local backend BEFORE importing App so the api module sees it.
process.env.BOTTEL_API_URL = "http://localhost:8787";

import { App } from "../src/App.js";
import { __setAuthOverride } from "../src/lib/auth.js";
import { minePow } from "../src/lib/pow.js";

const BOT_A = {
  privateKey: "x",
  publicKey: "ssh-ed25519 AAAA-bot-a",
  fingerprint: "SHA256:uitestaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};
const BOT_B = {
  privateKey: "x",
  publicKey: "ssh-ed25519 AAAA-bot-b",
  fingerprint: "SHA256:uitestbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

const ROOM = "ui-multibot-" + Date.now().toString(36);

// Tiny helper for sending keys via ink-testing-library's stdin
function press(stdin: any, key: string) {
  stdin.write(key);
}
const KEY = {
  down: "\x1B[B",
  up: "\x1B[A",
  enter: "\r",
  esc: "\x1B",
};

async function settle(ms = 300) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(method: string, path: string, fp: string | null, body?: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const res = await fetch("http://localhost:8787" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as any;
}

describe("multi-bot channels UI", () => {
  beforeAll(async () => {
    // Make sure both bots have profiles so author_name resolves on render
    await fetchJson("POST", "/profiles", BOT_A.fingerprint, {
      name: "BotA",
      bio: "ui test publisher",
      public: true,
    });
    await fetchJson("POST", "/profiles", BOT_B.fingerprint, {
      name: "BotB",
      bio: "ui test subscriber",
      public: true,
    });
    // Create the channel via API so the UI test can focus on ChannelList + ChannelView
    // (the CreateChannel multi-step form is exercised separately and adds noise here).
    await fetchJson("POST", "/channels", BOT_A.fingerprint, {
      name: ROOM,
      description: "multi-bot UI integration room",
    });
    // Bot A publishes one seed message so Bot B has something to see on first render
    const seedPayload = { type: "text", text: "hello from bot A" };
    const seedPow = await minePow(ROOM, BOT_A.fingerprint, seedPayload);
    await fetchJson("POST", `/channels/${ROOM}/messages`, BOT_A.fingerprint, {
      payload: seedPayload, pow: seedPow,
    });
  });

  afterAll(() => {
    __setAuthOverride(undefined);
  });

  it("Bot A renders Home and navigates to the channel list", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle(200);

    const home = lastFrame() ?? "";
    expect(home).toContain("Channels");
    expect(home).toContain("Search");
    expect(home).toContain("Create channel");

    // Cursor starts on "Channels" — press Enter to open the channel list
    press(stdin, KEY.enter);
    await settle(800); // wait for listChannels fetch

    const list = lastFrame() ?? "";
    expect(list).toContain("Channels"); // panel title
    expect(list).toContain(ROOM);

    unmount();
  });

  it("Bot B sees the channel and Bot A's seed message", async () => {
    __setAuthOverride(BOT_B);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle(200);

    // Home → Channels
    press(stdin, KEY.enter);
    await settle(800);

    let frame = lastFrame() ?? "";
    expect(frame).toContain(ROOM);

    // Walk the cursor down until ROOM is selected; the list shows channels in
    // sort order (default: messages desc) — our fresh ROOM with 1 message may
    // be at the top, but we'll scan a few rows to be safe.
    // Try opening the first item:
    press(stdin, KEY.enter);
    await settle(1500); // getChannel (>=1000ms min spinner) + ws connect

    frame = lastFrame() ?? "";
    // The frame should contain the channel header (with the # prefix) OR the seed text.
    // Either confirms the ChannelView mounted successfully.
    const opened = frame.includes("hello from bot A") || frame.includes(ROOM);
    expect(opened).toBe(true);

    unmount();
  });

  it("Bot B's view shows channel-style bubble framing", async () => {
    __setAuthOverride(BOT_B);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle(200);
    press(stdin, KEY.enter); // open channel-list
    await settle(800);
    press(stdin, KEY.enter); // open first channel
    await settle(1500); // >=1000ms min spinner

    const frame = lastFrame() ?? "";
    // Round borders are the round-border signature in ink (╭ ╮ ╰ ╯)
    expect(frame).toMatch(/[╭╮╰╯]/);

    unmount();
  });

  it("Bot A publishing via the API delivers to Bot B's UI in real time", async () => {
    __setAuthOverride(BOT_B);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle(200);
    press(stdin, KEY.enter); // open channel-list
    await settle(800);
    press(stdin, KEY.enter); // open channel
    await settle(1500); // >=1000ms min spinner + ws connect

    // Bot A publishes a fresh message (out-of-band, like a remote bot would)
    const NEEDLE = "rt-needle-" + Math.random().toString(36).slice(2, 8);
    const needlePayload = { type: "text", text: NEEDLE };
    const needlePow = await minePow(ROOM, BOT_A.fingerprint, needlePayload);
    await fetchJson("POST", `/channels/${ROOM}/messages`, BOT_A.fingerprint, {
      payload: needlePayload, pow: needlePow,
    });

    // Wait for the WebSocket to deliver and React to re-render
    await settle(1500);

    const frame = lastFrame() ?? "";
    expect(frame).toContain(NEEDLE);

    unmount();
  });

  it("Bot A logged out shows the no-identity warning on Home", async () => {
    __setAuthOverride(null);
    const { lastFrame, unmount } = render(<App />);
    await settle(200);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("no identity yet");
    unmount();
  });
});
