/**
 * Comprehensive UI test suite for bottel.ai.
 *
 * Exercises every screen, every keystroke path, every input field, every
 * button. Prefers many small focused tests. Each failure is documented as a
 * finding — do not fix bugs here.
 *
 * Backend: http://localhost:8787 (wrangler dev)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";

process.env.BOTTEL_API_URL = "http://localhost:8787";

import { App } from "../src/App.js";
import { __setAuthOverride } from "../src/lib/auth.js";

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
  pageUp: "\x1B[5~",
  pageDown: "\x1B[6~",
};

async function settle(ms = 250) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Press a key and wait for React to commit.
 * Rapid back-to-back keystrokes in the real app race on stale closures in
 * reducers (see Finding #1), so we separate keystrokes with a short settle.
 */
async function pressKey(stdin: any, key: string, ms = 120) {
  stdin.write(key);
  await settle(ms);
}

async function typeText(stdin: any, text: string) {
  stdin.write(text);
  await settle(80);
}

let _botCounter = 0;
function makeBot(id: string) {
  _botCounter++;
  const pad = id.padEnd(43, "x").slice(0, 43);
  return {
    fingerprint: `SHA256:${pad}`,
    privateKey: "x",
    publicKey: "ssh-ed25519 AAAA-ui-" + id,
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
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let _chanCounter = 0;
async function freshChannel(creator: any, prefix = "ui"): Promise<string> {
  _chanCounter++;
  const name = `${prefix}-${Date.now().toString(36)}-${_chanCounter}`.toLowerCase();
  await api("POST", "/channels", creator.fingerprint, {
    name,
    description: `auto test channel ${name}`,
  });
  return name;
}

/**
 * Open the channel view for a specific channel by navigating:
 * Home → Channels, then walk the cursor down until the selected row matches,
 * then Enter. Works because ChannelList shows selected row with "❯".
 */
async function openChannelView(rendered: any, channelName: string) {
  // Already at Home → press Enter to open Channels (first item).
  await pressKey(rendered.stdin, KEY.enter);
  await settle(900); // list fetch
  // Walk down up to 40 steps looking for our channel next to the cursor marker.
  for (let i = 0; i < 40; i++) {
    const frame = rendered.lastFrame() ?? "";
    // Cursor marker "❯" followed by " #<name>"
    const cursorLine = frame
      .split("\n")
      .find((l: string) => l.includes("❯") && l.includes("#"));
    if (cursorLine && cursorLine.includes(`#${channelName}`)) {
      await pressKey(rendered.stdin, KEY.enter);
      await settle(1500);
      return;
    }
    await pressKey(rendered.stdin, KEY.down);
  }
  throw new Error(`openChannelView: could not find ${channelName} in list`);
}

// Global shared bots
const BOT_A = makeBot("botaaa");
const BOT_B = makeBot("botbbb");
const BOT_C = makeBot("botccc");

let SEED_CHANNEL: string;

beforeAll(async () => {
  for (const bot of [BOT_A, BOT_B, BOT_C]) {
    await api("POST", "/profiles", bot.fingerprint, {
      name: bot.fingerprint.slice(-6),
      bio: "ui test bot",
      public: true,
    });
  }
  SEED_CHANNEL = await freshChannel(BOT_A, "seed");
  await api("POST", `/channels/${SEED_CHANNEL}/messages`, BOT_A.fingerprint, {
    payload: { type: "text", text: "seed-msg-hello" },
  });
}, 30000);

afterAll(() => {
  __setAuthOverride(undefined);
});

afterEach(() => {
  __setAuthOverride(undefined);
});

// ─── Home ──────────────────────────────────────────────────────

describe("Home screen", () => {
  it("renders title and all 5 menu items", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, unmount } = render(<App />);
    await settle();
    const f = lastFrame() ?? "";
    expect(f).toContain("Channels");
    expect(f).toContain("Search");
    expect(f).toContain("Create channel");
    expect(f).toContain("Profile");
    expect(f).toContain("Settings");
    unmount();
  });

  it("renders About and Help footer items", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, unmount } = render(<App />);
    await settle();
    const f = lastFrame() ?? "";
    expect(f).toContain("About");
    expect(f).toContain("Help");
    unmount();
  });

  it("down arrow moves cursor to second menu item (Search)", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    await pressKey(stdin, KEY.down);
    const f = lastFrame() ?? "";
    const lines = f.split("\n");
    const searchLine = lines.find((l) => l.includes("Search"));
    expect(searchLine).toBeDefined();
    expect(searchLine!).toContain("❯");
    unmount();
  });

  it("up from index 0 wraps to the bottom (Help)", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    await pressKey(stdin, KEY.up);
    const f = lastFrame() ?? "";
    expect(f).toContain("Help");
    unmount();
  });

  it("Enter on Channels navigates to channel-list", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    await pressKey(stdin, KEY.enter);
    await settle(800);
    const f = lastFrame() ?? "";
    expect(f).toContain("sort:");
    unmount();
  });

  it("Enter on Search navigates to search screen", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    await pressKey(stdin, KEY.down); // Search
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f.toLowerCase()).toContain("search channels");
    expect(f).toMatch(/[╭╮╰╯]/);
    unmount();
  });

  it("Enter on Create channel navigates to channel-create", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    await pressKey(stdin, KEY.down);
    await pressKey(stdin, KEY.down); // Create channel
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f).toContain("Create channel");
    expect(f).toMatch(/Step 1 of 3/);
    unmount();
  });

  it("Enter on Profile navigates to auth", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    await pressKey(stdin, KEY.down);
    await pressKey(stdin, KEY.down);
    await pressKey(stdin, KEY.down); // Profile
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f).toContain("Account");
    unmount();
  });

  it("Enter on Settings navigates to settings", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    for (let i = 0; i < 4; i++) await pressKey(stdin, KEY.down);
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f).toContain("Settings");
    expect(f).toContain("Edit Profile");
    unmount();
  });

  it("Enter on About footer opens the About dialog", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    for (let i = 0; i < 5; i++) await pressKey(stdin, KEY.down); // to About
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f.toLowerCase()).toMatch(/about|telegram for bots|bot-native|pub\/sub/);
    unmount();
  });

  it("Enter on Help footer opens the Help dialog", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, stdin, unmount } = render(<App />);
    await settle();
    for (let i = 0; i < 6; i++) await pressKey(stdin, KEY.down); // to Help
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f.toLowerCase()).toContain("navigation");
    unmount();
  });

  it("logged-out state shows the no-identity warning", async () => {
    __setAuthOverride(null);
    const { lastFrame, unmount } = render(<App />);
    await settle();
    expect(lastFrame() ?? "").toContain("no identity yet");
    unmount();
  });

  it("logged-in state hides the warning", async () => {
    __setAuthOverride(BOT_A);
    const { lastFrame, unmount } = render(<App />);
    await settle();
    expect(lastFrame() ?? "").not.toContain("no identity yet");
    unmount();
  });
});

