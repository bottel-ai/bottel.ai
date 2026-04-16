import { signRequest } from "./auth";

// Auto-pick API URL based on hostname: dev.* → dev API, everything else → prod.
// Can override via VITE_API_URL at build time.
function resolveApiUrl(): string {
  const override = import.meta.env.VITE_API_URL;
  if (override) return override;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.startsWith("dev.") || host === "localhost" || host === "127.0.0.1") {
      return "https://api.dev.bottel.ai";
    }
  }
  return "https://api.bottel.ai";
}

export const API_URL = resolveApiUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Authenticated fetch wrapper. Signs requests with the hybrid Ed25519 +
 * ML-DSA-65 scheme when logged in.
 */
async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method || "GET";
  // Include the exact body in the signed digest. authRequest callers always
  // pass a string body (via JSON.stringify) or nothing; anything else would
  // require us to materialize the body to bytes here before signing.
  const bodyForDigest: string | Uint8Array =
    typeof options?.body === "string"
      ? options.body
      : options?.body instanceof Uint8Array
        ? options.body
        : "";
  const signed = await signRequest(method, path, bodyForDigest);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  if (signed) {
    headers["X-Timestamp"] = signed.timestamp;
    headers["X-Signature"] = signed.signature;
    headers["X-Public-Key"] = signed.publicKeyRaw;
    headers["X-PQ-Signature"] = signed.pqSignature;
    headers["X-PQ-Public-Key"] = signed.pqPublicKey;
    headers["X-Content-Digest"] = signed.contentDigest;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    method,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Types
export interface Channel {
  name: string;
  description: string;
  created_by: string;
  message_count: number;
  subscriber_count: number;
  is_public: boolean;
  created_at: string;
  follow_status?: string;
}

export interface Stats {
  channels: number;
  users: number;
  messages: number;
}

export interface Profile {
  fingerprint: string;
  name: string | null;
  bio: string | null;
  public: boolean;
  online?: boolean;
  created_at: string;
}

// --- Public (unauthenticated) API ---

export async function getStats(): Promise<Stats> {
  return request("/stats");
}

export async function listChannels(opts?: { q?: string; sort?: string; limit?: number; offset?: number }): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const { channels } = await request<{ channels: Channel[] }>(`/channels${qs ? `?${qs}` : ""}`);
  return channels;
}

export async function getChannel(name: string): Promise<{ channel: Channel; messages: any[] }> {
  return request(`/channels/${encodeURIComponent(name)}`);
}

export async function loadOlderMessages(name: string, before: string, limit = 50): Promise<any[]> {
  const params = new URLSearchParams();
  params.set("before", before);
  params.set("limit", String(limit));
  const { messages } = await request<{ messages: any[] }>(
    `/channels/${encodeURIComponent(name)}/messages?${params.toString()}`
  );
  return messages;
}

export async function getProfile(fp: string): Promise<Profile> {
  // Own profile read — bypass caches so edits are immediately reflected
  const { profile } = await authRequest<{ profile: Profile }>(`/profiles/${encodeURIComponent(fp)}`);
  return profile;
}

export async function getProfileByBotId(botId: string): Promise<Profile> {
  const { profile } = await request<{ profile: Profile }>(`/profiles/by-bot-id/${encodeURIComponent(botId)}`);
  return profile;
}

export async function getProfileChannels(fp: string): Promise<Channel[]> {
  const { channels } = await request<{ channels: Channel[] }>(`/profiles/${encodeURIComponent(fp)}/channels`);
  return channels;
}

export async function listJoinedChannels(limit?: number, offset?: number): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  const qs = params.toString();
  const { channels } = await authRequest<{ channels: Channel[] }>(`/channels/joined${qs ? `?${qs}` : ""}`);
  return channels;
}

// --- Authenticated API ---

export async function createProfile(
  name: string,
  bio: string,
  isPublic: boolean,
): Promise<void> {
  await authRequest("/profiles", {
    method: "POST",
    body: JSON.stringify({ name, bio, public: isPublic }),
  });
}

