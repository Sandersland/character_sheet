# 2024 Rules (SRD 5.2) Migration — Execution Plan

> **For agentic workers:** this is the **orchestration plan** for epic #1126 — build order, method, model policy, and concurrency mechanics. It deliberately contains no code-level steps: each issue is the task spec, and the worker that picks an issue up writes its own bite-sized red/green plan at pickup (superpowers:writing-plans → superpowers:subagent-driven-development or the autodev FSM, per lane). Do not build from this document alone; build from your issue + this document's constraints.

**Goal:** Cut the app over from 2014 rules (SRD 5.1) to 2024 rules (SRD 5.2) — epic #1126, sub-issues #1127–#1140 — with no edition toggle and no regression path back to 2014 text.

**Approach:** Land the regression guard first, then run conflict-free lanes concurrently in isolated dockerized worktrees onto a per-wave integration branch. Mechanics issues are red/green TDD against the existing ~30–40 rules-value test files (rewrite assertions to SRD 5.2 first, then make them pass). Content sweeps run as autodev batches once their mechanics substrate has landed.

**Tech:** existing stack (Prisma 7 / Express / React); `/worktree` skill for isolation; `/parallel-issues` + autodev for delegation; Opus workers for implementation.

## Global constraints

- **Edition:** SRD 5.2 is canonical; 2024 PHB fills non-SRD content. Never settle a rules question from the 2014 books (#1140). Transcribe rule values during the RED step — research, don't guess; surface residual ambiguity instead of papering over it.
- **CLAUDE.md non-negotiables apply to every lane:** rules data only in backend `lib/` + seed catalogs; derive-don't-persist; one shared rule function per rule (reconciler + clamp-on-read never fork); transaction endpoints; `npm run typecheck` before "done".
- **Decisions already settled** (recorded in the issue bodies — do not reopen): hard cutover; prepared-cap enforced but swap-timing not policed; pre-level-3 subclasses kept dormant; no retroactive background ASIs; fighting styles migrate to feats stat-identically.

---

## 1. Build order

Lanes within a wave run **concurrently in separate worktrees**; lanes are ordered so no two concurrent lanes share hot files. Waves are sequenced by dependency, not calendar — start a wave-2 lane the moment its dependency merges.

### Wave 0 — regression guard + playtest fixes (small, land first)

| Lane | Issue | Why this position |
|---|---|---|
| serial, inline | #1140 edition baseline in CLAUDE.md/docs | Minutes of work; every later lane inherits its rule. |
| W0-a | #1139 Pact Magic labeling, learn-vs-swap copy, grants in Review | **Must land before #1127 starts** — it touches `spellList.ts`, `level-up-plan.ts`, `NewSpellsStep.tsx`, all of which #1127 rewrites. Landing the small PR first avoids rebasing the big one. |

### Wave 1 — mechanics core (4 concurrent lanes)

| Lane | Issue(s) | Hot files (why lanes don't collide) |
|---|---|---|
| W1-a | #1127 prepared-caster unification | `spellcasting-tables.ts`, `level-up-plan/submission`, `spellcasting.ts`, `spellList.ts`/`newSpells.ts`. Biggest lane — start it first, staff it best. |
| W1-b | #1128 subclass at level 3 | class files ×5, `catalog-data.ts`, `subclass-granted-spells.ts` |
| W1-c | #1129 feat categories + reseed | `schema.prisma`, `seed/feats.ts`, `srd/feats.ts`, `advancement.ts`. **Only schema-touching lane in this wave** (see §4, migrations). |
| W1-d | #1135 conditions text **then** #1136 exhaustion, chained in one worktree | Both edit `condition-data.ts` + `ConditionsSheetBody.tsx` — never concurrent with each other, freely concurrent with a/b/c. |

Merge into the integration branch as each lane finishes (no barrier); expect only test-file and doc-file conflicts. **Promote to main once wave 1 is green and verified.**

### Wave 2 — schema + creation + first content (start each lane when its dep merges)

| Lane | Issue | Depends on | Conflict note |
|---|---|---|---|
| W2-a | #1131 creation spell/cantrip step | #1127 | Touches `level-up-plan.ts` — land **before** W2-d or accept a small conflict resolve there. |
| W2-b | #1132 spell catalog resweep (92 spells) | #1127 (soft) | Seed-only; autodev-batch candidate (split by spell level if batched). |
| W2-c | #1130 backgrounds: ability scores + Origin feat | #1129 | Only schema-touching lane in this wave. |
| W2-d | #1137 fighting styles → feats | #1129 | Touches `level-up-plan.ts` + `level-reconciliation.ts`; merge after W2-a. Run `/fallow` after the step retirement. |

### Wave 3 — audits, then batch fan-out

1. **#1134 class-retabulation audit** (spike, needs #1127): produces ~12 per-class `ready` issues. Build them as an **autodev batch** with a DAG that serializes any two issues sharing a mechanic module (`ki-cast.ts`, `resources.ts`).
2. **#1133 subclass content audit** (spike, needs #1128 + the relevant per-class issue from #1134): produces content batch issues. DAG-serialize everything touching `subclass-granted-spells.ts` / `subclasses.ts` — shared seed files are the known conflict trap in parallel waves.
3. **#1138 Weapon Mastery spike** (needs #1134): design doc + mockup first (claude-design, per the attack-sheet precedent). **Deferrable — this is the scope valve.** If the migration drags, ship the cutover without it and fast-follow.

**Promote cadence:** `/promote` staging → main after each wave stabilizes; recreate the integration branch from staging after every promote (never reuse a pre-promote integration branch).

## 2. Method — red/green TDD, per issue

The ~30–40 test files that hardcode 2014 values (`lib/srd/__tests__`, `lib/classes/__tests__`, `lib/leveling/__tests__`, seed invariants incl. `catalog-data.test.ts`, and the frontend `levelUpSteps`/`preparedSpells`/`conditions` suites) are the migration harness, not an obstacle. Every mechanics issue runs this cycle:

1. **RED** — rewrite the existing 2014 assertions to the SRD 5.2 values *first*, citing the 5.2 table/page in the test where the old test cited PHB'14. Add new failing tests for mechanics that have no 2014 counterpart (e.g. flat exhaustion penalty). Run; confirm the failures are exactly the expected ones.
2. **GREEN** — make the minimal table/logic change in the one shared rule function. No opportunistic refactors in this step.
3. **REFACTOR** — collapse the dead 2014 seams the change strands (`isKnownCaster` branches, the bespoke `fightingStyle` step, tiered exhaustion plumbing). Run `/fallow` after any removal/extraction refactor; fix or explicitly suppress with reasons.
4. Frequent commits: one per red/green cycle, not one per issue.

**Verification gates per lane:** backend tests need the lane's own Postgres up, and worktree stacks run `--fileParallelism=false` (parallel file runs flake with cross-domain 500s). Seed the disposable DB (`prisma db seed`) before route/cast suites — migrate-only DBs mask real 500s. `npm run typecheck` always. UI-touching issues additionally run the `/verify-frontend` gate and screenshot the result before claiming done.

## 3. Model & delegation policy

- **Implementation is delegated to Opus workers.** Interactive waves (0–2) run through `/parallel-issues`, which builds each issue in its worktree with an Opus build agent; wave-3 batches run through autodev (Opus, sonnet fallback per the FSM's budget rules). Precedent: bulk builds delegated to opus[1m] on the backend tech-debt epic.
- **The interactive session (Fable) does not write the bulk implementation.** It owns: issue refinement, per-wave plan approval, DAG construction for batches, merge/conflict resolution on the integration branch, review of worker output, promote decisions, and any rules-ambiguity calls the workers surface.
- **Spikes (#1133, #1134, #1138) are research, not builds:** run them in the interactive session with Explore agents against SRD 5.2; their deliverable is `ready` issues (and for #1138 a design mockup), which then feed the delegation machinery above.
- **Push protocol (every push, every lane, no exceptions):** after pushing, **watch CI to completion** — don't fire-and-forget — and then run **`/pr-response` regardless of whether the PR was deemed mergeable**. A green mergeable state is not a substitute for working the review: reviewer findings arrive independently of CI, and the known races (auto-merge firing before e2e reports; auto-merge armed before `/pr-response` finishes) both start with an unwatched push. No auto-merge is armed until CI has completed *and* `/pr-response` has been worked; UI-layout changes additionally run docker e2e before arming.

## 4. Concurrency mechanics — worktrees in isolation

- **One worktree per lane** via the `/worktree` skill: each gets its own Compose project (isolated Postgres volume + migrations) and port block, so four lanes run four full stacks without collisions.
- **Integration branch per wave**, forked from `staging` (the branch holding the deps — verify prerequisites exist on it before spinning up worktrees). Feature → integration merges are squash; staging → main promotes are merge commits.
- **Schema discipline:** at most one Prisma-migration lane per wave (#1129 in wave 1, #1130 in wave 2) so migration folders stay linearly ordered and worktree DBs never diverge on schema.
- **Known frictions, planned for rather than discovered:**
  - Shared docs (`frontend.md`, `architecture.md`, CLAUDE.md after #1140) conflict on all-but-first merge even when code is disjoint — budget a one-file doc resolve per merge.
  - Replicate the fallow health + audit gates before pushing from a dockerized worktree; `--no-verify` only for sanctioned cases with a recorded reason.
  - e2e wipes dev-user characters — re-seed personas via the e2e suite after runs; wave-1/2 lanes that change creation or subclass timing must also update the persona seeds (#1128, #1131 call this out).
  - If an autodev batch is launched mid-wave, it can flip the main checkout's branch — interactive work stays in worktrees while batches run.

## 5. Risks & watch items

- **In-flight 2014 issues #1120–#1124** (Champion, Draconic Sorcery, Berserker effects): re-verify their specs against the 2024 features before building; they were written pre-decision.
- **Renamed spells on existing characters** (#1132): verify one rename end-to-end against a character that knows the spell before merging the batch.
- **Audit-before-batch is a hard gate:** no wave-3 batch launches until its spike's issues are labeled `ready` — batches built from unrefined content issues are how post-open triage debt happens.
- **Scope valve:** #1138 (Weapon Mastery) is the only genuinely new subsystem and nothing depends on it; defer it rather than letting it delay the cutover promote.