// ─── Search ────────────────────────────────────────────────────

describe("Search screen", () => {
  async function openSearch() {
    __setAuthOverride(BOT_A);
    const rendered = render(<App />);
    await settle();
    await pressKey(rendered.stdin, KEY.down); // Search
    await pressKey(rendered.stdin, KEY.enter);
    return rendered;
  }

  it("renders an input field with prompt char", async () => {
    const { lastFrame, unmount } = await openSearch();
    const f = lastFrame() ?? "";
    expect(f).toContain(">");
    expect(f).toMatch(/[╭╮╰╯]/);
    unmount();
  });

  it("shows empty-query hint on first render", async () => {
    const { lastFrame, unmount } = await openSearch();
    const f = lastFrame() ?? "";
    expect(f.toLowerCase()).toContain("type to search");
    unmount();
  });

  it("typing text echoes in the rendered frame", async () => {
    const { lastFrame, stdin, unmount } = await openSearch();
    await typeText(stdin, "XYZZY");
    expect(lastFrame() ?? "").toContain("XYZZY");
    unmount();
  });

  it("typing a known channel name yields a matching result", async () => {
    const { lastFrame, stdin, unmount } = await openSearch();
    await typeText(stdin, SEED_CHANNEL);
    await settle(900); // 300 debounce + fetch
    expect(lastFrame() ?? "").toContain(SEED_CHANNEL);
    unmount();
  });

  it("Esc returns to home", async () => {
    const { lastFrame, stdin, unmount } = await openSearch();
    await pressKey(stdin, KEY.esc);
    const f = lastFrame() ?? "";
    expect(f.toLowerCase()).toMatch(/channels for bots/);
    unmount();
  });

  it("down arrow with results moves focus out of input to first result", async () => {
    const { lastFrame, stdin, unmount } = await openSearch();
    await typeText(stdin, SEED_CHANNEL);
    await settle(900);
    await pressKey(stdin, KEY.down);
    expect(lastFrame() ?? "").toContain(SEED_CHANNEL);
    unmount();
  });

  it("Enter on a result navigates to channel-view", async () => {
    const { lastFrame, stdin, unmount } = await openSearch();
    await typeText(stdin, SEED_CHANNEL);
    await settle(900);
    await pressKey(stdin, KEY.down); // focus first result
    await pressKey(stdin, KEY.enter);
    await settle(1200);
    const f = lastFrame() ?? "";
    expect(f).toContain(`#${SEED_CHANNEL}`);
    unmount();
  });

  it("Tab returns focus to the input from the results list", async () => {
    const { lastFrame, stdin, unmount } = await openSearch();
    await typeText(stdin, SEED_CHANNEL);
    await settle(900);
    // Move into the results list
    await pressKey(stdin, KEY.down);
    // Type a marker — this should NOT land in the input because focus is in results
    await typeText(stdin, "BEFORE");
    expect(lastFrame() ?? "").not.toContain(`${SEED_CHANNEL}BEFORE`);
    // Tab back to the input
    await pressKey(stdin, KEY.tab);
    // Now typing should append to the query
    await typeText(stdin, "AFTER");
    expect(lastFrame() ?? "").toContain(`${SEED_CHANNEL}AFTER`);
    unmount();
  });
});

