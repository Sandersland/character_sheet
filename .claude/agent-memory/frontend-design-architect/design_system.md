---
name: design-system
description: Color/type/component tokens and conventions established for the character_sheet frontend (fantasy-tactile parchment direction)
metadata:
  type: project
---

Established the design system during Phase 1 scaffold (2026-06-17), when the
repo had only bare-bones stub pages and no design tokens at all (no
`tailwind.config.js` — Tailwind v4 via `@tailwindcss/vite` plugin, tokens
defined as CSS `@theme` in `frontend/src/index.css`).

## Direction chosen: fantasy-tactile parchment (not dark-mode SaaS)

Deliberately rejected a generic dark "game companion app" look in favor of a
warm parchment surface + garnet primary, since this is a literal character
*sheet* (the physical artifact players hold) — differentiates from every
other dark dashboard. Full rationale lives in the conversation, not just
here: see `frontend/src/index.css` header comment block.

## Tokens (all in `frontend/src/index.css` `@theme` block)

- Neutrals: `--color-parchment-{50..900}` — `warm-grey` family from Refactoring
  UI `swatches.json` (warm off-white → deep umber).
- Primary: `--color-garnet-{50..900}` — `red-vivid` family. 700/800 are the
  **text**-on-light role (links, ability-score numerals, garnet-as-ink); 50/100
  for tinted fills/badges. A garnet **fill** (button, active tab, bottom nav)
  does not use the ramp — see the `garnet-surface` role pair below (#994):
  the ramp inverts per-theme so it can serve as legible text on dark, and that
  inversion is exactly what turns a filled 700/800/900 salmon in dark mode.
- Accents: `--color-arcane-{50..900}` (teal, for spellcasting/magic UI),
  `--color-gold-{50..900}` (yellow, for resource meters/expertise),
  `--color-vitality-{50..900}` (green, for positive/equipped states).
- **Accent text on light must clear WCAG AA 4.5:1.** The mid accent steps are
  light enough to fail as text on near-white surfaces (e.g. `gold-700` ≈ 3.7:1,
  `arcane-600`/`garnet-500` ≈ 3.6–3.9:1). Use a step that clears AA against the
  *actual* background: as a baseline `gold` ≥ 800, `arcane` ≥ 700, `garnet` ≥ 600
  for text on parchment-50/white; bump one step darker on a tinted fill (e.g.
  `arcane-800` on `bg-arcane-100`). The lighter accent steps are for
  fills/borders/meters/badges, not text. (See #187 / #158.)
- **Light text on an accent FILL must also clear 4.5:1.** Mirror of the rule
  above: only the darker accents carry white — `garnet-600` (≈5.5:1) and
  `vitality-600` (≈4.9:1) do; `arcane` carries white only from `arcane-700`
  down (`arcane-600` ≈3.8:1, `arcane-700` ≈5.07:1, hover `arcane-800` ≈6.44:1).
  `gold` can never carry white (`gold-800` passes at ~6:1 but reads muddy), so
  filled gold flips to dark text on a bright fill: `text-parchment-900` on
  `bg-gold-400` (hover `bg-gold-500`), ≈10.5/8.5:1. (See #207.)
  **Garnet fills are the one carve-out (#994, extended #1403/#1404):**
  `garnet-600` reads fine as a fill in light, but that rule breaks in dark
  because the *ramp itself* inverts (dark `garnet-600` is `#ec5d68`, close to
  white). A garnet fill uses a dedicated non-inverting token instead of a
  numbered ramp step — `bg-garnet-surface`/`text-garnet-on-surface` for family
  A (resting garnet-700+), `bg-garnet-soft-surface`/`-hover` (same
  `text-garnet-on-surface` label) for family B (resting garnet-600), and
  `bg-garnet-meter` for MeterBar, whose contrast reference is its own track,
  not the page — see the token-role rule below and the ratios in `index.css`'s
  `@theme` comments. Arcane/vitality/gold above are unaffected — none of those
  ramps is asked to serve both a text role and a non-inverting fill role.
- **Damage-type ink** (`--color-dmg-*`, #1160/#1237): one hue per 5e damage
  type — `fire cold lightning acid poison necrotic radiant force psychic
  thunder` — all verified ≥4.5:1 against `parchment-50` (oklch→sRGB contrast
  check, not eyeballed; see the #1237 session for the conversion script).
  Physical types (piercing/slashing/bludgeoning) intentionally have **no**
  token — they stay neutral ink; only the amount is emphasized for them.
  `fire` anchors the Combat Log mockup's `--ember` (#b8501a light /
  #e0925a dark) — the existing `oklch(0.55 0.17 35)` already lands in the
  same burnt-orange family, so it was kept rather than replaced. `cold`'s
  light-mode `L` moved 0.58→0.48 (#1237) — its old value was 3.94:1, failing
  AA, undetected while `--color-dmg-*` was only ever a low-opacity (`/15`)
  pill tint (#1160); it's now full-strength chat-log text, so it had to
  clear the bar. `lightning`/`acid`/`thunder` are new (#1237) — `spellFlavor.ts`'s
  `DAMAGE_TOKEN` map (acid→poison, lightning/thunder→force) predates them and
  is a DELIBERATE, unrelated simplification for that low-opacity pill context;
  it does not need to change. The full map + physical-stays-neutral rule live
  in `lib/events.ts` (`damageTypeTone`), not duplicated here.
- **Chat-log semantic tones** (`lib/events.ts` `logToneClass`, #1237): five
  roles only — `heal` (`vitality-700`), `resource` (`gold-800`), `harm`
  (`garnet-700`, covers damage-taken/condition/crit), `muted` (`parchment-500`,
  session/combat lifecycle + miss lines), `default` (`parchment-800`). Resist
  the urge to add more roles per event category — the mockup's color table is
  deliberately narrow ("color only where meaningful").
- Fonts: `--font-display` = Source Serif 4 (headings only, h1-h3), `--font-sans`
  = Source Sans 3 (body/UI default). Loaded via Google Fonts `<link>` tags in
  `frontend/index.html` (no local font files, no extra build dep).
- Spacing: Tailwind's built-in numeric scale (`p-4`, `gap-2`, `w-14`, `max-w-6xl`) works as normal. No custom named spacing tokens — they were removed because bare `--spacing-{name}` tokens collide with Tailwind's `--container-*` scale and break `max-w-sm/md/lg/xl`. If a named rhythm is ever needed, prefix as `--space-*`.
  Radius: `--radius-card` (0.625rem) and `--radius-control` (0.375rem) — only
  two radius values, reused everywhere per components.md's "pick one
  corner-radius convention."
  Shadows: `--shadow-card` and `--shadow-raised` — a 2-level elevation system.
  `--shadow-card` leads with a soft top-edge inset highlight
  (`inset 0 1px 0 rgb(255 255 255 / .4)` light, near-none in dark) for "pressed
  paper" depth (#228).

## Parchment texture (#228) — `index.css`

Subtle paper grain over the flat color surfaces, pure CSS + inline SVG (no
raster asset). One reusable token `--texture-grain` (a `feTurbulence`
fractal-noise data-URI; note `%` is encoded `%25` inside the SVG) is painted at
`background-size: 200px`. Two layers consume it:
- **Page canvas**: a fixed `pointer-events:none` `body::before` (`z-index:-1`,
  behind content) at `--texture-page-opacity` (0.06 light / 0.04 dark).
- **Card grain**: the `.surface-grain` class (added to `Card.tsx`) paints an
  absolutely-positioned `::after` with `border-radius: inherit` at
  `--texture-card-opacity` (0.035 light / 0.025 dark).

Both use `--texture-blend`: `multiply` in light (darkens), `screen` in dark
(lightens). Per-theme opacity/blend props live under `:root` /
`[data-theme="dark"]`. Subtle by design — visible grain, no text/contrast impact.

None of the 24 pre-built `palette-themes.md` palettes targeted a parchment
mood, so the palette was assembled from individual hue families in
`swatches.json` directly, following `colors.md`'s "greys don't have to be
neutral" + shade-scale rules. If revisiting colors later, check
`palette-themes.md` again in case new palettes have been added.

## Dark mode (#211) — `[data-theme="dark"]` in `index.css`

Dark mode redefines the same `--color-*` tokens under `[data-theme="dark"]`; no
component changes. Architecture: **reversed ramps** — `-50` is the darkest
surface and `-900` the lightest text, the mirror of light mode. The neutral
parchment ramp stays warm (umber-tinted darks, cream-tinted lights), and each
accent (garnet/arcane/gold/vitality) is rebuilt as a dark-to-light ramp so its
mid/high steps read as text/affordances against dark surfaces.

**Token-role rule (#994) — read this before "fixing" a ramp back:** an accent
ramp that inverts per-theme is a **text** role — that's the whole point of
reversing it, so it stays legible on dark. A **fill** (button/tab/nav
background) is a different role with a different constraint: it must clear
3:1 against the page in *both* themes (SC 1.4.11), which an inverted ramp
cannot do (a fill built from a "text-legible-on-dark" step is, by
construction, too light to read as a shape there). Don't reuse a ramp step for
both roles on the same hue. If a hue needs a fill, give it its own
non-inverting `<hue>-surface`/`<hue>-surface-hover`/`<hue>-surface-deep`/
`<hue>-on-surface` set (the `garnet-surface` pair is the template) rather than
picking a "less bad" ramp step — the two roles' constraints are incompatible,
not just differently tuned.

- **Shadows**: `--shadow-card`/`--shadow-raised` get deeper, near-black opacities
  for elevation against dark surfaces.
- **Backdrop**: `--color-backdrop` (modal scrim) is a `@theme` token —
  `rgb(39 36 29 / 0.45)` light, `rgb(0 0 0 / 0.66)` dark — consumed via the
  `bg-backdrop` utility in `Modal.tsx` (kept out of `@theme inline` so the
  runtime override applies). The focus ring uses `var(--color-garnet-600)` and
  auto-adapts.
- **Filled-button labels (resolved in #213)**: a hard-coded `text-white` /
  `text-parchment-900` label does **not** co-flip with a remapped fill, so #211's
  ramp reversal broke AA on filled buttons in dark mode. Resolution: labels on
  fills that **invert** between modes (garnet/arcane/vitality `-600`/`-700`) use
  `text-parchment-50` — near-white in light, near-black in dark — so the label
  always contrasts its fill. Gold is **light-ish in both modes** (`gold-400`
  #f7d070 light / #c2991f dark), so its label uses `--color-ink` (#27241d, the
  fixed `text-ink` token that does **not** flip), giving ≈10.5:1 light / ≈5.6:1
  dark. Apply the same choice to any new filled accent control.
  **Garnet carve-out (#994, extended #1403/#1404):** this
  `text-parchment-50`-on-inverting-fill pattern is exactly what broke on
  garnet — a *filled* garnet surface can't co-flip with `text-parchment-50`
  and also satisfy the fill's own 3:1 page-boundary bar, because the two bars
  pull the ramp in opposite directions. Garnet fills were carved out onto
  non-inverting tokens instead: `garnet-surface`/`garnet-on-surface` (family A),
  `garnet-soft-surface`/`-hover` sharing the same `garnet-on-surface` label
  (family B), and `garnet-meter` (MeterBar, tuned against its own track rather
  than the page) — measured ratios live in `index.css`'s `@theme` comments;
  mechanically enforced by `frontend/src/test/tokenContrast.test.ts`.
  Arcane/vitality/gold above are unaffected — the failure mode was garnet
  specifically being asked to serve both a text role (needs to invert) and a
  fill role (must not), and neither of those hues is used as a
  full-saturation page-level fill today.

## Component conventions (`frontend/src/components/`)

- `Card` — base surface, optional `title` header row, used for every major
  section on the sheet page.
- `Badge` — soft-background pill, `tone` prop maps to the 5 color families.
- `AbilityScoreBox` — the classic D&D ability box: modifier is primary
  (large, garnet), raw score is a secondary pill below it, small arcane dot
  if the save is proficient. Lives at a fixed `lg:w-[16rem]` 2x3 grid on the
  desktop sheet page. The actual fix for box proportions (boxes were
  rendering as ~120px-wide x ~210px-tall slivers) was `lg:items-start` on
  the *outer* `lg:grid-cols-[auto_1fr]` row in `CharacterSheetPage.tsx`:
  CSS grid's default `align-items: stretch` was forcing the rail to match
  the Skills card's full height (~660px, driven by 18 skill rows) and then
  distributing that height across the rail's own 3 rows. Changing the
  rail's column count or width alone (tried first) only changed how many
  rows split that same forced height — it never addressed the actual cause.
  `items-start` lets the rail size to its own content instead of stretching
  to its sibling's height. Lesson: when a grid item's height looks wrong,
  check the *parent* grid's `align-items` before tweaking the item's own
  width/columns/padding — a sibling-driven stretch can masquerade as a
  proportion problem in the child.
- `MeterBar` — generic resource bar (HP, spell slots), always paired with
  numeric text per colors.md (never color-only signal).
- `SkillsTable`, `InventoryList`, `SpellsSection`, `JournalSection`,
  `VitalsStrip`, `BackendStatus`, `CharacterCard` — page-specific composed
  components, all consuming the shared tokens above.
- Portrait slots are **4:5, fixed** (#1618): both `CharacterCard`'s list media
  box and `IdentityCard`'s portrait region render one `aspect-[4/5]` container
  in every state — an absolute-fill `object-cover` img when a portrait exists,
  the garnet-100→parchment-200 monogram/empty gradient otherwise. Absolute
  fill matters: an in-flow img's intrinsic height is the flex item's
  min-content floor and pushes a *preferred* aspect-ratio taller, which is
  what broke mixed portrait/monogram grid rows. Sheet-side portraits render at
  ≤ w-48 (uploads are ≤512px WebP; wider goes soft). New portrait surfaces
  should reuse the same ratio + fill pattern.
- Icons — all resolve through `components/ui/icons.ts`: `lucide-react` for UI
  chrome (kebab, chevron, search, +/−/✕), `react-icons/gi` for D&D flavor
  (abilities, item categories, empty-state heroes). Subpath imports only;
  domain→icon lookups are typed `Record<…, IconType>` maps. Icons are
  monochrome `currentColor` (never `fill`/hex) — they inherit a parent
  `text-*` token, so they read correctly in both light and dark. Decorative
  icons get `aria-hidden`; icon-only buttons keep their `aria-label`.

## Mock data layer

`frontend/src/types/character.ts` defines the full future `Character` shape
(ability scores, skills, inventory, spellcasting, journal) anticipating the
Phase 2 Prisma model described in CLAUDE.md. `frontend/src/mock/characters.ts`
exports `CHARACTER_SUMMARIES` and `getCharacterById()` — kept separate from
`frontend/src/api/client.ts` deliberately, since CLAUDE.md reserves
`client.ts` for real backend calls only. When real `/api/characters` routes
land, the pages' `useCharacterList`/`useCharacter` hook bodies are the only
things that need to change (swap the mock import for a `client.ts` call +
loading/error state).

## Verification workflow note

No project-level "run" skill existed for this repo as of 2026-06-17. Used
the `run` skill's browser-driven fallback pattern (Playwright directly, since
`chromium-cli` wasn't available in this environment) — installed
`playwright@1.61.0` + chromium into a scratch `/tmp` directory rather than
adding it as a project dependency, since it was only needed for one-off
visual verification, not for the project's own test suite.
