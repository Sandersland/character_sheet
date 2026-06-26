# Frontend guidelines

## Directory structure — where things belong

```
frontend/src/
├── components/
│   └── ui/              # domain-agnostic primitives (Card, Badge, MeterBar, Modal, Tabs, ErrorBoundary)
├── features/
│   ├── abilities/       # AbilityScoreBox, AbilityScoreEditor, SkillsTable
│   ├── character-meta/  # CharacterCard, VitalsStrip, JournalSection, ActivityModal,
│   │                    #   DeleteCharacterModal, BackendStatus
│   ├── dice/            # DiceRoller, PhysicsDiceRoller, DiceScene, DieMesh,
│   │                    #   diceRollerTypes.ts, useDieFaceData.ts
│   ├── experience/      # ExperienceTracker
│   ├── hitpoints/       # HitPointTracker
│   ├── inventory/       # InventoryList, InventoryRow, AddItemPanel, LedgerModal,
│   │                    #   StartingEquipmentEditor
│   └── spells/          # SpellsSection, SpellRow, AddSpellPanel
├── hooks/               # reusable React hooks used by pages or multiple clusters
│   │                    #   (useCharacter, useCharacterList, useCharacterDraft, useReferenceData)
├── lib/                 # pure TS logic — NO React/JSX (dice, abilities, timeline, startingEquipment)
├── pages/               # route-level views (CharacterListPage, CharacterSheetPage, CharacterCreatePage)
├── api/
│   └── client.ts        # the only fetch() call site
├── types/
│   └── character.ts     # shared domain types
└── test/
    └── setup.ts         # vitest/jsdom setup (jest-dom + RTL cleanup)
```

### Decision rule — "where does X go?"

Work through this checklist in order; stop at the first match:

1. **Pure logic, no JSX/React** → `lib/` (e.g. `lib/dice.ts`, `lib/abilities.ts`).
2. **A React hook** — used by multiple clusters or by a page → `hooks/`; used only within one feature cluster → co-locate it in that cluster (e.g. `features/dice/useDieFaceData.ts`).
3. **A component with no D&D knowledge** — no imports from `@/types/character`, no `@/api` calls, no game-rule logic, could ship in a different app unchanged → `components/ui/`.
4. **Any other component** → `features/<domain>/` (the cluster that owns it; create a new folder if none fits).
5. **Types** — used app-wide → `types/character.ts`; used by one cluster only → that cluster's folder.

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

**One footgun to never reintroduce:** bare `--spacing-{name}` custom tokens (e.g. `--spacing-sm`) collide with Tailwind's `--container-*` scale and silently break `max-w-sm/md/lg/xl/2xl`. Use a `--space-*` prefix if a named spacing rhythm is ever wanted.

## Design tokens

Token definitions live in `frontend/src/index.css` (`@theme` block). For a full reference of color families, typography, spacing, radius, and shadow scales, see:

**`.claude/agent-memory/frontend-design-architect/design_system.md`**

Summary of what's available:
- Colors: `--color-parchment-{50..900}`, `--color-garnet-{50..900}`, `--color-arcane-{50..900}`, `--color-gold-{50..900}`, `--color-vitality-{50..900}`
- Fonts: `--font-display` (Source Serif 4, headings), `--font-sans` (Source Sans 3, body/UI)
- Radius: `--radius-card` (0.625rem), `--radius-control` (0.375rem) — just two, used everywhere
- Shadows: `--shadow-card`, `--shadow-raised`

Use idiomatic utility classes — tokens auto-generate them in v4: `text-garnet-700`, `bg-arcane-50`, `rounded-card`, `shadow-raised`. Only fall back to `[var(...)]` syntax for non-token one-off values.

## UI pattern: inline panels vs Modal overlay

**Rule**: `Modal.tsx` (portal + focus trap + Esc + backdrop) is reserved for **read-only review surfaces and confirm dialogs**. Every add/edit surface is an **inline expand-in-place panel within its Card**.

| Modal | Inline panel |
|---|---|
| `LedgerModal` — read-only inventory ledger | `AddItemPanel` — add item form |
| `ActivityModal` — read-only audit timeline + undo | `AddSpellPanel` — learn spell form |
| `DeleteCharacterModal` — confirm destructive action | `InventoryRow` edit/sell mode |
| `HitPointTracker` rest/level-up flows | `ExperienceTracker` award/set inputs |
| | `AbilityScoreEditor` method tabs |

When adding a new editing surface: **default to inline**. Reach for `Modal` only if the surface is read-only or a destructive confirmation. If you need an overlay for an editing surface, make the case explicitly.

## Primitive components

These live in `src/components/ui/` and are intentionally domain-agnostic — they must not import from `@/features`, `@/api`, or `@/types/character`. They know nothing about D&D.

| Component | Usage |
|---|---|
| `Card` | Base parchment surface for every major section. Props: `title?`, `titleAccessory?`, `className?`. |
| `Badge` | Soft-background pill. Prop `tone`: `garnet` / `arcane` / `gold` / `vitality` / `neutral`. |
| `MeterBar` | Horizontal resource meter. Always pair with numeric text (e.g. `9/10 HP`) — never rely on color alone. Prop `tone`: `garnet` / `arcane` / `gold`. |
| `Modal` | Overlay primitive. See inline-vs-modal rule above. |
| `ErrorBoundary` | Class error boundary wrapping the route tree in `App.tsx`. Catches render-time crashes and shows a parchment "something went wrong" fallback (Reload / Back to characters) instead of a blank page. Optional `fallback?: (error, reset) => ReactNode` for custom recovery UI. |

## API calls — `client.ts` is the only call site

All `fetch` calls go through `frontend/src/api/client.ts`. **Never call `fetch` directly from a component.**

When adding a new backend endpoint:
1. Add the function to `client.ts`
2. Import it in the component

This keeps all URL construction, error handling, and type casting in one place.

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
- `features/inventory/`: `InventoryList` (orchestrator) / `InventoryRow` / `AddItemPanel` / `LedgerModal`
- `features/spells/`: `SpellsSection` (orchestrator) / `SpellRow` / `AddSpellPanel`

The orchestrator pattern keeps async state and API batching in one place and makes rows easy to unit-test in isolation — pass mock callbacks, assert they fire with the right args. See `testing.md` for component test patterns.
