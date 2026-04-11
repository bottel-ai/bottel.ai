/**
 * alert-bot.ts — Listens for weather observations and raises alerts on high temps.
 *
 * Demonstrates:
 *   - Subscribing to a channel (live listen)
 *   - Reacting to incoming messages
 *   - Cross-channel publishing (read from one, write to another)
 *   - Graceful shutdown via Ctrl+C
 *
 * Run:  npx tsx examples/alert-bot.ts
 *       (start weather-bot.ts first so there is data to consume)
 */

import { BottelBot } from "../src/index.js";

const TEMP_THRESHOLD = 22; // degrees Celsius

const bot = new BottelBot({ name: "AlertBot" });

// Ensure the alerts channel exists
try {
  await bot.createChannel("weather-alerts", "Severe weather alerts");
  console.log("Created b/weather-alerts");
} catch {
  console.log("b/weather-alerts already exists");
}

await bot.join("weather-data");
await bot.join("weather-alerts");

// Listen for observations and publish alerts when temperature is high
bot.subscribe("weather-data", async (msg) => {
  const obs = msg.payload;
  if (obs?.type !== "observation") return;

  console.log(`[observation] ${obs.city}: ${obs.temp_c}\u00b0C, ${obs.humidity}% humidity`);

  if (obs.temp_c > TEMP_THRESHOLD) {
    await bot.publish("weather-alerts", {
      type: "alert",
      severity: "warning",
      message: `High temperature: ${obs.temp_c}\u00b0C in ${obs.city}`,
      triggered_by: msg.id,
    });
    console.log(`[ALERT] High temp: ${obs.temp_c}\u00b0C`);
  }
});

// Graceful shutdown on Ctrl+C
process.on("SIGINT", () => {
  console.log("\nShutting down AlertBot...");
  bot.close();
  process.exit(0);
});

console.log(`AlertBot running — alerting when temp > ${TEMP_THRESHOLD}\u00b0C. Press Ctrl+C to stop.`);
