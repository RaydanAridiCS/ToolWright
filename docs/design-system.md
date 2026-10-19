# Design system

Toolwright's interface should feel calm, precise and trustworthy: lots of whitespace, clear hierarchy, and nothing that looks like an ad.

## Principles

1. **The tool is the page.** Controls and results come first; explanation sits around them.
2. **Immediate results.** Sensible defaults and sample data so a tool does something useful the moment it loads.
3. **Say what happened.** Show sizes before/after, counts, exact error locations, and what was removed.
4. **Accessible by default.** Real labels, visible focus, keyboard support, AA contrast, no reliance on color alone.
5. **Quiet motion.** Subtle transitions only; everything respects `prefers-reduced-motion`.

## Color

Defined as CSS variables in `apps/web/src/app/globals.css` and exposed to Tailwind (`bg-background`, `text-muted-foreground`…). **Always use tokens, never raw hex values**, so light and dark themes stay correct.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#f9f9fe` | `#0a0a18` | Page |
| `foreground` | `#14142b` | `#ececf8` | Text |
| `card` | `#ffffff` | `#12122a` | Panels, inputs |
| `muted` / `muted-foreground` | `#eeeef8` / `#565675` | `#1a1a36` / `#a0a0c6` | Quiet surfaces, secondary text |
| `border` | `#e0e0ef` | `#272750` | Dividers, outlines |
| `primary` | `#4338ca` (indigo) | `#8b93ff` | Actions, links, focus |
| `accent` | `#0f766e` (teal) | `#2dd4bf` | Secondary highlights |
| `success` / `warning` / `danger` | `#166534` / `#8a6a00` / `#b91c1c` | `#4ade80` / `#facc15` / `#f87171` | Status |

Brand = **indigo + teal**. Do not introduce orange as a brand, accent or primary color. Status colors are reserved for status.

Contrast: body text and `muted-foreground` meet WCAG AA on `background` and `card` in both themes; badges with tinted backgrounds (`bg-success/12` etc.) are checked by the axe audits in CI.

## Typography

- **Geist Sans** for UI, **Geist Mono** for code, results and inputs that are data. Fonts are bundled with the app (no Google Fonts request).
- Headings use tight tracking and `text-balance`; body copy uses `text-pretty`. Long-form pages use the `.prose-tw` class.
- Minimum body size 14px (`text-sm`); help text 12px (`text-xs`) only for non-essential hints.

## Layout

- Page container: `max-w-7xl`, 16px gutters on phones (`px-4`), 24px from `sm`.
- Cards: `rounded-xl border border-border bg-card shadow-sm`. Grids: `gap-4`.
- Tools stack on phones and go two-column from `lg`. Nothing may cause horizontal page scroll at 360px (tested).
- Sticky header with backdrop blur; the command palette (`Ctrl/Cmd+K`, `/`) is the primary navigation for power users.

## Components (`packages/ui`)

| Component | Notes |
| --- | --- |
| `Button` | Variants `primary`, `secondary`, `outline`, `ghost`, `danger`; sizes `sm`, `md`, `lg`, `icon`. Icon-only buttons **must** have `aria-label`. |
| `Field` + `Input` / `Textarea` / `Select` | `Field` wires the label to the control via a generated id. Use `mono` for data. |
| `Toggle` | A native checkbox with `role="switch"`. |
| `SegmentedControl` | A radio group styled as tabs, for 2–4 mutually exclusive modes. |
| `Panel`, `Card`, `Stat`, `StatGrid`, `Badge`, `Alert`, `Kbd` | Layout and feedback. `Alert tone="error"` uses `role="alert"`. |
| `ScrollArea` | Scrollable box that is keyboard-focusable and labelled (required for any scrolling region). |
| `CopyButton`, `DownloadButton`, `FileDropzone`, `FileListItem` | Standard actions; the drop zone is also a real `<input type="file">`, so it works with keyboard and assistive tech. |
| `TransformTool` | The input → options → output tool. |

### Accessibility rules of thumb

- **Label in name (WCAG 2.5.3).** If a control has visible text, don't override its accessible name with a different `aria-label`. (Icon-only controls get an `aria-label`.)
- **Don't communicate state with color only.** Pair color with an icon or text (pass/fail badges, copy confirmation).
- **Scrollable regions** use `ScrollArea` (focusable, labelled).
- **Live results** use `aria-live="polite"` sparingly (counts, copy confirmation); errors use `role="alert"`.
- **Focus.** Never remove outlines. The global `:focus-visible` ring uses `--ring`.
- **Targets.** Primary controls are at least 40px tall on touch layouts.

## Icons and imagery

[lucide-react](https://lucide.dev), 16–20px inline, decorative icons marked `aria-hidden`. No stock photography or illustrations; the product is the interface. The logo is the `LogoMark` component (`T` tile with a teal dot).

## Theming

Light, dark and system. A tiny inline script in `<head>` sets the `dark` class before first paint (no flash); `ThemeToggle` cycles the modes and stores the choice in `localStorage`.

## Content voice

Plain, specific and honest: "Removed EXIF · 1.2 KB", not "Successfully optimized!". Tell people what a tool can't do. No dark patterns, no upsells, no urgency.
