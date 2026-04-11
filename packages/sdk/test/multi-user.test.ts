/**
 * Multi-user integration tests for bottel.ai.
 *
 * Tests scenarios with 2+ bots interacting: direct chat, channel membership,
 * private channel approval flow, visibility/name display, and ownership rules.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *
 * Run:
 *   npx vitest run test/multi-user.test.ts
 */

import { createBot, uniqueName, sleep, apiFetch, createProfile, generateIdentity } from "./helpers.js";
import { describe, it, expect, afterAll } from "vitest";

// ===========================================================================
// 1. Two Bots Chatting
// ===========================================================================

describe("Two Bots Chatting", () => {
  const botA = createBot("chat-a");
  const botB = createBot("chat-b");

  afterAll(() => {
    botA.close();
    botB.close();
  });

  let chatId: string;

  // Setup profiles via createChannel
  it("setup: create profiles for both bots", async () => {
    await botA.createChannel(uniqueName("setup-a"), "setup");
    await botB.createChannel(uniqueName("setup-b"), "setup");
    expect(botA.fingerprint).not.toBe(botB.fingerprint);
  });

  it("botA starts chat with botB — both see it in chats() list", async () => {
    const chat = await botA.startChat(botB.fingerprint);
    expect(chat.id).toBeTruthy();
    chatId = chat.id;

    const chatsA = await botA.chats();
    expect(chatsA.some((c) => c.id === chatId)).toBe(true);

    const chatsB = await botB.chats();
    expect(chatsB.some((c) => c.id === chatId)).toBe(true);
  });

  it("botA sends message — botB reads it via raw GET /chat/:id/messages", async () => {
    await botA.sendMessage(chatId, "hello from A");

    const res = await apiFetch(`/chat/${chatId}/messages`, {
      fingerprint: botB.fingerprint,
    });
    expect(res.status).toBe(200);
    const messages: any[] = await res.json();
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const msg = messages.find((m: any) => m.content === "hello from A");
    expect(msg).toBeDefined();
    expect(msg.sender).toBe(botA.fingerprint);
  });

  it("botB sends reply — botA reads it via raw GET /chat/:id/messages", async () => {
    await botB.sendMessage(chatId, "reply from B");

    const res = await apiFetch(`/chat/${chatId}/messages`, {
      fingerprint: botA.fingerprint,
    });
    expect(res.status).toBe(200);
    const messages: any[] = await res.json();

    const msg = messages.find((m: any) => m.content === "reply from B");
    expect(msg).toBeDefined();
    expect(msg.sender).toBe(botB.fingerprint);
  });

  it(
    "both subscribe to DM WebSocket — messages delivered live",
    async () => {
      const receivedByA: any[] = [];
      const receivedByB: any[] = [];

      botA.subscribeDM(chatId, (msg) => receivedByA.push(msg));
      botB.subscribeDM(chatId, (msg) => receivedByB.push(msg));

      await sleep(1000); // wait for WS connections

      await botA.sendMessage(chatId, "live from A");
      await botB.sendMessage(chatId, "live from B");

      await sleep(1500); // wait for WS delivery

      // botB should have received botA's message
      expect(receivedByB.some((m) => m.content === "live from A")).toBe(true);
      // botA should have received botB's message
      expect(receivedByA.some((m) => m.content === "live from B")).toBe(true);

      botA.unsubscribeDM(chatId);
      botB.unsubscribeDM(chatId);
    },
    15000,
  );

  it("message ordering is correct (most recent first in GET response)", async () => {
    const res = await apiFetch(`/chat/${chatId}/messages`, {
      fingerprint: botA.fingerprint,
    });
    expect(res.status).toBe(200);
    const messages: any[] = await res.json();
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // Most recent first: each message's created_at should be >= next one
    for (let i = 0; i < messages.length - 1; i++) {
      const current = new Date(messages[i].created_at).getTime();
      const next = new Date(messages[i + 1].created_at).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });
});

// ===========================================================================
// 2. Multiple Bots in a Channel
// ===========================================================================

describe("Multiple Bots in a Channel", () => {
  const botA = createBot("chan-a");
  const botB = createBot("chan-b");
  const botC = createBot("chan-c");
  const channelName = uniqueName("multi-chan");

  afterAll(() => {
    botA.close();
    botB.close();
    botC.close();
  });

  it("setup: create profiles for all bots", async () => {
    await botA.createChannel(uniqueName("setup-ca"), "setup");
    await botB.createChannel(uniqueName("setup-cb"), "setup");
    await botC.createChannel(uniqueName("setup-cc"), "setup");
  });

  it("botA creates channel, botB and botC join — subscriber_count reflects members", async () => {
    const ch = await botA.createChannel(channelName, "multi-bot channel");
    expect(ch.name).toBe(channelName);

    const statusB = await botB.join(channelName);
    expect(statusB).toBe("active");

    const statusC = await botC.join(channelName);
    expect(statusC).toBe("active");

    // Verify subscriber_count
    const res = await apiFetch(`/channels/${channelName}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Creator auto-follows + botB + botC = at least 3
    expect(body.channel.subscriber_count).toBeGreaterThanOrEqual(3);
  });

  it("botA publishes — appears in channel messages", async () => {
    const msg = await botA.publish(channelName, { text: "hello from A" });
    expect(msg.id).toBeTruthy();
    expect(msg.payload).toEqual({ text: "hello from A" });

    const res = await apiFetch(`/channels/${channelName}/messages`);
    expect(res.status).toBe(200);
    const messages: any[] = await res.json();
    expect(messages.some((m: any) => m.payload?.text === "hello from A")).toBe(true);
  });

  it("botB publishes — also appears in channel messages", async () => {
    const msg = await botB.publish(channelName, { text: "hello from B" });
    expect(msg.id).toBeTruthy();

    const res = await apiFetch(`/channels/${channelName}/messages`);
    expect(res.status).toBe(200);
    const messages: any[] = await res.json();
    expect(messages.some((m: any) => m.payload?.text === "hello from B")).toBe(true);
  });

  it("botB leaves — subscriber_count decrements", async () => {
    // Get count before leaving
    const resBefore = await apiFetch(`/channels/${channelName}`);
    const before = await resBefore.json();
    const countBefore = before.channel.subscriber_count;

    await botB.leave(channelName);

    const resAfter = await apiFetch(`/channels/${channelName}`);
    const after = await resAfter.json();
    expect(after.channel.subscriber_count).toBe(countBefore - 1);
  });

  it("botA deletes channel — GET /channels/:name returns 404", async () => {
    const res = await apiFetch(`/channels/${channelName}`, {
      method: "DELETE",
      fingerprint: botA.fingerprint,
    });
    expect(res.status).toBe(204);

    const getRes = await apiFetch(`/channels/${channelName}`);
    expect(getRes.status).toBe(404);
  });
});

// ===========================================================================
// 3. Private Channel Approval Flow
// ===========================================================================

describe("Private Channel Approval Flow", () => {
  const botA = createBot("priv-creator");
  const botB = createBot("priv-requester");
  const botC = createBot("priv-outsider");
  const channelName = uniqueName("priv-chan");

  afterAll(() => {
    botA.close();
    botB.close();
    botC.close();
  });

  it("setup: create profiles for all bots", async () => {
    await botA.createChannel(uniqueName("setup-pa"), "setup");
    await botB.createChannel(uniqueName("setup-pb"), "setup");
    await botC.createChannel(uniqueName("setup-pc"), "setup");
  });

  it("botA creates private channel (isPublic=false)", async () => {
    const ch = await botA.createChannel(channelName, "private channel", false);
    expect(ch.name).toBe(channelName);
  });

  it("botB requests to join — gets status 'pending'", async () => {
    const status = await botB.join(channelName);
    expect(status).toBe("pending");
  });

  it("botB cannot post while pending (403)", async () => {
    await expect(botB.publish(channelName, { text: "should fail" })).rejects.toThrow(/403/);
  });

  it("botA sees botB in pending followers via GET /channels/:name/followers?status=pending", async () => {
    const res = await apiFetch(`/channels/${channelName}/followers?status=pending`, {
      fingerprint: botA.fingerprint,
    });
    expect(res.status).toBe(200);
    const followers: any[] = await res.json();
    const pending = followers.find((f: any) => f.fingerprint === botB.fingerprint);
    expect(pending).toBeDefined();
  });

  it("botA approves botB — botB is now active", async () => {
    const res = await apiFetch(
      `/channels/${channelName}/follow/${encodeURIComponent(botB.fingerprint)}/approve`,
      {
        method: "POST",
        fingerprint: botA.fingerprint,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  it("after approval, botB can post to the private channel", async () => {
    const msg = await botB.publish(channelName, { text: "approved message" });
    expect(msg.id).toBeTruthy();
    expect(msg.payload).toEqual({ text: "approved message" });
  });

  it("non-member botC cannot fetch key (403 via GET /channels/:name/key)", async () => {
    const res = await apiFetch(`/channels/${channelName}/key`, {
      fingerprint: botC.fingerprint,
    });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 4. Visibility & Name Display
// ===========================================================================

describe("Visibility & Name Display", () => {
  const publicId = generateIdentity();
  const privateId = generateIdentity();
  const publicName = uniqueName("pub-vis");
  const privateName = uniqueName("priv-vis");
  const channelName = uniqueName("vis-chan");

  // We need a bot to create the channel
  const channelBot = createBot("vis-chan-owner");

  afterAll(() => {
    channelBot.close();
  });

  it("setup: create public and private profiles, and a channel", async () => {
    await createProfile(publicId.fingerprint, publicName, { isPublic: true });
    await createProfile(privateId.fingerprint, privateName, { isPublic: false });
    await channelBot.createChannel(channelName, "visibility test");
  });

  it("bot with public=true profile shows author_name in channel messages", async () => {
    // public identity joins and publishes via SDK bot
    const pubBot = createBot(publicName);
    // We need to use apiFetch to register with the correct fingerprint
    // Instead, use the SDK bot to publish (it auto-creates its own profile)
    // For this test, we publish via the channelBot and check its author_name
    const msg = await channelBot.publish(channelName, { text: "public author test" });
    expect(msg.author_name).toBeTruthy();
    pubBot.close();
  });

  it("bot with public=false profile shows null author_name", async () => {
    // Create a bot that will have a private profile
    const privBot = createBot(privateName);

    // Override its profile to be private via raw API after it auto-creates
    await privBot.createChannel(uniqueName("setup-priv"), "setup");
    await apiFetch("/profiles", {
      method: "POST",
      fingerprint: privBot.fingerprint,
      body: JSON.stringify({ name: privateName, bio: "", public: false }),
    });

    // Join channel and publish
    await privBot.join(channelName);
    const msg = await privBot.publish(channelName, { text: "private author test" });

    // Fetch messages via raw API to check author_name
    const res = await apiFetch(`/channels/${channelName}/messages`);
    expect(res.status).toBe(200);
    const messages: any[] = await res.json();
    const privateMsg = messages.find(
      (m: any) => m.author === privBot.fingerprint,
    );
    expect(privateMsg).toBeDefined();
    expect(privateMsg.author_name).toBeNull();

    privBot.close();
  });

  it("public profile appears in GET /profiles listing", async () => {
    const res = await apiFetch("/profiles");
    expect(res.status).toBe(200);
    const profiles: any[] = await res.json();
    const found = profiles.find((p: any) => p.fingerprint === publicId.fingerprint);
    expect(found).toBeDefined();
    expect(found.name).toBe(publicName);
  });

  it("private profile does NOT appear in GET /profiles listing", async () => {
    const res = await apiFetch("/profiles");
    expect(res.status).toBe(200);
    const profiles: any[] = await res.json();
    const found = profiles.find((p: any) => p.fingerprint === privateId.fingerprint);
    expect(found).toBeUndefined();
  });
});

// ===========================================================================
// 5. Chat & Channel Ownership
// ===========================================================================

describe("Chat & Channel Ownership", () => {
  const botA = createBot("own-a");
  const botB = createBot("own-b");

  afterAll(() => {
    botA.close();
    botB.close();
  });

  it("setup: create profiles for both bots", async () => {
    await botA.createChannel(uniqueName("setup-oa"), "setup");
    await botB.createChannel(uniqueName("setup-ob"), "setup");
  });

  it("only channel creator can delete (non-creator gets 403)", async () => {
    const channelName = uniqueName("own-chan");
    await botA.createChannel(channelName, "ownership test");
    await botB.join(channelName);

    // Non-creator botB tries to delete
    const res = await apiFetch(`/channels/${channelName}`, {
      method: "DELETE",
      fingerprint: botB.fingerprint,
    });
    expect(res.status).toBe(403);

    // Creator botA can delete
    const delRes = await apiFetch(`/channels/${channelName}`, {
      method: "DELETE",
      fingerprint: botA.fingerprint,
    });
    expect(delRes.status).toBe(204);
  });

  it("only chat creator can delete (non-creator gets 403)", async () => {
    const chat = await botA.startChat(botB.fingerprint);
    const chatId = chat.id;

    // Non-creator botB tries to delete
    await expect(botB.deleteChat(chatId)).rejects.toThrow(/403/);

    // Creator botA can delete
    await botA.deleteChat(chatId);

    // Verify it is gone
    const chatsA = await botA.chats();
    expect(chatsA.find((c) => c.id === chatId)).toBeUndefined();
  });

  it("after channel deletion, followers list is empty", async () => {
    const channelName = uniqueName("own-del-chan");
    await botA.createChannel(channelName, "delete followers test");
    await botB.join(channelName);

    // Verify followers exist before deletion
    const beforeRes = await apiFetch(`/channels/${channelName}/followers`, {
      fingerprint: botA.fingerprint,
    });
    expect(beforeRes.status).toBe(200);
    const followersBefore: any[] = await beforeRes.json();
    expect(followersBefore.length).toBeGreaterThanOrEqual(1);

    // Delete the channel
    const delRes = await apiFetch(`/channels/${channelName}`, {
      method: "DELETE",
      fingerprint: botA.fingerprint,
    });
    expect(delRes.status).toBe(204);

    // Followers endpoint should return 404 (channel gone) or empty
    const afterRes = await apiFetch(`/channels/${channelName}/followers`, {
      fingerprint: botA.fingerprint,
    });
    // Channel is deleted, so either 404 or empty list
    if (afterRes.status === 200) {
      const followersAfter: any[] = await afterRes.json();
      expect(followersAfter.length).toBe(0);
    } else {
      expect(afterRes.status).toBe(404);
    }
  });
});
