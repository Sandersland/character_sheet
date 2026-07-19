# Frontend guidelines

Read this when writing frontend code. This doc holds conventions and footguns you can't derive from reading the code. For what exists where, read the code: `ls frontend/src/features`, `App.tsx` for routes, `components/ui/` for primitives.

## Where does X go?

Work through this checklist in order; stop at the first match:

1. **Pure logic, no JSX/React** → `lib/` (unit-testable in isolation).
2. **A React hook** — used by multiple clusters or by a page → `hooks/`; used only within one feature cluster → co-locate it in that cluster.
3. **A component with no D&D knowledge** — no imports from `@/types/character`, no `@/api` calls, could ship in a different app unchanged → `components/ui/`.
4. **Any other component** → `features/<domain>/` (create a new folder if none fits).
5. **Types** — app-wide → `types/character.ts`; one cluster only → that cluster's folder.

Use `@/` (→ `frontend/src/`) for **every** source import, including same-folder siblings — never relative `../` paths.

## Tailwind v4

- Loaded via `@tailwindcss/vite`; the only setup is `@import "tailwindcss";` in `index.css`. No `tailwind.config.js`/`postcss.config.js` — correct for v4, don't add them.
- Custom `@theme` tokens auto-generate idiomatic utilities — prefer `text-garnet-700`, `rounded-card`, `shadow-card` over `[var(...)]` syntax. Arbitrary values only for genuine one-offs (`text-[11px]`, `max-h-[80vh]`).
- **Footgun:** never add bare `--spacing-{name}` tokens — they collide with Tailwind's `--container-*` scale and break `max-w-sm/md/lg/xl`. Use a `--space-*` prefix if a spacing token is ever wanted.

## Design tokens & contrast

Tokens live in `frontend/src/index.css` (`@theme`); the full reference and rationale is `.claude/agent-memory/frontend-design-architect/design_system.md`. Families: `parchment`/`garnet`/`arcane`/`gold`/`vitality` color ramps, `--font-display`/`--font-sans`, two radii (`card`/`control`), two shadows (`card`/`raised`).

WCAG AA rules that have shipped broken before (full rationale in `design_system.md`):

- Readable text on parchment uses `parchment-600` or darker; `-400`/`-500` are reserved for `placeholder:`, `disabled:`, and decorative glyphs only.
- Accent text on light surfaces: `gold` ≥ 800, `arcane` ≥ 700, `garnet` ≥ 600 (one step darker on a tinted fill).
- Light text on accent fills must also clear 4.5:1 — use `text-parchment-50` (which flips with the theme), never `text-white`. Gold never carries white: filled gold is dark `text-ink` on `bg-gold-400`.
- Dark mode is `[data-theme="dark"]` token overrides; use tokens that flip, never hard-coded colors.

## UI patterns

- **Inline panels vs overlays:** every add/edit surface is an inline expand-in-place panel within its Card. `Modal` is reserved for read-only review surfaces and destructive confirms. The turn/session surface uses `BottomSheet` (mobile sheet, centered dialog at `md`+); keep it scoped there.
- **Overlay machinery is shared:** build any new dialog on `hooks/useDialogChrome.ts` (focus trap/Esc/scroll-lock) and any new dismissable popup on `hooks/useDismissable.ts` — never re-hand-roll the keydown/click-outside/focus-restore block.
- **Loading is delay-gated:** wrap loading indicators in `useDelayedFlag` so fast fetches render nothing (no flashing spinner); pair with the `Spinner` primitive. Never bare "Loading…" text.
- **Icons resolve through `components/ui/icons.ts`** — lucide for chrome, game-icons for D&D flavor, per-icon subpath imports, monochrome `currentColor` (no `fill`/hex), `aria-hidden` when decorative. No colorful emoji in the UI.
- **Never render a raw skill/ability/enum key** — resolve display text through the label helpers (`lib/abilities.ts`, `lib/mentions.ts`, `lib/items.ts`, …). See the CLAUDE.md non-negotiable.
- **Orchestrator/row split** for large interactive sections: one orchestrator owns state + API batching + `onUpdate`; rows are presentational with callbacks. Reference: `features/inventory/InventoryList` / `InventoryRow`.
- **Full-screen wizard/stepper:** a multi-step guided flow is its own route rendering a full-screen ceremony, not a modal. Reference: `features/level-up/` (`useLevelUpCeremony` state machine + `StepRail`).

## API calls

All `fetch` goes through `frontend/src/api/client.ts` (`apiFetch`: credentials + a single registered 401 handler). New endpoints delegate to `request<T>`/`send`; intent-bearing transactions go through `postTransactions`. Never call `fetch` from a component.

## Dice engine

- `lib/dice.ts` is the **only** place `Math.random` is called for dice.
- A crit doubles the damage **dice** (`count`), never the modifier (RAW).
- `mode` (advantage/disadvantage) applies **only** to a single d20 (`usesAdvantage` guard); multi-die specs ignore it. The dropped die stays in `RollResult.dice` flagged `dropped`.
- Roll mode is resolved per-roll via `lib/rollMode.ts` `resolveRollMode(rollModifiers, category, manualMode)` — state grants (conditions/buffs, server-derived `rollModifiers`) merge with the player's manual pick; adv+dis from different sources cancel to normal (RAW).
- Roll surfaces go through `RollContext` (`RollProvider`), which also handles best-effort session logging. In tests, stub `@/features/dice/DiceRoller` (Three.js won't render in jsdom) and assert with `findByTestId` (the 3D stack is lazy-loaded).

## Bundle splitting

The three.js dice stack (~1.1 MB) must never reach the initial bundle. Two levers work together (one alone fails): `React.lazy` seams break static reachability, and `manualChunks` in `vite.config.ts` pins `dice-vendor` and `react-vendor` apart — without a dedicated `react-vendor`, Rollup folds React into `dice-vendor` and the entry drags the 3D stack back in. Verify by confirming `dice-vendor` is not a `modulepreload` in the built `dist/index.html`.

Dice text under the single-origin CSP: troika runs with `useWorker: false` (`lib/troikaTextConfig.ts`) and a bundled same-origin woff font — the worker's `blob:` importScripts and the CDN font fetch are both CSP-blocked, and local split-origin dev never exercises this.

## Design gate

Run `/verify-frontend` before opening a frontend PR — it runs unit tests, browser verification, and a design review (off-token colors/radii/shadows, reinvented primitives, and raw keys are blocking findings).
