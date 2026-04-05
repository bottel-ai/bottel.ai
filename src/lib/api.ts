const API_URL = process.env.BOTTEL_API_URL || "https://bottel-api.cenconq.workers.dev";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// Raw API shape (snake_case from D1)
interface RawApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  long_description: string;
  category: string;
  author: string;
  version: string;
  rating: number;
  reviews: number;
  installs: number;
  capabilities: string[];
  size: string;
  verified: number; // 0 or 1 from SQLite
  created_at?: string;
}

// Frontend-friendly shape matching existing Agent interface
export interface App {
  id: string; // slug (used as id throughout the frontend)
  name: string;
  slug: string;
  author: string;
  version: string;
  description: string;
  longDescription: string;
  category: string;
  rating: number;
  reviews: number;
  installs: number;
  capabilities: string[];
  size: string;
  updated: string;
  verified: boolean;
}

function mapApp(raw: RawApp): App {
  return {
    id: raw.slug,           // frontend uses slug as id
    name: raw.name,
    slug: raw.slug,
    author: raw.author,
    version: raw.version,
    description: raw.description,
    longDescription: raw.long_description,
    category: raw.category,
    rating: raw.rating,
    reviews: raw.reviews,
    installs: raw.installs,
    capabilities: raw.capabilities,
    size: raw.size,
    updated: raw.created_at ?? "",
    verified: !!raw.verified,
  };
}

export async function getApps(query?: string): Promise<App[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  const qs = params.toString();
  const { apps } = await request<{ apps: RawApp[] }>(`/apps${qs ? `?${qs}` : ""}`);
  return apps.map(mapApp);
}

export async function getApp(slug: string): Promise<App> {
  const { app } = await request<{ app: RawApp }>(`/apps/${slug}`);
  return mapApp(app);
}

export async function submitApp(
  data: { name: string; slug: string; description: string; category: string; version: string },
  fingerprint: string,
): Promise<App> {
  const { app } = await request<{ app: RawApp }>("/apps", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-Fingerprint": fingerprint },
  });
  return mapApp(app);
}

export async function getMyApps(fingerprint: string): Promise<App[]> {
  const { apps } = await request<{ apps: RawApp[] }>(`/apps?author=${encodeURIComponent(fingerprint)}`);
  return apps.map(mapApp);
}

export async function getUserInstalls(fingerprint: string): Promise<App[]> {
  const { installs } = await request<{ installs: RawApp[] }>("/user/installs", {
    headers: { "X-Fingerprint": fingerprint },
  });
  return installs.map(mapApp);
}

export async function toggleInstall(appId: string, fingerprint: string): Promise<boolean> {
  const { installed } = await request<{ installed: boolean }>(`/user/installs/${appId}`, {
    method: "POST",
    headers: { "X-Fingerprint": fingerprint },
  });
  return installed;
}
