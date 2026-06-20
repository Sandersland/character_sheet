# Frontend guidelines

## Tailwind v4

**Setup**: loaded via `@tailwindcss/vite` in `vite.config.ts`. No `tailwind.config.js` or `postcss.config.js`. The only Tailwind setup is `@import "tailwindcss";` in `frontend/src/index.css`.

**Critical footgun — named size utilities don't work here**: This project's `index.css` defines custom color/radius/shadow/font tokens in an `@theme` block, but does *not* include Tailwind's default spacing scale. Named utilities like `max-w-xl`, `max-w-lg`, `w-96`, `h-24` silently resolve to `var(--spacing-xl)` etc., which are undefined → effectively `0`. Use **explicit arbitrary values** instead:

```tsx
// ✗ Broken — resolves to ~0
<div className="max-w-xl">

// ✓ Correct
<div className="max-w-[36rem]">
```

Always verify the rendered size in the browser; don't trust named classes.

## Design tokens

Token definitions live in `frontend/src/index.css` (`@theme` block). For a full reference of color families, typography, spacing, radius, and shadow scales, see:

**`.claude/agent-memory/frontend-design-architect/design_system.md`**

Summary of what's available:
- Colors: `--color-parchment-{50..900}`, `--color-garnet-{50..900}`, `--color-arcane-{50..900}`, `--color-gold-{50..900}`, `--color-vitality-{50..900}`
- Fonts: `--font-display` (Source Serif 4, headings), `--font-sans` (Source Sans 3, body/UI)
- Radius: `--radius-card` (0.625rem), `--radius-control` (0.375rem) — just two, used everywhere
- Shadows: `--shadow-card`, `--shadow-raised`

Use CSS variable references in className strings: `text-[var(--color-garnet-700)]`, `bg-[var(--color-arcane-50)]`.

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
