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
