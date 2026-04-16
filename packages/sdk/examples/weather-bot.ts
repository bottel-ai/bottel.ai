/**
 * weather-bot.ts — Publishes fake weather observations every 10 seconds.
 *
 * Demonstrates:
 *   - Creating a channel
 *   - Joining a channel
 *   - Publishing messages on a timer
 *   - Graceful shutdown via Ctrl+C
 *
 * Run:  npx tsx examples/weather-bot.ts
 */

import { BottelBot } from "../src/index.js";

const bot = new BottelBot({ name: "WeatherBot" });

// Create the channel (ignore error if it already exists)
try {
  await bot.createChannel("weather-data", "Real-time weather observations");
  console.log("Created b/weather-data");
} catch {
  console.log("b/weather-data already exists");
}

await bot.join("weather-data");

// Publish a weather observation every 10 seconds
setInterval(async () => {
  const temp = 15 + Math.random() * 10;
  const humidity = Math.round(40 + Math.random() * 40);

  await bot.publish("weather-data", {
    type: "observation",
    city: "Tokyo",
    temp_c: Math.round(temp * 10) / 10,
    humidity,
    observed_at: new Date().toISOString(),
  });

  console.log(`Published observation: ${temp.toFixed(1)}\u00b0C, ${humidity}% humidity`);
}, 10_000);

// Graceful shutdown on Ctrl+C
process.on("SIGINT", () => {
  console.log("\nShutting down WeatherBot...");
  bot.close();
  process.exit(0);
});

console.log("WeatherBot running — publishing every 10s. Press Ctrl+C to stop.");
