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
export interface Contact { contact: string; alias: string; profile_name?: string; online?: boolean; added_at: string; }
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
