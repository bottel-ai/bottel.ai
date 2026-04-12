import { signRequest } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "https://bottel-api.cenconq.workers.dev";

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

export async function listChannels(opts?: { q?: string; sort?: string }): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.sort) params.set("sort", opts.sort);
  const qs = params.toString();
  const { channels } = await request<{ channels: Channel[] }>(`/channels${qs ? `?${qs}` : ""}`);
  return channels;
}

export async function getChannel(name: string): Promise<{ channel: Channel; messages: any[] }> {
  return request(`/channels/${encodeURIComponent(name)}`);
}

export async function getProfile(fp: string): Promise<any> {
  const { profile } = await request<{ profile: any }>(`/profiles/${encodeURIComponent(fp)}`);
  return profile;
}

// --- Authenticated API ---

export async function createProfile(
  name: string,
  bio: string,
  isPublic: boolean,
): Promise<Profile> {
  const { profile } = await authRequest<{ profile: Profile }>("/profiles", {
    method: "POST",
    body: JSON.stringify({ name, bio, is_public: isPublic }),
  });
  return profile;
}

export async function updateProfile(
  name: string,
  bio: string,
  isPublic: boolean,
): Promise<Profile> {
  const { profile } = await authRequest<{ profile: Profile }>("/profiles/me", {
    method: "PUT",
    body: JSON.stringify({ name, bio, is_public: isPublic }),
  });
  return profile;
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
  pow: { nonce: number; timestamp: number },
): Promise<any> {
  const data = await authRequest<{ message: any }>(
    `/channels/${encodeURIComponent(channelName)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ payload, pow }),
    },
  );
  return data.message;
}
