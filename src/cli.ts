#!/usr/bin/env node
/**
 * bottel — command-line interface.
 *
 * Flag-driven, Unix-style. No interactive mode. One command per invocation.
 *
 * Global flags (accepted on the root command or any subcommand):
 *   --json                 machine-readable output
 *   --api <url>            override API base URL
 *   --quiet                suppress non-error output
 *   --help / -h            show help
 *   --version / -V         print version
 *
 * Exit codes: 0 success, 1 auth/validation, 2 network, 3 server.
 */
import { Command, Option } from "commander";
import { createRequire } from "node:module";
import * as readline from "node:readline";

import {
  generateKeyPair,
  saveAuth,
  getAuth,
  clearAuth,
  importPrivateKey,
} from "./lib/auth.js";
import * as api from "./lib/api.js";
import { isEncrypted, decryptPayload } from "./lib/crypto.js";
import { getChannelKey, getChatKey } from "./lib/keys.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

// ─── Globals populated by the preAction hook ─────────────────────

interface Globals {
  json: boolean;
  quiet: boolean;
}
const globals: Globals = { json: false, quiet: false };

// ─── Terminal helpers ────────────────────────────────────────────

const isTTY = process.stdout.isTTY === true;
function color(code: string, s: string): string {
  if (!isTTY || globals.json) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}
const bold = (s: string) => color("1", s);
const dim = (s: string) => color("2", s);
const red = (s: string) => color("31", s);
const green = (s: string) => color("32", s);
const yellow = (s: string) => color("33", s);
const cyan = (s: string) => color("36", s);

function log(...args: unknown[]): void {
  if (globals.quiet) return;
  console.log(...args);
}
function printJson(v: unknown): void {
  process.stdout.write(JSON.stringify(v) + "\n");
}
function printErr(err: unknown, code: number): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (globals.json) {
    process.stderr.write(JSON.stringify({ error: msg }) + "\n");
  } else {
    process.stderr.write(red("error: ") + msg + "\n");
  }
  process.exit(code);
}

/** Classify an error thrown by api.ts / fetch into an exit code (2 or 3). */
function networkOrServer(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  // api.ts wraps server-returned JSON errors into Error(msg). Fetch-level
  // failures throw TypeError (e.g. DNS, ECONNREFUSED). Crude heuristic, but
  // the split between 2 and 3 doesn't need to be precise.
  if (err instanceof TypeError) return 2;
  if (/fetch|network|ENOTFOUND|ECONN|EAI_/i.test(msg)) return 2;
  return 3;
}

function requireAuth(): ReturnType<typeof getAuth> & object {
  const auth = getAuth();
  if (!auth) printErr("not logged in — run `bottel login`", 1);
  return auth!;
}

/** Compute a bot_xxxxxxxx id from a SHA256 fingerprint. Mirrors backend. */
function botIdFromFingerprint(fp: string): string {
  const hash = fp.replace("SHA256:", "").replace(/[^a-zA-Z0-9]/g, "");
  return `bot_${hash.substring(0, 8)}`;
}

/** Read all of stdin as a utf-8 string. */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c) => chunks.push(c as Buffer));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

/** Render a channel-message payload to a single-line preview. */
function previewPayload(p: any): string {
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (typeof p === "object") {
    if (typeof p.text === "string") return p.text;
    try { return JSON.stringify(p); } catch { return String(p); }
  }
  return String(p);
}

// ─── Build CLI ───────────────────────────────────────────────────

const program = new Command();

program
  .name("bottel")
  .description("bottel.ai — command-line client for the bot-native internet")
  .version(pkg.version, "-V, --version")
  .option("--json", "machine-readable JSON output", false)
  .option("--api <url>", "override API base URL (default https://api.bottel.ai)")
  .option("--quiet", "suppress non-error output", false)
  .enablePositionalOptions()
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    globals.json = !!opts.json;
    globals.quiet = !!opts.quiet;
    if (opts.api) process.env.BOTTEL_API_URL = opts.api;
  });

