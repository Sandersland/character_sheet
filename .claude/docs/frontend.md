# Frontend guidelines

## Directory structure — where things belong

Source of truth: `ls frontend/src/features` — regenerate if stale.

```
frontend/src/
├── components/
│   └── ui/              # domain-agnostic primitives (Card, Badge, MeterBar, Modal, Tabs, OverflowMenu, ErrorBoundary)
├── features/
│   ├── abilities/       # AbilityScoreBox, AbilityScoreEditor, SkillsTable, ProficienciesCard
│   ├── advancement/     # AdvancementSection, AdvancementPanel
│   ├── auth/            # AuthProvider (useAuth), AuthGate, AppHeader
│   ├── character-meta/  # CharacterCard, VitalsStrip, JournalSection, JournalEntryPanel,
│   │                    #   ActivityModal, DeleteCharacterModal, BackendStatus
│   ├── class/           # ClassFeaturesSection, FightingStylePanel, AddManeuverPanel,
│   │                    #   ManeuverRow, ResourcePoolRow
│   ├── conditions/      # ConditionsStrip, AddConditionPanel
│   ├── dice/            # DiceRoller, PhysicsDiceRoller, DiceScene, DieMesh, DiceRollSequence,
│   │                    #   RollButton, RollContext, RollResultToast,
│   │                    #   diceRollerTypes.ts, useDieFaceData.ts
│   ├── experience/      # ExperienceTracker
│   ├── hitpoints/       # HitPointTracker (inline Card; hosts LevelUpModal + ConcentrationSaveModal)
│   ├── inventory/       # InventoryList, InventoryRow, AddItemPanel,
│   │                    #   StartingEquipmentEditor
│   ├── session/         # TurnHub, TurnTracker, useTurnState, SessionLog, SessionsModal,
│   │                    #   SessionSummaryModal, Inline{Attack,Item,Spell}Picker, ManeuverPrompt,
│   │                    #   EndSessionPrompt, actionResolvers.ts, useActiveResolution, useManeuverDie
│   ├── spells/          # SpellsSection, SpellRow, AddSpellPanel
│   └── theme/           # ThemeProvider (useTheme) — applies data-theme app-wide
├── hooks/               # reusable React hooks used by pages or multiple clusters
│   │                    #   (useCharacter, useCharacterList, useCharacterDraft, useReferenceData,
│   │                    #    useThemePreference)
├── lib/                 # pure TS logic — NO React/JSX (dice, abilities, timeline, startingEquipment, …)
├── pages/               # route-level views (CharacterListPage, CharacterSheetPage,
│   │                    #   CharacterCreatePage, SessionPage, LoginPage)
├── api/
│   └── client.ts        # the only fetch() call site (apiFetch wrapper: credentials + 401)
├── types/
│   ├── character.ts     # shared domain types
│   └── auth.ts          # AuthUser, AuthProviderInfo
└── test/
    ├── setup.ts         # vitest/jsdom setup (jest-dom + jest-axe matchers + RTL cleanup)
    └── axe.ts           # re-exports jest-axe `axe` + vitest type augmentation
```

### Decision rule — "where does X go?"

Work through this checklist in order; stop at the first match:

1. **Pure logic, no JSX/React** → `lib/` (e.g. `lib/dice.ts`, `lib/abilities.ts`).
2. **A React hook** — used by multiple clusters or by a page → `hooks/`; used only within one feature cluster → co-locate it in that cluster (e.g. `features/dice/useDieFaceData.ts`).
3. **A component with no D&D knowledge** — no imports from `@/types/character`, no `@/api` calls, no game-rule logic, could ship in a different app unchanged → `components/ui/`.
4. **Any other component** → `features/<domain>/` (the cluster that owns it; create a new folder if none fits).
5. **Types** — used app-wide → `types/character.ts`; used by one cluster only → that cluster's folder.

### `lib/` — pure-logic inventory

Source of truth: `ls frontend/src/lib`. No React/JSX; all unit-testable in isolation.

