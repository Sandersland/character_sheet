# Character Sheet Design System — build conventions

A small, warm "fantasy-tactile" kit: a parchment surface, deep-umber text, a
garnet primary, and three accent hues (arcane teal, resource gold, vitality
green). Five primitives — **Badge, Card, MeterBar, Modal, Tabs** — built with
Tailwind v4 utilities driven by custom `@theme` tokens.

## Setup — no provider needed

Components are self-contained: there is **no theme/context provider to wrap**.
Import a component and render it. `styles.css` (which `@import`s the token
layer and the brand fonts) is the only requirement, and the design
environment loads it for you. `Modal` portals to `document.body`, traps focus,
and is always rendered *open* — mount it conditionally and dismiss via
`onClose`. `Tabs` and `MeterBar` are **controlled**: you own the state and pass
`active`/`current`.

## Styling idiom — Tailwind v4 utilities on token-backed scales

Components carry their own look; for **your own layout glue** use the DS's
token utilities so it stays on-brand. Never invent hex values or arbitrary
classes — every value below is a real generated utility.

**Color** — five families, each on a 50→900 scale, as `bg-*` / `text-*` /
`border-*`:
| Family | Use | Example utilities |
|---|---|---|
| `parchment-50…900` | warm-grey neutrals: surfaces, text, borders | `bg-parchment-50`, `text-parchment-900`, `border-parchment-200` |
| `garnet-50…900` | primary / blood red | `bg-garnet-700`, `text-garnet-700` |
| `arcane-50…900` | magic / spell accents (teal) | `bg-arcane-500`, `text-arcane-800` |
| `gold-50…900` | resources, slots, currency | `bg-gold-500`, `text-gold-800` |
| `vitality-50…900` | healing / positive states (green) | `bg-vitality-50`, `text-vitality-700` |

**Radius**: `rounded-card` (panels, 0.625rem), `rounded-control` (buttons,
inputs, 0.375rem), `rounded-full` (pills). **Shadow**: `shadow-card` (resting
panels), `shadow-raised` (elevated/overlay). **Type**: `font-display` (Source
Serif 4 — headings, big numbers), `font-sans` (Source Sans 3 — body/UI). Tone
text small + uppercase for captions: `text-xs font-semibold uppercase
tracking-wide`.

Tokens are also CSS variables (`var(--color-garnet-700)`,
`var(--font-display)`, `var(--radius-card)`, `var(--shadow-raised)`) if you
need them in inline styles.

## Where the truth lives

- The token + utility source is the bound `styles.css` and its `_ds_bundle.css`
  import — read it before styling.
- Per-component API is `<Name>.d.ts`; usage and variants are `<Name>.prompt.md`.

## Idiomatic snippet

```tsx
import { Card, Badge, MeterBar } from "character-sheet-ds";

<Card title="Hit Points" titleAccessory={<Badge tone="garnet">Bloodied</Badge>}>
  <div className="p-4 font-sans">
    <span className="font-display text-2xl text-parchment-900">27</span>
    <span className="text-parchment-500"> / 38</span>
    <div className="mt-2">
      <MeterBar current={27} max={38} tone="garnet" label="Hit Points" />
    </div>
  </div>
</Card>
```

Color never carries meaning alone — pair every `tone`/fill with a text label
(`MeterBar` shows the numeric value; `Badge` states the status in words).
