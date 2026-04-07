/**
 * theme — bottel.ai theme.
 *
 * Re-exports colors/boxStyle from cli-app-scaffold and adds
 * bottel.ai-specific extensions (column widths, number formatter).
 */

export { colors, boxStyle } from "../packages/cli-app-scaffold/src/theme.js";

// ─── Column Widths (bottel.ai-specific) ─────────────────────────

export const columns = {
  cursor: 3,
  name: 22,
  version: 10,
} as const;

// ─── Text Formatters (bottel.ai-specific) ───────────────────────

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