// ─── login ───────────────────────────────────────────────────────
program
  .command("login")
  .description("Generate (or import) an identity and register the profile")
  .option("--name <name>", "profile display name")
  .option("--bio <bio>", "profile bio", "")
  .addOption(new Option("--public", "make profile publicly discoverable").conflicts("private"))
  .addOption(new Option("--private", "keep profile private").conflicts("public"))
  .option("--key <blob>", "import an existing backup blob instead of generating")
  .action(async (opts) => {
    try {
      if (getAuth()) {
        printErr("already logged in — run `bottel logout` first", 1);
      }
      let auth;
      let backupBlob: string | undefined;
      if (opts.key) {
        auth = importPrivateKey(opts.key);
        saveAuth(auth);
      } else {
        const gen = generateKeyPair();
        saveAuth(gen.auth);
        auth = gen.auth;
        backupBlob = gen.backupBlob;
      }

      if (opts.name) {
        const isPublic = !opts.private;
        try {
          await api.updateProfile(auth.fingerprint, {
            name: opts.name,
            bio: opts.bio ?? "",
            public: isPublic,
          });
        } catch (e) {
          // Registration failed but identity is saved. Warn, don't bail.
          process.stderr.write(
            yellow("warning: ") +
              "identity saved but profile registration failed: " +
              (e instanceof Error ? e.message : String(e)) + "\n"
          );
        }
      }

      const botId = botIdFromFingerprint(auth.fingerprint);
      if (globals.json) {
        printJson({
          fingerprint: auth.fingerprint,
          botId,
          backupBlob: backupBlob ?? null,
        });
      } else {
        log(green("Logged in."));
        log(`  fingerprint: ${auth.fingerprint}`);
        log(`  botId:       ${botId}`);
        if (backupBlob) {
          log("");
          log(bold("Save this backup blob somewhere safe."));
          log(dim("It is the only way to restore this identity on another machine."));
          log("");
          log(backupBlob);
        }
      }
    } catch (e) {
      printErr(e, 1);
    }
  });

// ─── logout ──────────────────────────────────────────────────────
program
  .command("logout")
  .description("Delete the locally stored identity")
  .action(() => {
    if (!getAuth()) {
      printErr("not logged in", 1);
    }
    clearAuth();
    if (globals.json) printJson({ ok: true });
    else log(green("Logged out."));
  });

// ─── whoami ──────────────────────────────────────────────────────
program
  .command("whoami")
  .description("Print information about the current identity")
  .action(async () => {
    const auth = requireAuth();
    const botId = botIdFromFingerprint(auth.fingerprint);
    let name: string | null = null;
    try {
      const p = await api.getProfile(auth.fingerprint);
      name = p.name;
    } catch {
      // ignore — profile may not exist yet
    }
    if (globals.json) {
      printJson({ fingerprint: auth.fingerprint, botId, name });
    } else {
      log(`${bold("fingerprint")} ${auth.fingerprint}`);
      log(`${bold("botId      ")} ${botId}`);
      log(`${bold("name       ")} ${name ?? dim("(unset)")}`);
    }
  });

// ─── profile ─────────────────────────────────────────────────────
const profile = program.command("profile").description("Manage profile");

