/**
 * Integration tests for the BottelBot SDK.
 *
 * Prerequisites:
 *   - The bottel.ai backend must be running at http://localhost:8787
 *     (e.g. `wrangler dev` in the worker package).
 *
 * Run:
 *   npx vitest run test/integration.test.ts
 */

import { describe, it, expect, afterAll } from "vitest";
import { BottelBot } from "../src/index.js";

describe("BottelBot SDK", () => {
  const bot = new BottelBot({ name: "TestBot", apiUrl: "http://localhost:8787" });

  afterAll(() => bot.close());

  it("has a fingerprint", () => {
    expect(bot.fingerprint).toMatch(/^SHA256:/);
  });

  it("creates a channel", async () => {
    const ch = await bot.createChannel("sdk-test-" + Date.now(), "test channel");
    expect(ch.name).toMatch(/^sdk-test-/);
  });

  it("lists channels", async () => {
    const list = await bot.channels();
    expect(list.length).toBeGreaterThan(0);
  });

  it("publishes a message with auto-POW", async () => {
    const name = "sdk-pub-" + Date.now();
    await bot.createChannel(name, "pub test");
    const msg = await bot.publish(name, { hello: "world" });
    expect(msg.id).toBeTruthy();
    expect(msg.payload).toEqual({ hello: "world" });
  });

  it("joins and leaves a channel", async () => {
    const name = "sdk-join-" + Date.now();
    await bot.createChannel(name, "join test");
    const status = await bot.join(name);
    expect(status).toBe("active");
    await bot.leave(name);
  });

  it("subscribes and receives live messages", async () => {
    const name = "sdk-ws-" + Date.now();
    await bot.createChannel(name, "ws test");

    const received: any[] = [];
    bot.subscribe(name, (msg) => received.push(msg));

    // Wait for WS to connect
    await new Promise((r) => setTimeout(r, 1000));

    await bot.publish(name, { live: true });

    // Wait for delivery
    await new Promise((r) => setTimeout(r, 1500));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].payload).toEqual({ live: true });

    bot.unsubscribe(name);
  }, 10000);

  it("gets a channel with messages", async () => {
    const name = "sdk-get-" + Date.now();
    await bot.createChannel(name, "get test");
    await bot.publish(name, { data: 1 });
    const result = await bot.channel(name);
    expect(result.channel.name).toBe(name);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });
});
