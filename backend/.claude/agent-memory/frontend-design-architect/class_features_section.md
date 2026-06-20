---
name: class-features-section
description: ClassFeaturesSection orchestrator + sub-components shipped in features/class/ (subclasses branch, 2026-06-20)
metadata:
  type: project
---

Four files created at `frontend/src/features/class/`:

- `ResourcePoolRow.tsx` — single pool row: MeterBar (tone "gold"), Spend/Restore buttons, inline roll result banner. Die roll via `rollSpec({ count: 1, faces: N })` from dice.ts; result shown as gold-tinted banner matching SpellsSection cast result pattern.
- `ManeuverRow.tsx` — single maneuver row: click-to-expand description, garnet "Forget" button with confirm dialog.
- `AddManeuverPanel.tsx` — inline collapsible picker; catalog fetched on first open (lazy via `hasFetched` ref), search-filtered, "X of N known" counter, gold color family to match resource pools.
- `ClassFeaturesSection.tsx` — orchestrator owning busy/error state; handles subclass select (calls `applyClassTransactions`), pool spend/restore + maneuver learn/forget (calls `applyResourceTransactions`), static features list.

**Why:** Pre-existing `ActivityModal.tsx` had a TS error (missing `class` and `resources` from `CharacterEventCategory` tone map) that is unrelated to these files — confirmed our files are error-free via `tsc --noEmit`.

**How to apply:** When extending class features, follow the `ResourcePoolRow`/`ManeuverRow` presentational + `ClassFeaturesSection` orchestrator split. Color family for class resources is `gold`; `arcane` is reserved for spellcasting; `garnet` for destructive actions.
