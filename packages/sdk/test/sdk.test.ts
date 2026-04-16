/**
 * Comprehensive SDK integration tests for the BottelBot client.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *     (e.g. `wrangler dev` in the worker package).
 *
 * Run:
 *   npx vitest run test/sdk.test.ts
 */

import { createBot, uniqueName, sleep } from "./helpers.js";
import { describe, it, expect, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Shared bots used across multiple describe blocks
// ---------------------------------------------------------------------------

const bot1 = createBot("sdk-bot-1");
const bot2 = createBot("sdk-bot-2");

afterAll(() => {
  bot1.close();
  bot2.close();
});

// ===========================================================================
// 1. Identity
// ===========================================================================

describe("Identity", () => {
  it("fingerprint starts with SHA256:", () => {
    expect(bot1.fingerprint).toMatch(/^SHA256:/);
  });

  it("two bots with different configDirs have different fingerprints", () => {
    expect(bot1.fingerprint).not.toBe(bot2.fingerprint);
  });
});

// ===========================================================================
// 2. Profile Management
// ===========================================================================

describe("Profile Management", () => {
  const profileBot = createBot("profile-bot");
  const channelName = uniqueName("profile-setup");

  afterAll(() => profileBot.close());

  it("after createChannel, profile exists on server", async () => {
    await profileBot.createChannel(channelName, "profile test channel");

    const res = await fetch(
      `http://localhost:8787/profiles/${encodeURIComponent(profileBot.fingerprint)}`,
    );
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toBeDefined();
  });

  it("bot name is set correctly in profile", async () => {
    const res = await fetch(
      `http://localhost:8787/profiles/${encodeURIComponent(profileBot.fingerprint)}`,
    );
    const data: any = await res.json();
    expect(data.profile?.name ?? data.name).toBe("profile-bot");
  });
});

// ===========================================================================
// 3. Channels
// ===========================================================================

describe("Channels", () => {
  const chBot = createBot("channel-bot");
  const pubName = uniqueName("sdk-pub-ch");
  const privName = uniqueName("sdk-priv-ch");

  afterAll(() => chBot.close());

  it("createChannel returns channel with correct name", async () => {
    const ch = await chBot.createChannel(pubName, "public test channel");
    expect(ch).toBeDefined();
    expect(ch.name).toBe(pubName);
  });

  it("createChannel with isPublic=false creates private channel", async () => {
    const ch = await chBot.createChannel(privName, "private test channel", false);
    expect(ch).toBeDefined();
    expect(ch.name).toBe(privName);
  });

  it("channels() lists channels (length > 0)", async () => {
    const list = await chBot.channels();
    expect(list.length).toBeGreaterThan(0);
  });

  it("channels(query) filters by search term", async () => {
    const list = await chBot.channels(pubName);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((c: any) => c.name === pubName)).toBe(true);
  });

  it("channel(name) returns { channel, messages }", async () => {
    const result = await chBot.channel(pubName);
    expect(result.channel).toBeDefined();
    expect(result.channel.name).toBe(pubName);
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("channel('nonexistent-xxx') throws", async () => {
    await expect(chBot.channel("nonexistent-xxx")).rejects.toThrow();
  });
});

// ===========================================================================
// 4. Channel Messages
// ===========================================================================

describe("Channel Messages", () => {
  const msgBot = createBot("msg-bot");
  const chName = uniqueName("sdk-msg");

  afterAll(() => msgBot.close());

  it("publish returns message with expected fields", async () => {
    await msgBot.createChannel(chName, "message test");
    const msg = await msgBot.publish(chName, { hello: "world" });
    expect(msg.id).toBeTruthy();
    expect(msg.payload).toEqual({ hello: "world" });
    expect(msg.author).toBeTruthy();
    expect(msg.created_at).toBeTruthy();
  });

  it("publish with payload > 4KB throws", async () => {
    const bigPayload = { data: "x".repeat(5000) };
    await expect(msgBot.publish(chName, bigPayload)).rejects.toThrow(
      "Payload exceeds 4KB limit",
    );
  });

  it("multiple sequential publishes succeed", async () => {
    const msg1 = await msgBot.publish(chName, { seq: 1 });
    const msg2 = await msgBot.publish(chName, { seq: 2 });
    const msg3 = await msgBot.publish(chName, { seq: 3 });
    expect(msg1.id).toBeTruthy();
    expect(msg2.id).toBeTruthy();
    expect(msg3.id).toBeTruthy();
    // All messages should have distinct ids
    const ids = new Set([msg1.id, msg2.id, msg3.id]);
    expect(ids.size).toBe(3);
  });
});

// ===========================================================================
// 5. Channel Membership
// ===========================================================================

describe("Channel Membership", () => {
  const memBot = createBot("mem-bot");
  const chName = uniqueName("sdk-mem");

  afterAll(() => memBot.close());

  it("join on public channel returns 'active'", async () => {
    await memBot.createChannel(chName, "membership test");
    const status = await memBot.join(chName);
    expect(status).toBe("active");
  });

  it("join duplicate returns 'active'", async () => {
    const status = await memBot.join(chName);
    expect(status).toBe("active");
  });

  it("leave succeeds silently", async () => {
    await expect(memBot.leave(chName)).resolves.not.toThrow();
  });
});

// ===========================================================================
// 6. Channel WebSocket
// ===========================================================================

describe("Channel WebSocket", () => {
  const wsBot = createBot("ws-bot");
  const chName = uniqueName("sdk-ws");

  afterAll(() => wsBot.close());

  it(
    "subscribe receives live messages published by the same bot",
    async () => {
      await wsBot.createChannel(chName, "ws test");

      const received: any[] = [];
      wsBot.subscribe(chName, (msg) => received.push(msg));

      await sleep(1000);

      await wsBot.publish(chName, { live: true });

      await sleep(1500);

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].payload).toEqual({ live: true });
    },
    15000,
  );

  it(
    "unsubscribe stops receiving",
    async () => {
      const received: any[] = [];
      wsBot.subscribe(chName, (msg) => received.push(msg));

      await sleep(1000);

      wsBot.unsubscribe(chName);

      await wsBot.publish(chName, { after_unsub: true });

      await sleep(1500);

      expect(received.length).toBe(0);
    },
    15000,
  );
});

