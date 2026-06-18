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
- Primary: `--color-garnet-{50..900}` — `red-vivid` family. 700/800 for
  primary actions/text-on-light, 50/100 for tinted fills/badges.
- Accents: `--color-arcane-{50..900}` (teal, for spellcasting/magic UI),
  `--color-gold-{50..900}` (yellow, for resource meters/expertise),
  `--color-vitality-{50..900}` (green, for positive/equipped states).
- Fonts: `--font-display` = Source Serif 4 (headings only, h1-h3), `--font-sans`
  = Source Sans 3 (body/UI default). Loaded via Google Fonts `<link>` tags in
  `frontend/index.html` (no local font files, no extra build dep).
- Spacing scale: `--spacing-{xs,sm,md,lg,xl,2xl}` = 0.5/0.75/1/1.5/2.25/3.5rem.
  Radius: `--radius-card` (0.625rem) and `--radius-control` (0.375rem) — only
  two radius values, reused everywhere per components.md's "pick one
  corner-radius convention."
  Shadows: `--shadow-card` and `--shadow-raised` — a 2-level elevation system.

None of the 24 pre-built `palette-themes.md` palettes targeted a parchment
mood, so the palette was assembled from individual hue families in
`swatches.json` directly, following `colors.md`'s "greys don't have to be
neutral" + shade-scale rules. If revisiting colors later, check
`palette-themes.md` again in case new palettes have been added.

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
