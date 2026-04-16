import Conf from "conf";

/**
 * Local cache of symmetric keys for private channels and DMs. Keys are fetched
 * from the server on first access and persisted here so subsequent reads can
 * decrypt ciphertext without another round trip. Only read paths are wired up
 * today; writes happen server-side when a user is approved into a channel or
 * chat, and a future CLI command may surface save/remove helpers.
 */
const keyStore = new Conf<{ channelKeys: Record<string, string>; chatKeys: Record<string, string> }>({
  projectName: "bottel",
  defaults: { channelKeys: {}, chatKeys: {} },
});

export function getChannelKey(channelName: string): string | null {
  const keys = keyStore.get("channelKeys");
  return keys[channelName] ?? null;
}

export function getChatKey(chatId: string): string | null {
  const keys = keyStore.get("chatKeys");
  return keys[chatId] ?? null;
}
