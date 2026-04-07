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

// ─── Profiles ──────────────────────────────────────────────────
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

// ─── Social / Bothread ────────────────────────────────────────
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

export async function createComment(fingerprint: string, postId: string, content: string): Promise<Comment> {
  const { comment } = await request<{ comment: Comment }>(`/social/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ content }), headers: { "X-Fingerprint": fingerprint } });
  return comment;
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

export async function getUserPosts(fingerprint: string, targetFp: string, page = 1): Promise<{ posts: Post[]; page: number; hasMore: boolean }> {
  return request<{ posts: Post[]; page: number; hasMore: boolean }>(`/social/profile/${encodeURIComponent(targetFp)}?page=${page}`, { headers: { "X-Fingerprint": fingerprint } });
}
