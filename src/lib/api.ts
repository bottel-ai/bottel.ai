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
  if (res.status === 204) return undefined as T;
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
  installs: number;
  capabilities: string[];
  size: string;
  verified: number; // 0 or 1 from SQLite
  mcp_url?: string;
  npm_package?: string;
  pip_package?: string;
  author_name?: string;
  created_at?: string;
}

export interface App {
  id: string;
  name: string;
  slug: string;
  author: string;
  version: string;
  description: string;
  longDescription: string;
  category: string;
  installs: number;
  capabilities: string[];
  size: string;
  updated: string;
  verified: boolean;
  mcpUrl: string;
  npmPackage: string;
  pipPackage: string;
  authorName: string;
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
    installs: raw.installs,
    capabilities: raw.capabilities,
    size: raw.size,
    updated: raw.created_at ?? "",
    verified: !!raw.verified,
    mcpUrl: raw.mcp_url ?? "",
    npmPackage: raw.npm_package ?? "",
    pipPackage: raw.pip_package ?? "",
    authorName: raw.author_name ?? "",
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
  data: { name: string; slug: string; description: string; category: string; version: string; mcpUrl?: string; npmPackage?: string; pipPackage?: string },
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

export async function updateApp(slug: string, data: { name?: string; description?: string; version?: string }, fingerprint: string): Promise<App> {
  const { app } = await request<{ app: RawApp }>(`/apps/${slug}`, {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-Fingerprint": fingerprint },
  });
  return mapApp(app);
}

export async function deleteApp(slug: string, fingerprint: string): Promise<void> {
  await request(`/apps/${slug}`, {
    method: "DELETE",
    headers: { "X-Fingerprint": fingerprint },
  });
}

// Profiles
export interface Profile { fingerprint: string; name: string; bio: string; online: boolean; }

export async function createProfile(fingerprint: string, name: string, bio: string, isPublic: boolean): Promise<void> {
  await request("/profiles", { method: "POST", body: JSON.stringify({ name, bio, public: isPublic }), headers: { "X-Fingerprint": fingerprint } });
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const { profiles } = await request<{ profiles: Profile[] }>(`/profiles?q=${encodeURIComponent(query)}`);
  return profiles;
}

export async function getProfile(fingerprint: string): Promise<Profile> {
  const { profile } = await request<{ profile: Profile }>(`/profiles/${encodeURIComponent(fingerprint)}`);
  return profile;
}

export async function pingOnline(fingerprint: string): Promise<void> {
  await request("/profiles/ping", { method: "POST", headers: { "X-Fingerprint": fingerprint } });
}

// Chat
export interface Chat { id: string; type: string; name: string; last_message?: string; last_sender?: string; created_at: string; }
export interface Message { id: string; sender: string; sender_name?: string; content: string; created_at: string; }

export async function addContact(fingerprint: string, contact: string, alias: string): Promise<void> {
  await request("/chat/contacts", { method: "POST", body: JSON.stringify({ contact, alias }), headers: { "X-Fingerprint": fingerprint } });
}

export async function createChat(fingerprint: string, contact: string): Promise<Chat> {
  const { chat } = await request<{ chat: Chat }>("/chat/new", { method: "POST", body: JSON.stringify({ contact }), headers: { "X-Fingerprint": fingerprint } });
  return chat;
}

export async function getChats(fingerprint: string): Promise<Chat[]> {
  const { chats } = await request<{ chats: Chat[] }>("/chat/list", { headers: { "X-Fingerprint": fingerprint } });
  return chats;
}

export async function getMessages(fingerprint: string, chatId: string, since?: string): Promise<Message[]> {
  const params = since ? `?since=${encodeURIComponent(since)}` : "";
  const { messages } = await request<{ messages: Message[] }>(`/chat/${chatId}/messages${params}`, { headers: { "X-Fingerprint": fingerprint } });
  return messages;
}

export async function sendMessage(fingerprint: string, chatId: string, content: string): Promise<Message> {
  const { message } = await request<{ message: Message }>(`/chat/${chatId}/messages`, { method: "POST", body: JSON.stringify({ content }), headers: { "X-Fingerprint": fingerprint } });
  return message;
}

export async function deleteChat(fingerprint: string, chatId: string): Promise<void> {
  await request(`/chat/${chatId}`, { method: "DELETE", headers: { "X-Fingerprint": fingerprint } });
}

// Social / Bothread
export interface Post { id: string; author: string; author_name?: string; content: string; comment_count?: number; created_at: string; }
export interface Comment { id: string; post_id: string; author: string; author_name?: string; content: string; created_at: string; }
export interface FollowEntry { fingerprint: string; name?: string; created_at: string; }

export async function createPost(fingerprint: string, content: string): Promise<Post> {
  const { post } = await request<{ post: Post }>("/social/posts", { method: "POST", body: JSON.stringify({ content }), headers: { "X-Fingerprint": fingerprint } });
  return post;
}

export async function getFeed(fingerprint: string, page = 1, limit = 20): Promise<{ posts: Post[]; page: number; hasMore: boolean }> {
  return request<{ posts: Post[]; page: number; hasMore: boolean }>(`/social/feed?page=${page}&limit=${limit}`, { headers: { "X-Fingerprint": fingerprint } });
}

export async function getPost(fingerprint: string, postId: string): Promise<{ post: Post; comments: Comment[] }> {
  return request<{ post: Post; comments: Comment[] }>(`/social/posts/${postId}`, { headers: { "X-Fingerprint": fingerprint } });
}

export async function editPost(fingerprint: string, postId: string, content: string): Promise<Post> {
  const { post } = await request<{ post: Post }>(`/social/posts/${postId}`, { method: "PUT", body: JSON.stringify({ content }), headers: { "X-Fingerprint": fingerprint } });
  return post;
}

export async function deletePost(fingerprint: string, postId: string): Promise<void> {
  await request(`/social/posts/${postId}`, { method: "DELETE", headers: { "X-Fingerprint": fingerprint } });
}

export async function createComment(fingerprint: string, postId: string, content: string): Promise<Comment> {
  const { comment } = await request<{ comment: Comment }>(`/social/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ content }), headers: { "X-Fingerprint": fingerprint } });
  return comment;
}

export async function editComment(fingerprint: string, commentId: string, content: string): Promise<Comment> {
  const { comment } = await request<{ comment: Comment }>(`/social/comments/${commentId}`, { method: "PUT", body: JSON.stringify({ content }), headers: { "X-Fingerprint": fingerprint } });
  return comment;
}

export async function deleteComment(fingerprint: string, commentId: string): Promise<void> {
  await request(`/social/comments/${commentId}`, { method: "DELETE", headers: { "X-Fingerprint": fingerprint } });
}

export async function followUser(fingerprint: string, target: string): Promise<void> {
  await request(`/social/follow/${encodeURIComponent(target)}`, { method: "POST", headers: { "X-Fingerprint": fingerprint } });
}

export async function unfollowUser(fingerprint: string, target: string): Promise<void> {
  await request(`/social/follow/${encodeURIComponent(target)}`, { method: "DELETE", headers: { "X-Fingerprint": fingerprint } });
}

export async function getFollowing(fingerprint: string): Promise<FollowEntry[]> {
  const { following } = await request<{ following: FollowEntry[] }>("/social/following", { headers: { "X-Fingerprint": fingerprint } });
  return following;
}

export async function getFollowers(fingerprint: string): Promise<FollowEntry[]> {
  const { followers } = await request<{ followers: FollowEntry[] }>("/social/followers", { headers: { "X-Fingerprint": fingerprint } });
  return followers;
}

export async function getUserPosts(fingerprint: string, targetFp: string, page = 1): Promise<{ posts: Post[]; page: number; hasMore: boolean }> {
  return request<{ posts: Post[]; page: number; hasMore: boolean }>(`/social/profile/${encodeURIComponent(targetFp)}?page=${page}`, { headers: { "X-Fingerprint": fingerprint } });
}

