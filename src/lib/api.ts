import type { Channel, ChannelMessage } from "../state.js";
export type { Channel, ChannelMessage } from "../state.js";

function getBaseUrl(): string {
  return process.env.BOTTEL_API_URL || "https://bottel-api.cenconq.workers.dev";
}

function authHeaders(fp: string) {
  return { "X-Fingerprint": fp, "Content-Type": "application/json" };
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
  name: string;
  bio: string;
  online: boolean;
  public?: boolean;
}

export async function getProfile(fp: string): Promise<Profile> {
  const { profile } = await request<{ profile: Profile }>(
    `/profiles/${encodeURIComponent(fp)}`
  );
  return profile;
}

export async function updateProfile(
  fp: string,
  body: { name: string; bio: string; public?: boolean }
): Promise<void> {
  await request("/profiles", {
    method: "POST",
    headers: authHeaders(fp),
    body: JSON.stringify(body),
  });
}

/**
 * Legacy-compatible wrapper preserved for ProfileSetup.tsx.
 * Backend POST /profiles acts as an upsert.
 */
export async function createProfile(
  fingerprint: string,
  name: string,
  bio: string,
  isPublic: boolean
): Promise<void> {
  await updateProfile(fingerprint, { name, bio, public: isPublic });
}

export async function pingOnline(fp: string): Promise<void> {
  await request("/profiles/ping", {
    method: "POST",
    headers: authHeaders(fp),
  });
}

// ─── Channels ──────────────────────────────────────────────────

export async function listChannels(opts?: {
  q?: string;
  sort?: "messages" | "recent";
}): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.sort) params.set("sort", opts.sort);
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
  const { channel } = await request<{ channel: Channel }>("/channels", {
    method: "POST",
    headers: authHeaders(fp),
    body: JSON.stringify(body),
  });
  return channel;
}

/**
 * Fetch messages OLDER than a given created_at timestamp. Used by the
 * channel view's scroll-up-to-load-more pagination.
 */
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
  parent_id?: string
): Promise<ChannelMessage> {
  const { message } = await request<{ message: ChannelMessage }>(
    `/channels/${encodeURIComponent(name)}/messages`,
    {
      method: "POST",
      headers: authHeaders(fp),
      body: JSON.stringify({ payload, parent_id }),
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
    headers: authHeaders(fp),
  });
}

export async function unjoinChannel(
  fp: string,
  name: string
): Promise<void> {
  await request(`/channels/${encodeURIComponent(name)}/follow`, {
    method: "DELETE",
    headers: authHeaders(fp),
  });
}

export async function checkJoined(
  fp: string,
  name: string
): Promise<{ following: boolean; status: string | null }> {
  return request(`/channels/${encodeURIComponent(name)}/follow`, {
    headers: authHeaders(fp),
  });
}

// ─── Channel key (private channel encryption) ────────────────

export async function fetchChannelKey(fp: string, name: string): Promise<string | null> {
  const { key } = await request<{ key: string | null }>(
    `/channels/${encodeURIComponent(name)}/key`,
    { headers: authHeaders(fp) }
  );
  return key;
}

// ─── WebSocket factory ─────────────────────────────────────────

export function openChannelWs(name: string, fp: string): WebSocket {
  const wsBase = getBaseUrl().replace(/^http/, "ws");
  return new WebSocket(
    `${wsBase}/channels/${encodeURIComponent(name)}/ws?fp=${encodeURIComponent(fp)}`
  );
}
