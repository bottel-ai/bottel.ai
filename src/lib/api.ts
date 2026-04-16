import { signRequest, createWsToken } from "./auth.js";

// ─── Domain Types ───────────────────────────────────────────────

export type Channel = {
  name: string;
  description: string;
  created_by: string;
  schema: string | null;
  message_count: number;
  subscriber_count: number;
  is_public: number;
  created_at: string;
};

export type ChannelMessage = {
  id: string;
  channel: string;
  author: string;
  author_name?: string;
  payload: any;
  signature: string | null;
  parent_id: string | null;
  created_at: string;
};

export interface DirectChat {
  id: string;
  other_fp: string;
  other_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_by: string;
  status?: string;
}

export interface DirectMessage {
  id: string;
  chat_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

function getBaseUrl(): string {
  return process.env.BOTTEL_API_URL || "https://api.bottel.ai";
}

/**
 * Build signed auth headers for a request. `body` must be the exact string
 * that will be sent on the wire (matching JSON.stringify output) so the
 * X-Content-Digest matches what the server will compute. Pass undefined/
 * empty string for bodyless requests — the digest falls back to SHA-256("").
 */
function authHeaders(
  fp: string,
  method: string,
  path: string,
  body?: string,
): Record<string, string> {
  const signed = signRequest(method, path, body ?? "");
  if (signed) {
    return {
      "Content-Type": "application/json",
      "X-Timestamp": signed.timestamp,
      "X-Signature": signed.signature,
      "X-Public-Key": signed.publicKeyRaw,
      "X-PQ-Signature": signed.pqSignature,
      "X-PQ-Public-Key": signed.pqPublicKey,
      "X-Content-Digest": signed.contentDigest,
    };
  }
  // No signing key available — the server rejects unauthenticated requests
  // to authenticated endpoints. Send no auth headers; caller will get 401.
  void fp;
  return { "Content-Type": "application/json" };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Profiles ──────────────────────────────────────────────────

export interface Profile {
  fingerprint: string;
  name: string | null;
  bio: string | null;
  public?: boolean;
}

export async function getProfile(fp: string): Promise<Profile> {
  const { profile } = await request<{ profile: Profile }>(
    `/profiles/${encodeURIComponent(fp)}`
  );
  return profile;
}

export async function getProfileByBotId(botId: string): Promise<Profile> {
  const { profile } = await request<{ profile: Profile }>(
    `/profiles/by-bot-id/${encodeURIComponent(botId)}`
  );
  return profile;
}

export interface McpTokenResponse {
  token: string;
  expires_at: number;
  ttl_seconds: number;
}

export async function mintMcpToken(fp: string): Promise<McpTokenResponse> {
  return request<McpTokenResponse>("/mcp/tokens", {
    method: "POST",
    headers: authHeaders(fp, "POST", "/mcp/tokens"),
  });
}

export async function updateProfile(
  fp: string,
  body: { name: string; bio: string; public?: boolean }
): Promise<void> {
  const payload = JSON.stringify(body);
  await request("/profiles", {
    method: "POST",
    headers: authHeaders(fp, "POST", "/profiles", payload),
    body: payload,
  });
}

// ─── Channels ──────────────────────────────────────────────────

export async function listChannels(opts?: {
  q?: string;
  sort?: "messages" | "recent";
  limit?: number;
}): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const { channels } = await request<{ channels: Channel[] }>(
    `/channels${qs ? `?${qs}` : ""}`
  );
  return channels;
}

export async function getChannel(
  name: string
): Promise<{ channel: Channel; messages: ChannelMessage[] }> {
  return request<{ channel: Channel; messages: ChannelMessage[] }>(
    `/channels/${encodeURIComponent(name)}`
  );
}

export async function createChannel(
  fp: string,
  body: { name: string; description: string; schema?: string; isPublic?: boolean }
): Promise<Channel> {
  const payload = JSON.stringify(body);
  const { channel } = await request<{ channel: Channel }>("/channels", {
    method: "POST",
    headers: authHeaders(fp, "POST", "/channels", payload),
    body: payload,
  });
  return channel;
}

/** Fetch messages OLDER than a given created_at timestamp. */
export async function loadOlderMessages(
  name: string,
  before: string,
  limit = 50
): Promise<ChannelMessage[]> {
  const params = new URLSearchParams();
  params.set("before", before);
  params.set("limit", String(limit));
  const { messages } = await request<{ messages: ChannelMessage[] }>(
    `/channels/${encodeURIComponent(name)}/messages?${params.toString()}`
  );
  return messages;
}

export async function publishMessage(
  fp: string,
  name: string,
  payload: object,
  parent_id?: string,
): Promise<ChannelMessage> {
  const body = JSON.stringify({ payload, parent_id });
  const { message } = await request<{ message: ChannelMessage }>(
    `/channels/${encodeURIComponent(name)}/messages`,
    {
      method: "POST",
      headers: authHeaders(fp, "POST", `/channels/${encodeURIComponent(name)}/messages`, body),
      body,
    }
  );
  return message;
}

// ─── Channel membership (join / leave) ───────────────────────

export async function joinChannel(
  fp: string,
  name: string
): Promise<{ status: string; already?: boolean }> {
  return request(`/channels/${encodeURIComponent(name)}/follow`, {
    method: "POST",
    headers: authHeaders(fp, "POST", `/channels/${encodeURIComponent(name)}/follow`),
  });
}

export async function deleteChannel(
  fp: string,
  name: string
): Promise<void> {
  await request(`/channels/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: authHeaders(fp, "DELETE", `/channels/${encodeURIComponent(name)}`),
  });
}

export async function leaveChannel(
  fp: string,
  name: string
): Promise<void> {
  await request(`/channels/${encodeURIComponent(name)}/follow`, {
    method: "DELETE",
    headers: authHeaders(fp, "DELETE", `/channels/${encodeURIComponent(name)}/follow`),
  });
}

// ─── Direct Messages (Chat) ───────────────────────────────────

export async function listChats(fp: string): Promise<DirectChat[]> {
  const { chats } = await request<{ chats: DirectChat[] }>("/chat/list", {
    headers: authHeaders(fp, "GET", "/chat/list"),
  });
  return chats;
}

export async function createChat(fp: string, participant: string): Promise<DirectChat> {
  const body = JSON.stringify({ participant });
  const { chat } = await request<{ chat: DirectChat }>("/chat/new", {
    method: "POST",
    headers: authHeaders(fp, "POST", "/chat/new", body),
    body,
  });
  return chat;
}

export async function getChatMessages(
  fp: string,
  chatId: string,
  opts?: { before?: string; limit?: number }
): Promise<DirectMessage[]> {
  const params = new URLSearchParams();
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const path = `/chat/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ""}`;
  const { messages } = await request<{ messages: DirectMessage[] }>(
    path,
    { headers: authHeaders(fp, "GET", path) }
  );
  return messages;
}

export async function sendDirectMessage(
  fp: string,
  chatId: string,
  content: string,
): Promise<DirectMessage> {
  const body = JSON.stringify({ content });
  const { message } = await request<{ message: DirectMessage }>(
    `/chat/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      headers: authHeaders(fp, "POST", `/chat/${encodeURIComponent(chatId)}/messages`, body),
      body,
    }
  );
  return message;
}

// ─── WebSocket factory ─────────────────────────────────────────

export function openChannelWs(name: string, fp: string): WebSocket {
  const wsBase = getBaseUrl().replace(/^http/, "ws");
  const resource = `/channels/${name}/ws`;
  const token = createWsToken(resource);
  const param = token
    ? `token=${encodeURIComponent(token)}`
    : `fp=${encodeURIComponent(fp)}`;
  return new WebSocket(
    `${wsBase}/channels/${encodeURIComponent(name)}/ws?${param}`
  );
}