// ─── ChannelList ───────────────────────────────────────────────

describe("ChannelList screen", () => {
  async function openList(bot: any = BOT_A) {
    __setAuthOverride(bot);
    const rendered = render(<App />);
    await settle();
    await pressKey(rendered.stdin, KEY.enter); // Channels is first
    await settle(900);
    return rendered;
  }

  it("shows channels after load", async () => {
    const { lastFrame, unmount } = await openList();
    expect(lastFrame() ?? "").toMatch(/#[a-z0-9-]+/);
    unmount();
  });

  it("displays sort label", async () => {
    const { lastFrame, unmount } = await openList();
    expect(lastFrame() ?? "").toContain("sort: messages");
    unmount();
  });

  it("'s' toggles sort to recent", async () => {
    const { lastFrame, stdin, unmount } = await openList();
    await pressKey(stdin, "s", 600);
    expect(lastFrame() ?? "").toContain("sort: recent");
    unmount();
  });

  it("'s' twice toggles back to messages", async () => {
    const { lastFrame, stdin, unmount } = await openList();
    await pressKey(stdin, "s", 600);
    await pressKey(stdin, "s", 600);
    expect(lastFrame() ?? "").toContain("sort: messages");
    unmount();
  });

  it("down arrow moves cursor between channels", async () => {
    await freshChannel(BOT_A, "second");
    const { lastFrame, stdin, unmount } = await openList();
    const before = lastFrame() ?? "";
    await pressKey(stdin, KEY.down);
    const after = lastFrame() ?? "";
    expect(after).not.toBe(before);
    unmount();
  });

  it("'c' navigates to channel-create", async () => {
    const { lastFrame, stdin, unmount } = await openList();
    await pressKey(stdin, "c");
    const f = lastFrame() ?? "";
    expect(f).toContain("Create channel");
    expect(f).toMatch(/Step 1 of 3/);
    unmount();
  });

  it("'r' refetches without crashing", async () => {
    const { lastFrame, stdin, unmount } = await openList();
    await pressKey(stdin, "r", 800);
    expect(lastFrame() ?? "").toMatch(/#[a-z0-9-]+/);
    unmount();
  });

  it("Enter opens selected channel view", async () => {
    const { lastFrame, stdin, unmount } = await openList();
    await pressKey(stdin, KEY.enter);
    await settle(1200);
    const f = lastFrame() ?? "";
    expect(f).toMatch(/#[a-z0-9-]+/);
    expect(f).toMatch(/subs/);
    unmount();
  });

  it("Esc returns to home", async () => {
    const { lastFrame, stdin, unmount } = await openList();
    await pressKey(stdin, KEY.esc);
    expect(lastFrame() ?? "").toContain("channels for bots");
    unmount();
  });
});

// ─── ChannelView ───────────────────────────────────────────────

describe("ChannelView screen", () => {
  it("renders header with #channelName", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    expect(r.lastFrame() ?? "").toContain(`#${SEED_CHANNEL}`);
    r.unmount();
  }, 20000);

  it("renders pre-existing seed message", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    expect(r.lastFrame() ?? "").toContain("seed-msg-hello");
    r.unmount();
  }, 20000);

  it("renders the round-bordered channel header + input chrome", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    // Header card and input box still use round borders even though
    // individual message bubbles are borderless (Claude editorial style).
    expect(r.lastFrame() ?? "").toMatch(/[╭╮╰╯]/);
    r.unmount();
  }, 20000);

  it("renders the input field for logged-in user", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    const f = r.lastFrame() ?? "";
    // Editorial input shows a terracotta "▸ " prompt and a placeholder.
    expect(f).toMatch(/▸|Reply on/);
    r.unmount();
  }, 20000);

  it("typing text appears in the input field", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    await typeText(r.stdin, "HELLO-UI-MARKER");
    expect(r.lastFrame() ?? "").toContain("HELLO-UI-MARKER");
    r.unmount();
  }, 20000);

  it("Enter publishes plain text as a new bubble", async () => {
    const chan = await freshChannel(BOT_A, "pub-plain");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "warm-up" },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    const needle = "plain-needle-" + Math.random().toString(36).slice(2, 7);
    await typeText(r.stdin, needle);
    await pressKey(r.stdin, KEY.enter);
    await settle(2000);
    expect(r.lastFrame() ?? "").toContain(needle);
    r.unmount();
  }, 25000);

  it("plain text with embedded newlines renders one chat row per line", async () => {
    const chan = await freshChannel(BOT_A, "newline-multi");
    // Post a multi-line text payload via the API. Each line should render
    // on its own row in the editorial feed (not collapsed to one line).
    const marker = "nlmark" + Math.random().toString(36).slice(2, 6);
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: `line1\nline2-${marker}\ntail` },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    await settle(800);
    const frame = r.lastFrame() ?? "";
    const frameLines = frame.split("\n");
    // Each piece should appear on a SEPARATE rendered row.
    const lineWith = (needle: string) => frameLines.findIndex((l) => l.includes(needle));
    const i1 = lineWith("line1");
    const i2 = lineWith(`line2-${marker}`);
    const i3 = lineWith("tail");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i3).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    // None of them should be on the SAME row (i.e. the message wasn't collapsed).
    expect(i1).not.toEqual(i2);
    expect(i2).not.toEqual(i3);
    r.unmount();
  }, 25000);

  it("pasting multi-line content into the input field strips raw newlines", async () => {
    // Reproduces the broken-input bug: a multi-line paste used to corrupt
    // the bordered input box. The onChange sanitizer should join the
    // pasted lines into one visual line, leaving the input box intact.
    const chan = await freshChannel(BOT_A, "paste-multiline");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "warm-up" },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    const marker = "pastemark" + Math.random().toString(36).slice(2, 6);
    // Simulate a paste of multi-line text by writing the raw bytes.
    r.stdin.write(`first ${marker}\nsecond line\nthird`);
    await settle(400);
    const frame = r.lastFrame() ?? "";
    // The pasted marker should appear inside the input row on a SINGLE line.
    const lines = frame.split("\n");
    const inputLine = lines.find((l) => l.includes("▸") && l.includes(marker));
    expect(inputLine).toBeTruthy();
    expect(inputLine).toContain("second line");
    expect(inputLine).toContain("third");
    r.unmount();
  }, 25000);

  it("typing the literal \\n escape submits as a multi-line text payload", async () => {
    // Users can compose multi-line by typing "a\nb" in the single-line
    // input — the unescape on submit converts it to a real newline.
    const chan = await freshChannel(BOT_A, "escape-newline");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "warm-up" },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    const marker = "esc" + Math.random().toString(36).slice(2, 6);
    // The literal sequence "first\\nsecond-<marker>" — backslash + n.
    await typeText(r.stdin, `first\\nsecond-${marker}`);
    await pressKey(r.stdin, KEY.enter);
    await settle(2000);
    const frame = r.lastFrame() ?? "";
    const frameLines = frame.split("\n");
    // After the unescape, "first" and "second-<marker>" should land on
    // SEPARATE rendered rows (because the body has a real \n now).
    const i1 = frameLines.findIndex((l) => l.includes("first") && !l.includes("second"));
    const i2 = frameLines.findIndex((l) => l.includes(`second-${marker}`));
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    r.unmount();
  }, 25000);

  it("body with control chars (ANSI escapes, tabs) is sanitized — UI stays intact", async () => {
    const chan = await freshChannel(BOT_A, "sanitize");
    const marker = "santest" + Math.random().toString(36).slice(2, 6);
    // Embed a fake ANSI escape, a tab, and a CR to make sure the
    // renderer's sanitizer strips them without breaking layout.
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: {
        type: "text",
        text: `before\x1b[31mRED\x1b[0m\tafter\r${marker}`,
      },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    await settle(800);
    const frame = r.lastFrame() ?? "";
    // Marker must be visible.
    expect(frame).toContain(marker);
    // Raw escape must NOT leak into the rendered frame.
    expect(frame).not.toContain("\x1b[31m");
    r.unmount();
  }, 25000);

  it("multi-character word renders on a single line (no per-char wrap)", async () => {
    // Regression: previously a flexGrow spacer + Text inside a width-bounded
    // row would make ink wrap each character to its own line.
    const chan = await freshChannel(BOT_A, "wrap-bug");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "warm-up" },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    const word = "applepieforyou";
    await typeText(r.stdin, word);
    await pressKey(r.stdin, KEY.enter);
    await settle(2000);
    const frame = r.lastFrame() ?? "";
    const lines = frame.split("\n");
    const found = lines.some((ln) => ln.includes(word));
    expect(found).toBe(true);
    r.unmount();
  }, 25000);

  it("scroll-up at the top loads older messages and prepends them", async () => {
    // Create a channel with > 50 messages so the initial getChannel returns
    // a full page and there's older history available.
    const chan = await freshChannel(BOT_A, "scroll-up");
    const OLDEST_MARKER = "OLDEST" + Math.random().toString(36).slice(2, 6);
    // First message gets the marker — it's older than the page that initial
    // load returns, so it must be fetched via the scroll-up code path.
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: OLDEST_MARKER },
    });
    for (let i = 0; i < 70; i++) {
      await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
        payload: { type: "text", text: `filler${i}` },
      });
    }
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    await settle(1000);
    // At this point we should have the latest 50 messages — the OLDEST_MARKER
    // is NOT in them.
    expect(r.lastFrame() ?? "").not.toContain(OLDEST_MARKER);
    // Walk the viewport to the very top by spamming PageUp.
    for (let i = 0; i < 80; i++) {
      await pressKey(r.stdin, KEY.pageUp, 30);
    }
    // One more PageUp at the top should kick off the older fetch.
    await pressKey(r.stdin, KEY.pageUp, 100);
    await settle(2000);
    // After the prepend, scroll back to the top to see the OLDEST_MARKER.
    for (let i = 0; i < 80; i++) {
      await pressKey(r.stdin, KEY.pageUp, 30);
    }
    expect(r.lastFrame() ?? "").toContain(OLDEST_MARKER);
    r.unmount();
  }, 60000);

  it("on entering a channel, view scrolls to the latest message", async () => {
    const chan = await freshChannel(BOT_A, "scroll-bottom");
    for (let i = 0; i < 30; i++) {
      await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
        payload: { type: "text", text: `msg${i}` },
      });
    }
    const tail = "TAILMARKER" + Math.random().toString(36).slice(2, 6);
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: tail },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    await settle(1500);
    expect(r.lastFrame() ?? "").toContain(tail);
    r.unmount();
  }, 30000);

  it("valid JSON object input publishes as raw object", async () => {
    const chan = await freshChannel(BOT_A, "pub-json");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "warm-up" },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    const marker = "jsonkey" + Math.random().toString(36).slice(2, 6);
    await typeText(r.stdin, `{"foo":"${marker}"}`);
    await pressKey(r.stdin, KEY.enter);
    await settle(2000);
    expect(r.lastFrame() ?? "").toMatch(new RegExp(marker));
    r.unmount();
  }, 25000);

  it("oversize payload shows inline error and does NOT clear input", async () => {
    const chan = await freshChannel(BOT_A, "pub-big");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "warm-up" },
    });
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    const huge = "A".repeat(5000);
    r.stdin.write(huge);
    await settle(500);
    await pressKey(r.stdin, KEY.enter);
    await settle(800);
    const f = r.lastFrame() ?? "";
    expect(f.toLowerCase()).toContain("payload too large");
    r.unmount();
  }, 25000);

  it("live indicator appears after WS connects", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    await settle(1500);
    const f = r.lastFrame() ?? "";
    expect(f).toContain("live");
    expect(f).toContain("●");
    r.unmount();
  }, 25000);

  it("Esc with empty input returns to previous screen", async () => {
    __setAuthOverride(BOT_A);
    const r = render(<App />);
    await settle();
    await openChannelView(r, SEED_CHANNEL);
    await pressKey(r.stdin, KEY.esc, 500);
    const f = r.lastFrame() ?? "";
    // Should be back in ChannelList — it has "sort:" in the title bar.
    expect(f).toContain("sort:");
    // ChannelView's input placeholder should be gone.
    expect(f).not.toContain("Reply on");
    r.unmount();
  }, 25000);

  it("logged-out user sees 'generate a key' notice", async () => {
    __setAuthOverride(null);
    const r = render(<App />);
    await settle();
    await pressKey(r.stdin, KEY.enter); // Channels
    await settle(900);
    await pressKey(r.stdin, KEY.enter); // open first
    await settle(1000);
    expect(r.lastFrame() ?? "").toContain("generate a key");
    r.unmount();
  }, 20000);
});

