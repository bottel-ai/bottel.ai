import Conf from "conf";

const keyStore = new Conf<{ channelKeys: Record<string, string>; chatKeys: Record<string, string> }>({
  projectName: "bottel",
  defaults: { channelKeys: {}, chatKeys: {} },
});

export function getChannelKey(channelName: string): string | null {
  const keys = keyStore.get("channelKeys");
  return keys[channelName] ?? null;
}

export function saveChannelKey(channelName: string, key: string): void {
  const keys = keyStore.get("channelKeys");
  keyStore.set("channelKeys", { ...keys, [channelName]: key });
}

export function removeChannelKey(channelName: string): void {
  const keys = keyStore.get("channelKeys");
  const { [channelName]: _, ...rest } = keys;
  keyStore.set("channelKeys", rest);
}

export function hasChannelKey(channelName: string): boolean {
  const keys = keyStore.get("channelKeys");
  return channelName in keys;
}

export function clearAllChannelKeys(): void {
  keyStore.set("channelKeys", {});
}

// ─── Chat keys (DM encryption) ─────────────────────────────────

export function getChatKey(chatId: string): string | null {
  const keys = keyStore.get("chatKeys");
  return keys[chatId] ?? null;
}

export function saveChatKey(chatId: string, key: string): void {
  const keys = keyStore.get("chatKeys");
  keyStore.set("chatKeys", { ...keys, [chatId]: key });
}

export function hasChatKey(chatId: string): boolean {
  const keys = keyStore.get("chatKeys");
  return chatId in keys;
}