// ===========================================================================
// 7. Direct Chat
// ===========================================================================

describe("Direct Chat", () => {
  const botA = createBot("chat-bot-a");
  const botB = createBot("chat-bot-b");
  let chatId: string;

  afterAll(() => {
    botA.close();
    botB.close();
  });

  // Ensure both bots have profiles on the server before chat tests
  it("setup: ensure both bot profiles exist", async () => {
    const chA = uniqueName("chat-setup-a");
    const chB = uniqueName("chat-setup-b");
    await botA.createChannel(chA, "setup");
    await botB.createChannel(chB, "setup");
    expect(botA.fingerprint).not.toBe(botB.fingerprint);
  });

  it("startChat returns { id }", async () => {
    const chat = await botA.startChat(botB.fingerprint);
    expect(chat).toBeDefined();
    expect(chat.id).toBeTruthy();
    chatId = chat.id;
  });

  it("startChat again returns same chat id (dedup)", async () => {
    const chat = await botA.startChat(botB.fingerprint);
    expect(chat.id).toBe(chatId);
  });

  it("chats() lists the chat", async () => {
    const chatsA = await botA.chats();
    expect(chatsA.length).toBeGreaterThanOrEqual(1);
    const found = chatsA.find((c: any) => c.id === chatId);
    expect(found).toBeDefined();
  });

  it("sendMessage returns message with sender and content", async () => {
    const msg = await botA.sendMessage(chatId, "hello from A");
    expect(msg).toBeDefined();
    expect(msg.content).toBe("hello from A");
    expect(msg.sender).toBe(botA.fingerprint);
  });

  it(
    "subscribeDM receives live DMs",
    async () => {
      const received: any[] = [];
      botB.subscribeDM(chatId, (msg) => received.push(msg));

      await sleep(1000);

      await botA.sendMessage(chatId, "live dm test");

      await sleep(1500);

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].content).toBe("live dm test");
      expect(received[0].sender).toBe(botA.fingerprint);
    },
    15000,
  );

  it(
    "unsubscribeDM stops receiving",
    async () => {
      botB.unsubscribeDM(chatId);

      const received: any[] = [];
      botB.subscribeDM(chatId, (msg) => received.push(msg));

      await sleep(1000);

      botB.unsubscribeDM(chatId);

      await botA.sendMessage(chatId, "should not arrive");

      await sleep(1500);

      expect(received.length).toBe(0);
    },
    15000,
  );

  it("deleteChat by non-creator throws 403", async () => {
    await expect(botB.deleteChat(chatId)).rejects.toThrow(/403|forbidden/i);
  });

  it("deleteChat by creator succeeds", async () => {
    await botA.deleteChat(chatId);

    const chatsA = await botA.chats();
    const found = chatsA.find((c: any) => c.id === chatId);
    expect(found).toBeUndefined();
  });
});

// ===========================================================================
// 8. close()
// ===========================================================================

describe("close()", () => {
  it("terminates all connections without error", () => {
    const tempBot = createBot("close-test");
    expect(() => tempBot.close()).not.toThrow();
  });
});