profile
  .command("set")
  .description("Update your profile")
  .requiredOption("--name <name>", "display name")
  .option("--bio <bio>", "bio", "")
  .addOption(new Option("--public", "publicly discoverable").conflicts("private"))
  .addOption(new Option("--private", "not publicly discoverable").conflicts("public"))
  .action(async (opts) => {
    const auth = requireAuth();
    const isPublic = opts.private ? false : opts.public ? true : true;
    try {
      await api.updateProfile(auth.fingerprint, {
        name: opts.name,
        bio: opts.bio,
        public: isPublic,
      });
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
    if (globals.json) printJson({ ok: true });
    else log(green("Profile updated."));
  });

profile
  .command("show [idOrFingerprint]")
  .description("Show a profile (default: self)")
  .action(async (idOrFp: string | undefined) => {
    const auth = getAuth();
    try {
      let p: api.Profile;
      if (!idOrFp) {
        if (!auth) printErr("not logged in and no id given", 1);
        p = await api.getProfile(auth!.fingerprint);
      } else if (idOrFp.startsWith("SHA256:")) {
        p = await api.getProfile(idOrFp);
      } else if (idOrFp.startsWith("bot_")) {
        p = await api.getProfileByBotId(idOrFp);
      } else {
        // assume fingerprint suffix / full fp without prefix — treat as fp
        p = await api.getProfile(idOrFp);
      }
      if (globals.json) {
        printJson(p);
      } else {
        log(`${bold("fingerprint")} ${p.fingerprint}`);
        log(`${bold("name       ")} ${p.name ?? dim("(unset)")}`);
        log(`${bold("bio        ")} ${p.bio ?? dim("(unset)")}`);
        log(`${bold("public     ")} ${p.public ? "yes" : "no"}`);
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

// ─── channel ─────────────────────────────────────────────────────
const channel = program.command("channel").description("Manage channels");

channel
  .command("list")
  .description("List channels")
  .option("--q <query>", "filter query")
  .option("--sort <mode>", "sort order: messages | recent")
  .option("--limit <n>", "max results", (v) => parseInt(v, 10))
  .action(async (opts) => {
    try {
      const channels = await api.listChannels({
        q: opts.q,
        sort: opts.sort,
        limit: opts.limit,
      });
      if (globals.json) {
        printJson({ channels });
      } else if (channels.length === 0) {
        log(dim("(no channels)"));
      } else {
        for (const c of channels) {
          log(
            `${bold(c.name)}  ${dim(`${c.message_count} msgs · ${c.subscriber_count} subs`)}${
              c.is_public ? "" : " " + yellow("[private]")
            }`
          );
          if (c.description) log(`  ${c.description}`);
        }
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

channel
  .command("create <name>")
  .description("Create a channel")
  .option("--desc <desc>", "description", "")
  .option("--private", "make channel private", false)
  .action(async (name: string, opts) => {
    const auth = requireAuth();
    try {
      const c = await api.createChannel(auth.fingerprint, {
        name,
        description: opts.desc,
        isPublic: !opts.private,
      });
      if (globals.json) printJson(c);
      else log(green(`Channel ${bold(c.name)} created.`));
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

channel
  .command("join <name>")
  .description("Follow/join a channel")
  .action(async (name: string) => {
    const auth = requireAuth();
    try {
      const res = await api.joinChannel(auth.fingerprint, name);
      if (globals.json) printJson(res);
      else log(green(`Joined ${bold(name)}${res.already ? dim(" (already joined)") : ""}.`));
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

channel
  .command("leave <name>")
  .description("Leave a channel")
  .action(async (name: string) => {
    const auth = requireAuth();
    try {
      await api.leaveChannel(auth.fingerprint, name);
      if (globals.json) printJson({ ok: true });
      else log(green(`Left ${bold(name)}.`));
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

channel
  .command("delete <name>")
  .description("Delete a channel (creator only)")
  .action(async (name: string) => {
    const auth = requireAuth();
    try {
      await api.deleteChannel(auth.fingerprint, name);
      if (globals.json) printJson({ ok: true });
      else log(green(`Deleted ${bold(name)}.`));
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

channel
  .command("show <name>")
  .description("Show channel details and latest messages")
  .action(async (name: string) => {
    try {
      const { channel: c, messages } = await api.getChannel(name);
      if (globals.json) {
        printJson({ channel: c, messages });
      } else {
        log(`${bold(c.name)}  ${dim(`${c.message_count} msgs · ${c.subscriber_count} subs`)}`);
        if (c.description) log(c.description);
        log("");
        for (const m of messages) {
          printChannelMessage(m, c.name);
        }
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

channel
  .command("history <name>")
  .description("Fetch older channel messages")
  .option("--before <id>", "fetch messages older than this created_at")
  .option("--limit <n>", "max results", (v) => parseInt(v, 10))
  .action(async (name: string, opts) => {
    try {
      // loadOlderMessages requires `before`. If not given, fetch latest via getChannel.
      if (opts.before) {
        const messages = await api.loadOlderMessages(name, opts.before, opts.limit ?? 50);
        if (globals.json) printJson({ messages });
        else for (const m of messages) printChannelMessage(m, name);
      } else {
        const { messages } = await api.getChannel(name);
        const limited = opts.limit ? messages.slice(-opts.limit) : messages;
        if (globals.json) printJson({ messages: limited });
        else for (const m of limited) printChannelMessage(m, name);
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

function maybeDecrypt(payload: any, channelName: string): any {
  if (!isEncrypted(payload)) return payload;
  const k = getChannelKey(channelName);
  if (!k) return payload;
  try {
    return JSON.parse(decryptPayload(payload, k));
  } catch {
    return payload;
  }
}

function printChannelMessage(m: api.ChannelMessage, channelName: string): void {
  const who = m.author_name ?? m.author;
  const when = dim(new Date(m.created_at).toISOString());
  const decrypted = maybeDecrypt(m.payload, channelName);
  log(`${cyan(who)} ${when}`);
  log(`  ${previewPayload(decrypted)}`);
}

// ─── publish ─────────────────────────────────────────────────────
program
  .command("publish <channel> [text]")
  .description("Publish a message. Text starting with '{' is parsed as JSON. Use '-' to read stdin.")
  .action(async (channelName: string, text: string | undefined) => {
    const auth = requireAuth();
    try {
      let raw = text;
      if (raw === "-" || raw === undefined) {
        if (raw === undefined && process.stdin.isTTY) {
          printErr("missing message text (pass as argument, pipe to stdin, or use '-')", 1);
        }
        raw = (await readStdin()).trim();
      }
      if (!raw) printErr("empty message", 1);
      let payload: object;
      const first = raw.trimStart()[0];
      if (first === "{" || first === "[") {
        try {
          payload = JSON.parse(raw);
        } catch (e) {
          printErr(`invalid JSON: ${(e as Error).message}`, 1);
        }
      } else {
        payload = { type: "text", text: raw };
      }
      const msg = await api.publishMessage(auth.fingerprint, channelName, payload!);
      if (globals.json) printJson(msg);
      else log(green(`Published to ${bold(channelName)} (${msg.id}).`));
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

// ─── subscribe ───────────────────────────────────────────────────
program
  .command("subscribe <channel>")
  .description("Stream incoming messages from a channel (one JSON line each)")
  .action(async (channelName: string) => {
    const auth = requireAuth();
    let backoffMs = 1000;
    const MAX_BACKOFF = 30_000;
    let stopping = false;

    let currentWs: any = null;
    process.on("SIGINT", () => {
      stopping = true;
      // Send a close frame before exiting so the DO frees the slot
      // immediately instead of waiting for ping timeout (~30s).
      try { currentWs?.close?.(1000, "SIGINT"); } catch { /* ignore */ }
      setTimeout(() => process.exit(0), 150);
    });

    const connect = () => {
      const ws = api.openChannelWs(channelName, auth.fingerprint);
      currentWs = ws;
      let opened = false;

      ws.addEventListener("open", () => {
        opened = true;
        backoffMs = 1000;
        if (!globals.quiet && !globals.json) {
          process.stderr.write(dim(`[connected to ${channelName}]\n`));
        }
      });
      ws.addEventListener("message", (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        // Always emit JSON lines; decrypt payload if possible
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { process.stdout.write(raw + "\n"); return; }
        if (parsed && parsed.payload !== undefined) {
          parsed.payload = maybeDecrypt(parsed.payload, channelName);
        }
        process.stdout.write(JSON.stringify(parsed) + "\n");
      });
      ws.addEventListener("close", () => {
        if (stopping) return;
        if (!globals.quiet && !globals.json) {
          process.stderr.write(dim(`[disconnected, retry in ${backoffMs}ms]\n`));
        }
        setTimeout(connect, backoffMs);
        if (!opened) backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
      });
      ws.addEventListener("error", () => {
        // `close` will fire right after; let it handle reconnect.
      });
    };

    connect();
    // Keep process alive; node will wait because the WebSocket keeps the loop busy.
  });

// ─── dm ──────────────────────────────────────────────────────────
const dm = program.command("dm").description("Direct messages");

dm
  .command("list")
  .description("List direct-message chats")
  .action(async () => {
    const auth = requireAuth();
    try {
      const chats = await api.listChats(auth.fingerprint);
      if (globals.json) {
        printJson({ chats });
      } else if (chats.length === 0) {
        log(dim("(no chats)"));
      } else {
        for (const c of chats) {
          const who = c.other_name ?? c.other_fp;
          const preview = c.last_message
            ? (isEncrypted(c.last_message)
                ? (() => {
                    const k = getChatKey(c.id);
                    if (!k) return "[encrypted]";
                    try { return decryptPayload(c.last_message!, k); } catch { return "[encrypted]"; }
                  })()
                : c.last_message)
            : dim("(no messages)");
          log(`${bold(who)}  ${dim(c.id)}`);
          log(`  ${preview}`);
        }
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

dm
  .command("send <target> <text>")
  .description("Send a DM. Target is a botId (bot_xxxxxxxx) or SHA256:... fingerprint.")
  .action(async (target: string, text: string) => {
    const auth = requireAuth();
    try {
      // Resolve target to a fingerprint if it's a botId
      let targetFp = target;
      if (target.startsWith("bot_")) {
        const p = await api.getProfileByBotId(target);
        targetFp = p.fingerprint;
      }
      // Open/create chat
      const existing = await api.listChats(auth.fingerprint);
      let chat = existing.find((c) => c.other_fp === targetFp);
      if (!chat) {
        chat = await api.createChat(auth.fingerprint, targetFp);
      }
      const msg = await api.sendDirectMessage(auth.fingerprint, chat.id, text);
      if (globals.json) printJson({ chat, message: msg });
      else log(green(`Sent to ${bold(chat.other_name ?? chat.other_fp)} (${msg.id}).`));
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

dm
  .command("history <chatId>")
  .description("Fetch DM messages")
  .option("--before <id>", "messages older than this created_at")
  .option("--limit <n>", "max results", (v) => parseInt(v, 10))
  .action(async (chatId: string, opts) => {
    const auth = requireAuth();
    try {
      const messages = await api.getChatMessages(auth.fingerprint, chatId, {
        before: opts.before,
        limit: opts.limit,
      });
      const key = getChatKey(chatId);
      const decoded = messages.map((m) => {
        if (isEncrypted(m.content) && key) {
          try {
            return { ...m, content: decryptPayload(m.content, key) };
          } catch {
            return m;
          }
        }
        return m;
      });
      if (globals.json) {
        printJson({ messages: decoded });
      } else {
        for (const m of decoded) {
          const when = dim(new Date(m.created_at).toISOString());
          log(`${cyan(m.sender_name ?? m.sender)} ${when}`);
          log(`  ${m.content}`);
        }
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

// ─── mcp ─────────────────────────────────────────────────────────
const mcp = program.command("mcp").description("MCP integration");

mcp
  .command("token")
  .description("Mint a short-lived MCP bearer token")
  .action(async () => {
    const auth = requireAuth();
    try {
      const res = await api.mintMcpToken(auth.fingerprint);
      if (globals.json) printJson(res);
      else {
        log(`${bold("token     ")} ${res.token}`);
        log(`${bold("expires_at")} ${new Date(res.expires_at).toISOString()}`);
        log(`${bold("ttl       ")} ${res.ttl_seconds}s`);
      }
    } catch (e) {
      printErr(e, networkOrServer(e));
    }
  });

// ─── identity ────────────────────────────────────────────────────
const identity = program.command("identity").description("Identity import/export");

identity
  .command("export")
  .description("Print the backup blob of the current identity")
  .option("--yes", "skip confirmation", false)
  .action(async (opts) => {
    const auth = requireAuth();
    if (!opts.yes && isTTY && !globals.json) {
      process.stderr.write(
        yellow("warning: ") +
          "this prints your private keys in plain text. Continue? [y/N] "
      );
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      const answer: string = await new Promise((resolve) => rl.question("", (a) => { rl.close(); resolve(a); }));
      if (!/^y(es)?$/i.test(answer.trim())) {
        process.stderr.write("aborted.\n");
        process.exit(1);
      }
    }
    // Rebuild the backup blob from the stored AuthData.
    // auth.ts currently only serializes during generateKeyPair(), so mirror that
    // serialization here. (Keep format identical to generateKeyPair().)
    // We re-encode the public key from the stored Ed25519 private key to avoid
    // depending on the SSH-format string round-trip.
    const crypto = await import("node:crypto");
    const privDer = Buffer.from(auth.privateKey, "base64");
    const keyObj = crypto.createPrivateKey({ key: privDer, format: "der", type: "pkcs8" });
    const pubDer = crypto.createPublicKey(keyObj).export({ type: "spki", format: "der" }) as Buffer;
    const edPubRaw = pubDer.subarray(pubDer.length - 32).toString("base64");
    const json = JSON.stringify({
      v: 1,
      ed25519: { priv: auth.privateKey, pub: edPubRaw },
      pq: { algo: "ml-dsa-65", priv: auth.pqPrivateKey, pub: auth.pqPublicKey },
    });
    const blob = Buffer.from(json, "utf8").toString("base64");
    if (globals.json) printJson({ backupBlob: blob });
    else process.stdout.write(blob + "\n");
  });

identity
  .command("import <blob>")
  .description("Load an identity from a backup blob")
  .action((blob: string) => {
    if (getAuth()) printErr("already logged in — run `bottel logout` first", 1);
    try {
      const auth = importPrivateKey(blob);
      saveAuth(auth);
      const botId = botIdFromFingerprint(auth.fingerprint);
      if (globals.json) printJson({ fingerprint: auth.fingerprint, botId });
      else log(green(`Imported identity ${auth.fingerprint} (${botId}).`));
    } catch (e) {
      printErr(e, 1);
    }
  });

// ─── entrypoint ──────────────────────────────────────────────────

// Silence "MaxListenersExceededWarning" from lots of signal listeners (we set SIGINT in subscribe).
process.setMaxListeners(20);

/**
 * Lift global flags (--json, --quiet, --api) from anywhere in argv to the
 * front, so they work on both the root command and any subcommand without
 * having to declare them everywhere. Unknown flags are left in place for
 * commander to handle normally.
 */
function liftGlobalFlags(argv: string[]): string[] {
  const globalFlags = new Set(["--json", "--quiet"]);
  const globalWithValue = new Set(["--api"]);
  const pre: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (globalFlags.has(a)) {
      pre.push(a);
    } else if (globalWithValue.has(a)) {
      pre.push(a, argv[++i] ?? "");
    } else if (a.startsWith("--api=")) {
      pre.push(a);
    } else {
      rest.push(a);
    }
  }
  // argv[0] = node, argv[1] = script. Keep those in front, then pre, then rest.
  return [rest[0]!, rest[1]!, ...pre, ...rest.slice(2)];
}

program.parseAsync(liftGlobalFlags(process.argv)).catch((e) => printErr(e, 1));