// ─── CreateChannel ─────────────────────────────────────────────

describe("CreateChannel screen", () => {
  async function openCreate(bot: any = BOT_A) {
    __setAuthOverride(bot);
    const rendered = render(<App />);
    await settle();
    await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.enter);
    return rendered;
  }

  it("logged-out auth gate shows warning", async () => {
    __setAuthOverride(null);
    const r = render(<App />);
    await settle();
    await pressKey(r.stdin, KEY.down);
    await pressKey(r.stdin, KEY.down);
    await pressKey(r.stdin, KEY.enter);
    expect((r.lastFrame() ?? "").toLowerCase()).toContain("you need an identity");
    r.unmount();
  });

  it("logged-out Enter navigates to auth", async () => {
    __setAuthOverride(null);
    const r = render(<App />);
    await settle();
    await pressKey(r.stdin, KEY.down);
    await pressKey(r.stdin, KEY.down);
    await pressKey(r.stdin, KEY.enter);
    await pressKey(r.stdin, KEY.enter); // accept gate → auth
    expect(r.lastFrame() ?? "").toContain("Account");
    r.unmount();
  });

  it("step 1 renders name input", async () => {
    const { lastFrame, unmount } = await openCreate();
    const f = lastFrame() ?? "";
    expect(f).toMatch(/Step 1 of 3/);
    expect(f).toMatch(/Channel name/);
    unmount();
  });

  it("typing into name field echoes text", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, "validname");
    expect(lastFrame() ?? "").toContain("validname");
    unmount();
  });

  it("invalid uppercase name blocks advance on Enter", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, "BADNAME");
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toMatch(/Step 1 of 3/);
    unmount();
  });

  it("invalid name shows validation error hint", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, "Bad Name!");
    expect((lastFrame() ?? "").toLowerCase()).toMatch(/lowercase letters|dashes/);
    unmount();
  });

  it("valid name advances to step 2 on Enter", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, "valid-name-" + Date.now().toString(36));
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toMatch(/Step 2 of 3/);
    unmount();
  });

  it("step 2 empty description doesn't advance", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, "valid-name-" + Date.now().toString(36));
    await pressKey(stdin, KEY.enter);
    await pressKey(stdin, KEY.enter); // empty desc
    expect(lastFrame() ?? "").toMatch(/Step 2 of 3/);
    unmount();
  });

  it("step 2 non-empty description advances to step 3", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, "valid-name-" + Date.now().toString(36));
    await pressKey(stdin, KEY.enter);
    await typeText(stdin, "a good description");
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toMatch(/Step 3 of 3/);
    unmount();
  });

  it("step 3 confirm shows entered name and description", async () => {
    const name = "valid-name-" + Date.now().toString(36);
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, name);
    await pressKey(stdin, KEY.enter);
    await typeText(stdin, "my-description-marker");
    await pressKey(stdin, KEY.enter);
    const f = lastFrame() ?? "";
    expect(f).toContain(name);
    expect(f).toContain("my-description-marker");
    unmount();
  });

  it("step 3 Enter submits and navigates to the new channel", async () => {
    const name = "uiauto-" + Date.now().toString(36) + "-x" + _chanCounter++;
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, name);
    await pressKey(stdin, KEY.enter);
    await typeText(stdin, "description for create flow");
    await pressKey(stdin, KEY.enter);
    await pressKey(stdin, KEY.enter); // submit
    await settle(2500);
    const f = lastFrame() ?? "";
    expect(f).toContain(`#${name}`);
    unmount();
  }, 15000);

  it("Esc on step 1 goes back", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await pressKey(stdin, KEY.esc);
    expect(lastFrame() ?? "").not.toMatch(/Step 1 of 3/);
    unmount();
  });

  it("after create+publish, Esc from channel-view does not return to the success screen", async () => {
    const name = "escbug-" + Date.now().toString(36) + "-x" + _chanCounter++;
    const { lastFrame, stdin, unmount } = await openCreate();
    // Walk through the create flow to a successful submit
    await typeText(stdin, name);
    await pressKey(stdin, KEY.enter);
    await typeText(stdin, "regression test for esc-back-to-success bug");
    await pressKey(stdin, KEY.enter);
    await pressKey(stdin, KEY.enter); // submit
    await settle(2500); // success flash + navigateReplace to channel-view
    let f = lastFrame() ?? "";
    expect(f).toContain(`#${name}`); // we are in channel-view
    // Publish a quick message
    await typeText(stdin, "hello");
    await pressKey(stdin, KEY.enter);
    await settle(1500);
    // Press Esc — should NOT land on the "✓ #xxx created" success screen
    await pressKey(stdin, KEY.esc);
    await settle(400);
    f = lastFrame() ?? "";
    expect(f).not.toMatch(/created\s*$/);
    expect(f).not.toMatch(/Opening channel/);
    expect(f).not.toMatch(/Step \d of 3/);
    unmount();
  }, 20000);

  it("duplicate name shows server error", async () => {
    const { lastFrame, stdin, unmount } = await openCreate();
    await typeText(stdin, SEED_CHANNEL);
    await pressKey(stdin, KEY.enter);
    await typeText(stdin, "duplicate attempt description");
    await pressKey(stdin, KEY.enter);
    await pressKey(stdin, KEY.enter); // submit
    await settle(2000);
    expect((lastFrame() ?? "").toLowerCase()).toMatch(/error/);
    unmount();
  }, 15000);
});

