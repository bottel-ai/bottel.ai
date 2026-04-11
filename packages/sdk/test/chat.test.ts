/**
 * SDK integration tests for 1:1 direct chat.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *   - Build dist first: cd packages/sdk && npx tsc
 *
 * Run:
 *   npx vitest run test/chat.test.ts
 */

import { describe, it, expect, afterAll } from "vitest";
import { BottelBot } from "../src/index.js";

describe("BottelBot SDK — Direct Chat", () => {
  const botA = new BottelBot({
    name: "ChatBotA",
    apiUrl: "http://localhost:8787",
    configDir: "bottel-sdk-test-a",
  });
  const botB = new BottelBot({
    name: "ChatBotB",
    apiUrl: "http://localhost:8787",
    configDir: "bottel-sdk-test-b",
  });

  afterAll(() => {
    botA.close();
    botB.close();
  });

  let chatId: string;

  // Both bots need profiles before we can start a chat.
  // Creating a throwaway channel triggers ensureProfile() for each.
  it("setup: ensure both bot profiles exist", async () => {
    try { await botA.createChannel("chat-setup-a-" + Date.now(), "setup"); } catch {}
    try { await botB.createChannel("chat-setup-b-" + Date.now(), "setup"); } catch {}
    // Verify fingerprints are different
    expect(botA.fingerprint).not.toBe(botB.fingerprint);
  });

  it("starts a chat with another bot", async () => {
    const chat = await botA.startChat(botB.fingerprint);
    expect(chat).toBeDefined();
    expect(chat.id).toBeTruthy();
    chatId = chat.id;
  });

  it("lists chats for both participants", async () => {
    const chatsA = await botA.chats();
    expect(chatsA.length).toBeGreaterThanOrEqual(1);
    const found = chatsA.find((c: any) => c.id === chatId);
    expect(found).toBeDefined();

    const chatsB = await botB.chats();
    expect(chatsB.length).toBeGreaterThanOrEqual(1);
    const foundB = chatsB.find((c: any) => c.id === chatId);
    expect(foundB).toBeDefined();
  });

  it("sends and receives messages", async () => {
    const msg1 = await botA.sendMessage(chatId, "hello from A");
    expect(msg1).toBeDefined();
    expect(msg1.content).toBe("hello from A");
    expect(msg1.sender).toBe(botA.fingerprint);

    const msg2 = await botB.sendMessage(chatId, "hello from B");
    expect(msg2).toBeDefined();
    expect(msg2.content).toBe("hello from B");
    expect(msg2.sender).toBe(botB.fingerprint);
  });

  it(
    "receives live messages via subscribeDM",
    async () => {
      const received: any[] = [];
      botB.subscribeDM(chatId, (msg) => received.push(msg));

      // Wait for WebSocket to connect
      await new Promise((r) => setTimeout(r, 2000));

      await botA.sendMessage(chatId, "live message test");

      // Wait for WS delivery
      await new Promise((r) => setTimeout(r, 2500));

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].content).toBe("live message test");
      expect(received[0].sender).toBe(botA.fingerprint);

      botB.unsubscribeDM(chatId);
    },
    10000,
  );

  it("cannot delete another bot's chat", async () => {
    // botA created the chat, so botB should not be able to delete it
    await expect(botB.deleteChat(chatId)).rejects.toThrow(/403|forbidden/i);
  });

  it("deletes a chat (creator only)", async () => {
    await botA.deleteChat(chatId);

    // Verify it no longer appears in the list
    const chatsA = await botA.chats();
    const found = chatsA.find((c: any) => c.id === chatId);
    expect(found).toBeUndefined();
  });
});
