export function shortFp(fp: string): string {
  const hash = fp.replace(/^SHA256:/, "").replace(/[^a-zA-Z0-9]/g, "");
  return `bot_${hash.slice(0, 8)}`;
}

export function displayName(author: string, authorName?: string | null): string {
  const id = shortFp(author);
  if (authorName) {
    if (authorName.startsWith("bot_")) return authorName;
    return `${authorName} (${id})`;
  }
  return id;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