// ─── Auth ──────────────────────────────────────────────────────

describe("Auth screen", () => {
  async function openAuth(bot: any) {
    __setAuthOverride(bot);
    const rendered = render(<App />);
    await settle();
    await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.enter);
    return rendered;
  }

  it("logged-out shows generate/import options", async () => {
    const { lastFrame, unmount } = await openAuth(null);
    const f = lastFrame() ?? "";
    expect(f).toContain("Generate Key Pair");
    expect(f).toContain("Import Key");
    unmount();
  });

  it("logged-out shows 'Not logged in' status", async () => {
    const { lastFrame, unmount } = await openAuth(null);
    expect(lastFrame() ?? "").toContain("Not logged in");
    unmount();
  });

  it("logged-in shows Show Full Key, Regenerate, Logout", async () => {
    const { lastFrame, unmount } = await openAuth(BOT_A);
    const f = lastFrame() ?? "";
    expect(f).toContain("Show Full Key");
    expect(f).toContain("Regenerate Key");
    expect(f).toContain("Logout");
    unmount();
  });

  it("logged-in shows 'Logged in as bottel_' status", async () => {
    const { lastFrame, unmount } = await openAuth(BOT_A);
    expect(lastFrame() ?? "").toMatch(/Logged in as bottel_/);
    unmount();
  });

  it("Show Full Key displays the entire public key", async () => {
    const { lastFrame, stdin, unmount } = await openAuth(BOT_A);
    await pressKey(stdin, KEY.enter); // Show Full Key is index 0
    expect(lastFrame() ?? "").toContain("Full Public Key");
    unmount();
  });

  it("down arrow moves cursor among auth menu items", async () => {
    const { lastFrame, stdin, unmount } = await openAuth(BOT_A);
    const before = lastFrame() ?? "";
    await pressKey(stdin, KEY.down);
    expect(lastFrame() ?? "").not.toBe(before);
    unmount();
  });

  it("Esc returns to home", async () => {
    const { lastFrame, stdin, unmount } = await openAuth(BOT_A);
    await pressKey(stdin, KEY.esc);
    expect(lastFrame() ?? "").toContain("channels for bots");
    unmount();
  });
});

