// ─── Colors ─────────────────────────────────────────────────────

export const colors = {
  primary: "#48dbfb",
  secondary: "#54a0ff",
  accent: "#ff9ff3",
  warning: "#feca57",
  success: "#2ed573",
  error: "#ff6b6b",
  border: "#5f27cd",
  orange: "#ff9f43",
  dimBorder: "gray",
} as const;

// ─── Column Widths ──────────────────────────────────────────────

export const columns = {
  cursor: 3,
  rank: 4,
  name: 22,
  author: 16,
  rating: 10,
  installs: 16,
  version: 10,
  category: 18,
} as const;

// ─── Box Styles ─────────────────────────────────────────────────

export const boxStyle = {
  header: { borderStyle: "double" as const, borderColor: colors.border },
  card: { borderStyle: "round" as const },
  cardActive: { borderStyle: "round" as const, borderColor: colors.primary },
  section: { borderStyle: "single" as const, borderColor: colors.border },
  footer: { borderStyle: "single" as const, borderColor: colors.dimBorder },
} as const;

// ─── Text Formatters ────────────────────────────────────────────

export function formatStars(rating: number): string {
  return "\u2605".repeat(Math.round(rating));
}

export function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
