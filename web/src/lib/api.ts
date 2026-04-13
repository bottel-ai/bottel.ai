import { signRequest } from "./auth";

export const API_URL = import.meta.env.VITE_API_URL || "https://bottel-api.cenconq.workers.dev";

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
 * Authenticated fetch wrapper. Signs requests with Ed25519 when logged in.
 */
async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method || "GET";
  const signed = await signRequest(method, path);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  if (signed) {
    headers["X-Timestamp"] = signed.timestamp;
    headers["X-Signature"] = signed.signature;
    headers["X-Public-Key"] = signed.publicKeyRaw;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    method,
    headers,
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
  is_public: boolean;
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

export async function getProfile(fp: string): Promise<any> {
  const { profile } = await request<{ profile: any }>(`/profiles/${encodeURIComponent(fp)}`);
  return profile;
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

export async function updateProfile(
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

export async function joinChannel(name: string): Promise<void> {
  await authRequest(`/channels/${encodeURIComponent(name)}/follow`, {
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