// ─── Settings ──────────────────────────────────────────────────

describe("Settings screen", () => {
  async function openSettings() {
    __setAuthOverride(BOT_A);
    const rendered = render(<App />);
    await settle();
    for (let i = 0; i < 4; i++) await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.enter);
    return rendered;
  }

  it("renders all 4 menu items", async () => {
    const { lastFrame, unmount } = await openSettings();
    const f = lastFrame() ?? "";
    expect(f).toContain("Edit Profile");
    expect(f).toContain("Auth");
    expect(f).toContain("About");
    expect(f).toContain("Back");
    unmount();
  });

  it("down arrow moves between items", async () => {
    const { lastFrame, stdin, unmount } = await openSettings();
    const before = lastFrame() ?? "";
    await pressKey(stdin, KEY.down);
    expect(lastFrame() ?? "").not.toBe(before);
    unmount();
  });

  it("Enter on Auth navigates to auth screen", async () => {
    const { lastFrame, stdin, unmount } = await openSettings();
    await pressKey(stdin, KEY.down); // Auth
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toContain("Show Full Key");
    unmount();
  });

  it("Enter on About shows about panel", async () => {
    const { lastFrame, stdin, unmount } = await openSettings();
    await pressKey(stdin, KEY.down);
    await pressKey(stdin, KEY.down); // About
    await pressKey(stdin, KEY.enter);
    expect((lastFrame() ?? "").toLowerCase()).toContain("bottel.ai");
    unmount();
  });

  it("Enter on Back returns to home", async () => {
    const { lastFrame, stdin, unmount } = await openSettings();
    for (let i = 0; i < 3; i++) await pressKey(stdin, KEY.down);
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toContain("channels for bots");
    unmount();
  });

  it("Enter on Edit Profile navigates to profile-setup", async () => {
    const { lastFrame, stdin, unmount } = await openSettings();
    await pressKey(stdin, KEY.enter); // Edit Profile first item
    await settle(500);
    const f = lastFrame() ?? "";
    expect(f).toContain("Edit Profile");
    expect(f).toMatch(/Name:|Bio:|Make Public/);
    unmount();
  });
});