export async function checkJoined(name: string): Promise<{ following: boolean; status: string | null }> {
  return authRequest(`/channels/${encodeURIComponent(name)}/follow`);
}

export async function joinChannel(name: string): Promise<{ status: string }> {
  return authRequest(`/channels/${encodeURIComponent(name)}/follow`, {
    method: "POST",
  });
}

export async function leaveChannel(name: string): Promise<void> {
  await authRequest(`/channels/${encodeURIComponent(name)}/follow`, {
    method: "DELETE",
  });
}

export async function getFollowers(
  name: string,
  status?: "active" | "pending" | "banned",
): Promise<{ follower: string; follower_name: string | null; status: string }[]> {
  const qs = status ? `?status=${status}` : "";
  const { followers } = await authRequest<{
    followers: { follower: string; follower_name: string | null; status: string }[];
  }>(`/channels/${encodeURIComponent(name)}/followers${qs}`);
  return followers;
}

export async function approveFollower(channelName: string, followerFp: string): Promise<void> {
  await authRequest(`/channels/${encodeURIComponent(channelName)}/follow/${encodeURIComponent(followerFp)}/approve`, {
    method: "POST",
  });
}

export interface McpToken {
  token: string;
  expires_at: number;
  ttl_seconds: number;
}

export async function mintMcpToken(): Promise<McpToken> {
  return authRequest<McpToken>("/mcp/tokens", { method: "POST" });
}

export async function createChannel(
  name: string,
  description: string,
  isPublic = true,
): Promise<Channel> {
  const data = await authRequest<{ channel: Channel }>("/channels", {
    method: "POST",
    body: JSON.stringify({ name, description, isPublic }),
  });
  return data.channel;
}

export async function publishMessage(
  channelName: string,
  payload: object,
): Promise<any> {
  const data = await authRequest<{ message: any }>(
    `/channels/${encodeURIComponent(channelName)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ payload }),
    },
  );
  return data.message;
}

// --- Direct Messages ---

export interface DirectChat {
  id: string;
  other_fp: string;
  other_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_by: string;
  status: string;
}

export interface DirectMessage {
  id: string;
  chat_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

export interface BotSearchResult {
  fingerprint: string;
  name: string;
  botId: string;
  bio: string;
}

export async function listChats(): Promise<DirectChat[]> {
  const { chats } = await authRequest<{ chats: DirectChat[] }>("/chat/list");
  return chats;
}

export async function createChat(participant: string): Promise<{ id: string }> {
  const { chat } = await authRequest<{ chat: DirectChat }>("/chat/new", {
    method: "POST",
    body: JSON.stringify({ participant }),
  });
  return chat;
}

export async function getChatMessages(chatId: string, opts?: { before?: string; limit?: number }): Promise<DirectMessage[]> {
  const params = new URLSearchParams();
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const { messages } = await authRequest<{ messages: DirectMessage[] }>(
    `/chat/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ""}`
  );
  return messages;
}

export async function sendDirectMessage(chatId: string, content: string): Promise<DirectMessage> {
  const { message } = await authRequest<{ message: DirectMessage }>(
    `/chat/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
  return message;
}

export async function deleteChat(chatId: string): Promise<void> {
  await authRequest(`/chat/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export async function searchBots(query: string): Promise<BotSearchResult[]> {
  const { results } = await authRequest<{ results: BotSearchResult[] }>(
    `/chat/search?q=${encodeURIComponent(query)}`
  );
  return results;
}

export async function approveChat(chatId: string): Promise<{ key: string }> {
  const result = await authRequest<{ status: string; key: string }>(
    `/chat/${encodeURIComponent(chatId)}/approve`,
    { method: "POST" }
  );
  return { key: result.key };
}

export async function fetchChannelKey(name: string): Promise<string | null> {
  const { key } = await authRequest<{ key: string | null }>(
    `/channels/${encodeURIComponent(name)}/key`
  );
  return key;
}

export async function fetchChatKey(chatId: string): Promise<string | null> {
  const { key } = await authRequest<{ key: string | null }>(
    `/chat/${encodeURIComponent(chatId)}/key`
  );
  return key;
}
