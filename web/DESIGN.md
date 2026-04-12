# Design System — getdesign.md inspired

## Colors

### Backgrounds
- **Base**: `#000000` (pure black body)
- **Surface**: `#0a0a0a` (elevated areas)
- **Card**: `#111111` (cards, panels)
- **Elevated**: `#1a1a1a` (hover states)

### Text
- **Primary**: `#ededed` (headings, bold names)
- **Secondary**: `#a0a0a0` (descriptions, labels, stats)
- **Muted**: `#878787` (placeholders)
- **Disabled**: `#666666` (icons, disabled)

### Accent
- **Terracotta**: `#d97757` (brand accent — headings, stats numbers, CTA button bg)
- **Terracotta Dark**: `#c96442` (hover/muted variant)
- **Green**: `#3dd68c` (secondary accent)

### Border
- **Default**: `#2e2e2e` (all borders, dividers)

### Buttons
- **Primary**: bg `#d97757`, text `#000000`, border `#d97757`
- **Secondary**: bg `#ffffff`, text `#000000`
- **Ghost**: bg transparent, border `#2e2e2e`, text `#ededed`

## Typography

### Font Families
- **Sans**: `"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Mono**: `"Geist Mono", "SFMono-Regular", Menlo, monospace`
- **Display**: `"GeistPixel-Line", monospace` (hero h1 only)
- **Display Square**: `"GeistPixel-Square", monospace` (section headings, logo)

### Sizes & Weights
| Element | Font | Size | Weight | Line-height | Letter-spacing |
|---------|------|------|--------|-------------|----------------|
| Hero h1 | Display | 48-60px | 400 | 1.05 | normal |
| Section heading | Display Square | 20-24px | 600 | 1.2 | -0.01em |
| Nav logo | Display Square | 16-24px | 600 | 1 | 0.12em |
| Nav links | Sans | 12px | 600 | 1.4 | 0.1em, uppercase |
| Table header | Mono | 12px | 500 | 1.4 | normal |
| Table name | Mono | 13-14px | 600 | normal | normal |
| Table description | Sans | 12-13px | 400 | normal | normal |
| Search input | Mono | 13px | 500 | 1.4 | normal |
| Body copy | Sans | 14-16px | 400 | 1.6 | normal |
| Stat labels | Mono | 11-12px | 500 | 1.4 | 0.1em, uppercase |
| Button text | Sans | 13px | 600 | 1.4 | normal |

## Components

### Buttons
- Rounded: `rounded-md` (6px)
- Padding: `px-3 py-1.5`
- Primary: pink bg, black text, pink border
- Secondary: white bg, black text
- Ghost: transparent, `#2e2e2e` border

### Cards
- Flat, no shadow
- `#111` background, `#2e2e2e` border, 8px radius

### Table rows
- No background (transparent on `#000`)
- `border-b` with `#2e2e2e`
- Hover: `#0a0a0a` or `#1a1a1a` background
- Name + description on same row, counts right-aligned
- `py-3` vertical padding

### Search input
- No border, fully transparent
- Mono font, 13px
- `Q` icon prefix in muted color
- Placeholder in `#878787`

### Sidebar
- Category labels: mono, 14px, `#ededed` primary
- Counts: mono, 14px, `#a0a0a0` secondary
- Items separated by spacing, not borders (except "All" has border-bottom)

## Spacing
- Base: 8px
- Section padding: 64-80px vertical
- Card padding: 24-32px
- Table row: `py-3` (12px)
- Between sections: generous (80px+)

## Principles
- Dark-mode native: pure black canvas
- Flat design: no shadows, no gradients (except subtle scanline on hero)
- Monospace for data/tables/labels, sans for descriptions
- Terracotta accent used sparingly: headings, stat numbers, primary CTA
- Typography-driven hierarchy, not color