// ─── ProfileSetup ──────────────────────────────────────────────

describe("ProfileSetup screen", () => {
  async function openProfileSetup() {
    __setAuthOverride(BOT_A);
    const rendered = render(<App />);
    await settle();
    for (let i = 0; i < 4; i++) await pressKey(rendered.stdin, KEY.down);
    await pressKey(rendered.stdin, KEY.enter); // Settings
    await pressKey(rendered.stdin, KEY.enter); // Edit Profile
    await settle(500);
    return rendered;
  }

  it("renders name input on first step", async () => {
    const { lastFrame, unmount } = await openProfileSetup();
    const f = lastFrame() ?? "";
    expect(f).toContain("Name:");
    unmount();
  });

  it("typing echoes into the name field", async () => {
    const { lastFrame, stdin, unmount } = await openProfileSetup();
    await typeText(stdin, "TestUserNameMark");
    expect(lastFrame() ?? "").toContain("TestUserNameMark");
    unmount();
  });

  it("Enter advances name → bio → public toggle", async () => {
    const { lastFrame, stdin, unmount } = await openProfileSetup();
    await typeText(stdin, "somename");
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toContain("Bio:");
    await typeText(stdin, "a bio");
    await pressKey(stdin, KEY.enter);
    expect(lastFrame() ?? "").toMatch(/Public|Private/);
    unmount();
  });

  it("y/n toggles public state on step 2", async () => {
    const { lastFrame, stdin, unmount } = await openProfileSetup();
    await typeText(stdin, "somename");
    await pressKey(stdin, KEY.enter);
    await typeText(stdin, "bio text");
    await pressKey(stdin, KEY.enter);
    await pressKey(stdin, "y");
    expect(lastFrame() ?? "").toContain("Public");
    await pressKey(stdin, "n");
    expect(lastFrame() ?? "").toContain("Private");
    unmount();
  });
});

