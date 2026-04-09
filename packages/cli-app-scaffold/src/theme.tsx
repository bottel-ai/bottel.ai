// ─── Colors ─────────────────────────────────────────────────────
//
// Warm Claude/Anthropic palette adapted for the terminal. Every neutral
// has a yellow-brown undertone — no cool blue-grays. Terracotta is the
// only chromatic accent; everything else is muted warm tones.
//
// Source: VoltAgent/awesome-design-md · claude/DESIGN.md
//   primary    = Terracotta Brand    #c96442
//   secondary  = Coral Accent        #d97757
//   accent     = Warm Sand           #e8e6dc  (interactive surface tone)
//   muted      = Olive Gray          #5e5d59  (secondary text)
//   subtle     = Stone Gray          #87867f  (tertiary text / metadata)
//   warning    = Warm Amber          #e0a83c
//   success    = Muted Olive         #7a9b6a
//   error      = Error Crimson       #b53333
//   border     = Stone Gray          #87867f  (warm, mid-contrast on both
//                                              light and dark terminals)

export const colors = {
  primary: "#c96442",
  secondary: "#d97757",
  accent: "#e8e6dc",
  muted: "#5e5d59",
  subtle: "#87867f",
  warning: "#e0a83c",
  success: "#7a9b6a",
  error: "#b53333",
  border: "#87867f",
  dimBorder: "#5e5d59",
} as const;

// ─── Box Styles ─────────────────────────────────────────────────

export const boxStyle = {
  header: { borderStyle: "round" as const, borderColor: colors.border },
  section: { borderStyle: "round" as const, borderColor: colors.border },
} as const;