| File | Purpose |
|---|---|
| `dice.ts` | The sole `Math.random` dice site — `rollDie`/`rollSpec`/`summarizeRoll`/`formatRollSpec` (see Dice engine below). |
| `abilities.ts` | Ability/skill/save labels + `abilityModifier` math; resolve all display keys through here. |
| `items.ts` | `isEquippable(category)` + `EQUIPPABLE_CATEGORIES` — equippability rule (weapon/armor yes, consumable/gear no). Mirror of backend `lib/items.ts`; gate the Equip control through here, never inline-check `category`. Also `itemCategoryLabel` + `ITEM_CATEGORY_LABELS`/`ITEM_CATEGORY_ORDER`/`ITEM_CATEGORY_OPTIONS` — resolve category display through here, never a raw key. |
| `events.ts` | Activity-log display lookups — `eventTypeLabel`/`categoryLabel`/`categoryTone` (tolerant `Partial<Record>` maps, raw-key fallback) + `INVENTORY_EVENT_TYPES` for the filter chips. Resolve all event type/category keys through here, never inline-capitalize. |
| `timeline.ts` | Groups/formats audit events for the activity timeline (`groupByBatch`/`groupByDate`, generic over `{id,batchId,createdAt}`). |
| `currency.ts` | Copper-based currency math — `toCopper`/`fromCopper`/`splitLumpSum` + `formatCurrency` (unsigned, largest-first denomination string). |
| `sellBatch.ts` | `summarizeSellBatch` collapses a bulk-sale batch (>1 row, all `sold`) into one line summary for ActivityModal; returns `null` for non-bulk-sale batches. |
| `startingEquipment.ts` | Character-creation equipment helpers (`isPackageComplete`, `isGoldValid`, `EquipmentDraft`). |
| `characterCreationValidation.ts` | Explains *why* the creation Save button is disabled (`missingRequirements`). |
| `abilityGen.ts` | Ability-score generation methods (point-buy / standard array / roll). |
| `dieFaces.ts` | Static die-face geometry data for the 3D rollers. |
| `physicsDice.ts` | Physics-roller setup (cannon/three glue) for `PhysicsDiceRoller`. |
| `spellCast.ts` | Pure cast-roll math (cantrip scaling, upcast dice, heal modifier) shared by SpellsSection + InlineSpellPicker. |
| `spellMeta.ts` | Pure spell display helpers (school tone, metadata) shared across spell surfaces. |
| `turnRules.ts` | 5e turn economy derived from class/level (`deriveAttacksPerAction`, action lists). |
| `encumbrance.ts` | Carrying capacity (`carryingCapacity` = STR × 15), derive-on-read. |
| `fightingStyles.ts` | Fighting-style labels/descriptions (presentation; backend is rules source of truth). |
| `maneuvers.ts` | Battle Master maneuver classification data (mechanic/slot) for ManeuverPrompt. |
| `conditions.ts` | 5e condition labels/descriptions for the chip strip + picker. |
| `formatJournalDate.ts` | Formats ISO journal dates in UTC ("Jun 22, 2026"). |

### `@/` path alias

`@/` maps to `frontend/src/`. Configured in `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`); Vitest inherits it automatically from Vite.

```ts
// ✓ Always use @/ for cross-file imports
import Badge from "@/components/ui/Badge";
import { useCharacter } from "@/hooks/useCharacter";
import type { InventoryItem } from "@/types/character";

// ✗ Never use relative ../ paths — they break on moves and are hard to grep
import Badge from "../../components/ui/Badge";
```

Use `@/...` for **every** source import — including same-folder siblings — so paths survive component moves and remain grep-able. The only exceptions are asset side-effect imports in `main.tsx` (e.g. `import "./index.css"`).

## Tailwind v4

**Setup**: loaded via `@tailwindcss/vite` in `vite.config.ts`. No `tailwind.config.js` or `postcss.config.js` — this is correct v4 practice; do not add them. The only Tailwind setup is `@import "tailwindcss";` in `frontend/src/index.css`.

