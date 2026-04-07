/**
 * cli_app_theme — bottel.ai theme module.
 *
 * Re-exports the canonical theme constants from @bottel/cli-app-scaffold
 * and adds bottel.ai-specific extensions (column widths, number formatter).
 *
 * Existing screens import from "./cli_app_theme.js" — keep this façade so
 * the scaffold remains the single source of truth for colors / boxStyle
 * without requiring a sweeping rename across all screens.
 */

export { colors, boxStyle } from "@bottel/cli-app-scaffold";

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
