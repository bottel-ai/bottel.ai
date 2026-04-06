// ─── Colors ─────────────────────────────────────────────────────

export const colors = {
  primary: "#48dbfb",
  secondary: "#54a0ff",
  accent: "#ff9ff3",
  warning: "#feca57",
  success: "#2ed573",
  error: "#ff6b6b",
  border: "#5f27cd",
  dimBorder: "gray",
} as const;

// ─── Column Widths ──────────────────────────────────────────────

export const columns = {
  cursor: 3,
  name: 22,
  version: 10,
} as const;

// ─── Box Styles ─────────────────────────────────────────────────

export const boxStyle = {
  header: { borderStyle: "double" as const, borderColor: colors.border },
  section: { borderStyle: "single" as const, borderColor: colors.border },
} as const;

// ─── Text Formatters ────────────────────────────────────────────

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