**Named utilities work normally.** Named size utilities (`max-w-xl`, `max-w-6xl`, `w-96`, `h-24`, etc.) and numeric spacing (`p-4`, `gap-2`, `w-14`) all resolve correctly in Tailwind 4.3.1.

**Prefer idiomatic utilities over verbose arbitrary values.** Custom `@theme` tokens auto-generate idiomatic Tailwind classes — use these:

```tsx
// ✓ Idiomatic (preferred)
<div className="text-garnet-700 bg-parchment-50 rounded-card shadow-card">

// ✗ Verbose (legacy, avoid for new code)
<div className="text-[var(--color-garnet-700)] bg-[var(--color-parchment-50)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)]">
```

Genuine non-token values still use arbitrary syntax: `text-[11px]`, `max-h-[80vh]`, `max-w-[36rem]`.

**Footgun:** never reintroduce bare `--spacing-{name}` tokens — see the Tailwind non-negotiable in CLAUDE.md.

## Design tokens

Token definitions live in `frontend/src/index.css` (`@theme` block). For a full reference of color families, typography, spacing, radius, and shadow scales, see:

**`.claude/agent-memory/frontend-design-architect/design_system.md`**

Summary of what's available:
- Colors: `--color-parchment-{50..900}`, `--color-garnet-{50..900}`, `--color-arcane-{50..900}`, `--color-gold-{50..900}`, `--color-vitality-{50..900}`
- Fonts: `--font-display` (Source Serif 4, headings), `--font-sans` (Source Sans 3, body/UI)
- Radius: `--radius-card` (0.625rem), `--radius-control` (0.375rem) — just two, used everywhere
- Shadows: `--shadow-card`, `--shadow-raised`

Use idiomatic utility classes — tokens auto-generate them in v4: `text-garnet-700`, `bg-arcane-50`, `rounded-card`, `shadow-raised`. Only fall back to `[var(...)]` syntax for non-token one-off values.

**Text-contrast policy (WCAG AA).** On the `parchment-50` background nothing lighter than `parchment-600` clears 4.5:1, so **readable text uses `parchment-600` or darker** (`-600` secondary, `-700`/`-900` primary). `text-parchment-400`/`-500` are **reserved for WCAG-exempt uses only** — `placeholder:`, `disabled:`, and decorative `aria-hidden` glyphs — never for content text. Don't reintroduce `-400`/`-500` on readable text (see #158/#98). The same 4.5:1 floor applies to **accent text on light surfaces**: `gold` ≥ 800, `arcane` ≥ 700, `garnet` ≥ 600 (bump one step darker on a tinted fill, e.g. `arcane-800` on `bg-arcane-100`) — the mid steps (`gold-700`, `arcane-600`, `garnet-500`) fail as text. Lighter accent steps are for fills/borders/meters, not text (see #187/#207). The mirror rule applies to **light text on an accent fill** — it must also clear 4.5:1, so only the darker accents can carry white: `garnet-600` (≈5.5:1) and `vitality-600` (≈4.9:1) do; `arcane` carries white only from `arcane-700` down (`arcane-600` ≈3.8:1, `arcane-700` ≈5.07:1, hover `arcane-800` ≈6.44:1); and **gold can never carry white** (`gold-800` technically passes at ~6:1 but reads muddy), so filled gold flips to **dark text on a bright fill** — `text-parchment-900` on `bg-gold-400` (hover `bg-gold-500`), ≈10.5/8.5:1 (see #207). Dark mode (#211) will remap these fills and must re-verify both directions. Full rationale in `design_system.md`.

### Design gate

