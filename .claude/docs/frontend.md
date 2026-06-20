# Frontend guidelines

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

| Component | Usage |
|---|---|
| `Card` | Base parchment surface for every major section. Props: `title?`, `titleAccessory?`, `className?`. |
| `Badge` | Soft-background pill. Prop `tone`: `garnet` / `arcane` / `gold` / `vitality` / `neutral`. |
| `MeterBar` | Horizontal resource meter. Always pair with numeric text (e.g. `9/10 HP`) — never rely on color alone. Prop `tone`: `garnet` / `arcane` / `gold`. |
| `Modal` | Overlay primitive. See rule above. |

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

**3D rollers** (`DiceRoller.tsx` scripted, `PhysicsDiceRoller.tsx` physics) both produce a `RollResult` shape via `summarizeRoll` — they're interchangeable via the shared `DiceRollerProps` contract in `diceRollerTypes.ts`. Spellcasting currently uses the simple inline `rollSpec`; the 3D rollers are an easy later upgrade.

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

Examples: `InventoryList` / `InventoryRow` / `AddItemPanel` / `LedgerModal`; `SpellsSection` / `SpellRow` / `AddSpellPanel`.

The orchestrator pattern keeps async state and API batching in one place and makes rows easy to test in isolation.