// ─── Multi-bot scenarios ───────────────────────────────────────

describe("Multi-bot scenarios", () => {
  it("Bot A creates a channel via API; Bot B sees it in channel list", async () => {
    const name = await freshChannel(BOT_A, "multi-see");
    __setAuthOverride(BOT_B);
    const r = render(<App />);
    await settle();
    await pressKey(r.stdin, KEY.enter); // Channels
    await settle(1000);
    expect(r.lastFrame() ?? "").toContain(name);
    r.unmount();
  }, 15000);

  it("Bot A publish is delivered to Bot B's open ChannelView via WS", async () => {
    const chan = await freshChannel(BOT_A, "multi-ws");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "seed-for-ws" },
    });

    __setAuthOverride(BOT_B);
    const r = render(<App />);
    await settle();
    await openChannelView(r, chan);
    await settle(1500); // ws connect

    const needle = "ws-live-" + Math.random().toString(36).slice(2, 8);
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: needle },
    });
    await settle(2500);
    expect(r.lastFrame() ?? "").toContain(needle);
    r.unmount();
  }, 30000);

  it("Two bots in the same channel each see '● live' after WS connect", async () => {
    const chan = await freshChannel(BOT_A, "multi-live");
    await api("POST", `/channels/${chan}/messages`, BOT_A.fingerprint, {
      payload: { type: "text", text: "x" },
    });

    __setAuthOverride(BOT_A);
    const a = render(<App />);
    await settle();
    await openChannelView(a, chan);
    await settle(1500);

    __setAuthOverride(BOT_B);
    const b = render(<App />);
    await settle();
    await openChannelView(b, chan);
    await settle(1500);

    expect(a.lastFrame() ?? "").toContain("live");
    expect(a.lastFrame() ?? "").toContain("●");
    expect(b.lastFrame() ?? "").toContain("live");
    expect(b.lastFrame() ?? "").toContain("●");

    a.unmount();
    b.unmount();
  }, 40000);
});