Staying on-system is what keeps the UI from reading as generic. The `verify-frontend` skill runs a **design-review lane** (the `frontend-design-architect` agent — or a `general-purpose` agent briefed with the design docs if that type isn't available — plus the `/ux-review` skill for whole-page changes when it's installed) alongside unit tests and browser verification. It judges changes against this token set and the conventions in this doc — off-token colors/radii/shadows, broken hierarchy, reinvented primitives, and raw skill/ability keys are `blocking` findings that fail the gate; subjective polish is `advisory`. Run `/verify-frontend` before opening a frontend PR (it's also invoked automatically by `/parallel-issues`).

## UI pattern: inline panels vs Modal overlay

**Rule**: `Modal.tsx` (portal + focus trap + Esc + backdrop) is reserved for **read-only review surfaces and confirm dialogs**. Every add/edit surface is an **inline expand-in-place panel within its Card**.

| Modal | Inline panel |
|---|---|
| `ActivityModal` — filterable audit timeline (category + session selects + inventory type chips; optional `entityId` scope) + undo — also serves as inventory history | `AddItemPanel` — add item form |
| `DeleteCharacterModal` — confirm destructive action | `AddSpellPanel` — learn spell form |
| `LevelUpModal` / `ConcentrationSaveModal` — hosted *inside* `HitPointTracker` | `InventoryRow` edit mode |
| | `HitPointTracker` itself — inline Card (damage/heal/rest/death-save controls) |
| | `ExperienceTracker` award/set inputs |
| | `AbilityScoreEditor` method tabs |

When adding a new editing surface: **default to inline**. Reach for `Modal` only if the surface is read-only or a destructive confirmation. If you need an overlay for an editing surface, make the case explicitly.

## Primitive components

These seven live in `src/components/ui/` and are intentionally domain-agnostic — they must not import from `@/features`, `@/api`, or `@/types/character`. They know nothing about D&D.

| Component | Usage |
|---|---|
| `Card` | Base parchment surface for every major section. Props: `title?`, `titleAccessory?`, `className?`, `headingLevel?` (`2`\|`3`, default `3` — set `2` when the card is a top-level page section directly under the page's `h1` so heading order doesn't skip). |
| `Badge` | Soft-background pill. Prop `tone`: `garnet` / `arcane` / `gold` / `vitality` / `neutral`. |
| `MeterBar` | Horizontal resource meter. Always pair with numeric text (e.g. `9/10 HP`) — never rely on color alone. Prop `tone`: `garnet` / `arcane` / `gold`. |
| `Modal` | Overlay primitive. See inline-vs-modal rule above. |
| `Tabs` | Controlled segmented-control tab switcher (WAI-ARIA tablist, arrow-key nav, optional per-tab `badge`). Renders only the switcher; the caller renders the active panel below it. Props: `tabs`, `active`, `onChange`. |
| `OverflowMenu` | Icon-only kebab (`⋮`) menu-button (WAI-ARIA menu-button: `aria-haspopup`, roving tabindex, Arrow/Home/End/Esc nav, click-outside to close, focus returns to trigger). No portal — `relative`-anchored popup. Per-item `danger?` (garnet) / `separatorBefore?` (divider). Props: `items`, `label?` (trigger accessible name, default "More actions"), `className?`. |
| `ErrorBoundary` | Class error boundary wrapping the route tree in `App.tsx`. Catches render-time crashes and shows a parchment "something went wrong" fallback (Reload / Back to characters) instead of a blank page. Optional `fallback?: (error, reset) => ReactNode` for custom recovery UI. |

## API calls — `client.ts` is the only call site

All `fetch` calls go through `frontend/src/api/client.ts`. **Never call `fetch` directly from a component.**

When adding a new backend endpoint:
1. Add the function to `client.ts`
2. Import it in the component

This keeps all URL construction, error handling, and type casting in one place.

Every domain call goes through `apiFetch`, which adds `credentials: "include"`
(so the `cs_session` cookie flows cross-origin in dev: 5173 → 4000) and routes
any **401** to a single registered handler — `setUnauthorizedHandler` — instead
of per-call handling. `AuthProvider` registers that handler to drop auth state to
anonymous (the router then shows login). The auth bootstrap `fetchMe` uses a
plain credentialed `fetch` so its expected 401 ("not signed in") doesn't trip
the global handler. Auth functions: `fetchAuthProviders`, `fetchMe`, `logout`.

## Auth — `features/auth/`

OAuth-only (no passwords). Pieces:
- **`AuthProvider.tsx`** — context (`useAuth`): bootstraps from `fetchMe`
  (`loading → authenticated | anonymous`), exposes `user` + `logout()`, and
  registers the client's unauthorized handler.
- **`AuthGate.tsx`** — renders the app only when authenticated; a loading
  placeholder during the probe; `LoginPage` for anonymous (so a 401 anywhere
  lands on login, never a white screen).
- **`AppHeader.tsx`** — chrome showing the signed-in identity + a Log out button.
- **`pages/LoginPage.tsx`** — buttons are **data-driven** from
  `GET /api/auth/providers` (each a plain anchor to its `startUrl`), so enabling
  a provider server-side needs no frontend change.

`App.tsx` order: `BrowserRouter → ErrorBoundary → ThemeProvider → AuthProvider →
AuthGate → (AppHeader + Routes)` — ErrorBoundary stays outermost over the app
content; ThemeProvider wraps auth so `data-theme` applies app-wide.

## Theme / dark mode — `features/theme/`

Dark mode is a set of `--color-*` overrides under `[data-theme="dark"]` in
`index.css` (the dark palette uses reversed ramps + dark shadows + a
`--color-backdrop` token; #211 — see `design_system.md`; light mode is
unchanged). The preference is persisted at `localStorage["cs:pref:theme"]`,
defaulting to `system`.

- **`hooks/useThemePreference.ts`** — pure persistence + resolution:
  `ThemePreference = light | dark | system`, `loadThemePreference` /
  `saveThemePreference`, `getSystemTheme` (via `matchMedia`), `resolveTheme`, and
  the `useThemePreference` hook (a `useState`-shaped pair).
- **`features/theme/ThemeProvider.tsx`** — context (`useTheme`): exposes
  `{ preference, resolved, setPreference }` and writes the resolved theme onto
  `document.documentElement.dataset.theme`; while on `system` it re-resolves on
  OS `prefers-color-scheme` changes.
- **`index.html`** — a tiny blocking inline script applies `data-theme`
  pre-paint to avoid a flash of the wrong theme (the storage key is duplicated
  there from `useThemePreference.ts`).
- **`AppHeader.tsx`** — a 3-state cycle toggle (light → dark → system) with a
  dynamic `aria-label`.

## Dice engine

`frontend/src/lib/dice.ts` is the **only** place `Math.random` is called for dice. Key exports:

```typescript
rollDie(faces: number): number          // the sole Math.random call
rollSpec(spec: RollSpec): RollResult    // rolls all dice + sums + applies modifier
summarizeRoll(values, spec): RollResult // for when values come from outside (physics roller)
formatRollSpec(spec): string            // "3d6 + 2", "4d6 drop lowest"
```

`RollSpec`: `{ count, faces, modifier?, dropLowest? }`.

**3D rollers** (`features/dice/DiceRoller.tsx` scripted, `features/dice/PhysicsDiceRoller.tsx` physics) both produce a `RollResult` shape via `summarizeRoll` — they're interchangeable via the shared `DiceRollerProps` contract in `features/dice/diceRollerTypes.ts`. Spellcasting currently uses the simple inline `rollSpec`; the 3D rollers are an easy later upgrade.

## Feature-orchestrator split convention

Large interactive sections follow the orchestrator/row pattern:

```
<OrchestratorComponent character={character} onUpdate={setCharacter}>
  // owns state, batches API calls via apply*Transactions, re-renders via onUpdate
  // renders the Card and section header

  <RowComponent op-handlers-as-callbacks />
  // presentational only — no direct API calls, no local async state
  // fires callbacks up to the orchestrator
```

Examples:
- `features/inventory/`: `InventoryList` (orchestrator) / `InventoryRow` / `AddItemPanel`
- `features/spells/`: `SpellsSection` (orchestrator) / `SpellRow` / `AddSpellPanel`

The orchestrator pattern keeps async state and API batching in one place and makes rows easy to unit-test in isolation — pass mock callbacks, assert they fire with the right args. See `testing.md` for component test patterns.
