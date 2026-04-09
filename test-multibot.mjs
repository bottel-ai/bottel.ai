// Multi-bot end-to-end test against local backend.
// Two distinct bot identities exchange messages on a channel via REST + WS.
import { WebSocket } from "ws";

const BASE = "http://localhost:8787";
const WS_BASE = "ws://localhost:8787";

const BOT_A = "SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOT_B = "SHA256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const log = (tag, ...args) => console.log(`[${tag}]`, ...args);

async function api(method, path, fp, body) {
  const headers = { "Content-Type": "application/json" };
  if (fp) headers["X-Fingerprint"] = fp;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return data;
}

const channel = "test-room-" + Date.now().toString(36);

(async () => {
  log("setup", "Bot A creates a profile");
  await api("POST", "/profiles", BOT_A, { name: "BotA", bio: "publisher", public: true });

  log("setup", "Bot B creates a profile");
  await api("POST", "/profiles", BOT_B, { name: "BotB", bio: "subscriber", public: true });

  log("a", "creates channel", channel);
  const created = await api("POST", "/channels", BOT_A, {
    name: channel,
    description: "multi-bot integration test",
  });
  log("a", "→", JSON.stringify(created.channel || created));

  log("list", "GET /channels?q=test");
  const list = await api("GET", "/channels?q=test");
  const found = (list.channels || []).find((c) => c.name === channel);
  if (!found) throw new Error("channel not in search results");
  log("list", "✓ channel discoverable via FTS");

  log("b", "opens WebSocket subscription");
  const ws = new WebSocket(`${WS_BASE}/channels/${channel}/ws?fp=${BOT_B}`);
  const received = [];

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws open timeout")), 5000);
    ws.on("open", () => { clearTimeout(t); resolve(); });
    ws.on("error", (e) => { clearTimeout(t); reject(e); });
  });
  log("b", "✓ ws connected");

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    log("b ←", JSON.stringify(msg).slice(0, 120));
    received.push(msg);
  });

  // Give the DO a beat to register the socket before publishing
  await new Promise((r) => setTimeout(r, 300));

  log("a", "publishes message #1");
  await api("POST", `/channels/${channel}/messages`, BOT_A, {
    payload: { type: "text", text: "hello bots" },
  });

  log("a", "publishes message #2");
  await api("POST", `/channels/${channel}/messages`, BOT_A, {
    payload: { type: "observation", location: "Tokyo", temp: 18.5 },
  });

  log("b", "publishes a reply");
  await api("POST", `/channels/${channel}/messages`, BOT_B, {
    payload: { type: "text", text: "ack received" },
  });

  // Wait for fan-out
  await new Promise((r) => setTimeout(r, 500));

  log("verify", `received ${received.length} ws frames`);
  if (received.length < 3) {
    throw new Error(`expected ≥3 ws messages, got ${received.length}`);
  }

  log("history", "GET /channels/:name/messages");
  const hist = await api("GET", `/channels/${channel}/messages?limit=10`);
  log("history", `✓ ${hist.messages.length} messages persisted`);
  if (hist.messages.length < 3) throw new Error("history missing messages");

  log("search", "FTS5 inside channel for 'observation'");
  const search = await api("POST", `/channels/${channel}/search?q=observation`);
  log("search", `✓ ${search.messages.length} hit(s)`);

  log("mcp", "calling MCP tools/list");
  const mcp = await api("POST", "/mcp/channels", null, {
    jsonrpc: "2.0", id: 1, method: "tools/list",
  });
  const toolNames = (mcp.result?.tools || []).map((t) => t.name);
  log("mcp", "✓ tools:", toolNames.join(", "));

  log("mcp", "channels/get via MCP");
  const mcpGet = await api("POST", "/mcp/channels", null, {
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "channels/get", arguments: { name: channel } },
  });
  if (mcpGet.error) throw new Error("mcp get failed: " + JSON.stringify(mcpGet.error));
  log("mcp", "✓ channels/get returned channel info");

  ws.close();
  log("done", "ALL CHECKS PASSED ✓");
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
