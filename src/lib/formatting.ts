/**
 * Shared formatting utilities used across list screens.
 */

/** Human-readable relative time string from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

/** Truncate a string to `len` chars, appending an ellipsis if needed. */
export function truncate(s: string, len: number): string {
  if (!s) return "";
  return s.length > len ? s.slice(0, Math.max(0, len - 1)) + "\u2026" : s;
}
