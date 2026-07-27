# CLAUDE.md

D&D 5e character sheet app — **Phase 4: live play & automation**. Postgres + Prisma 7 + Express (backend) and Vite + React + TypeScript + Tailwind v4 (frontend), in an npm workspaces monorepo (`packages/*`, `backend/`, `frontend/`). The sheet is fully interactive (HP, XP, inventory, spellcasting, conditions, feats/ASIs, class resources), plus live-play sessions with combat/turn tracking, per-character journals, campaigns with a DM side, and a unified audit log with LIFO undo.

## What the app is for

Players build character sheets and optionally run campaigns. The product goal is to **automate the bookkeeping a paper sheet makes you do by hand**, so a session is spent playing rather than tracking. Concretely, the app exists to answer four questions:

- *What can I do on my turn?* — actions/bonus actions/reactions available **right now**, with costs, dice, and DCs already computed.
- *When do I level, and what do I choose?* — a level-up ceremony that surfaces the real choices at that level.
- *What happened last session?* — campaign history, journals, and an audit log with LIFO undo.
- *When are we playing next?* — DM scheduling of a campaign's sittings (epic #951).

Three commitments follow from that goal and decide most arguments below:

- **Editions are content, not a fork.** A group runs 2014 *or* 2024 rules; both are supported per campaign (epic #1281).
- **Content is data.** New rules content should be seed/catalog rows resolved at read time, not new TS modules — that is also the path to homebrew (#416, #1277).
- **Effects are self-or-announce.** The engine mutates only the character's *own* state; anything targeting another creature is reminder text plus a computed DC, recorded in history. **There is no enemy/target model and modelling one is an explicit non-goal** — this is what keeps "support every class and subclass" reachable instead of a combat simulator.

## Quickstart

```bash
docker compose up --build   # db (5432) + backend (4000) + frontend (5173)
npm run dev | lint | test | typecheck | build   # root scripts fan out to both workspaces
```

See `docs/development.md` for per-workspace commands, running outside Docker, and the Prisma workflow.

## Non-negotiables (always apply)

**Derive, don't persist.** `level`/`proficiencyBonus` are computed from `experiencePoints`; spell slot totals/save DC/attack bonus, `armorClass`, `speed` bonuses, and `attacksPerAction` are all derived at read time in `serializeCharacter` via the `lib/srd/` rule functions. `race`/`class`/`background` are read from the selection relations. None of these are columns; don't add them back. (Exempt: `Character.ownerId` and `Character.rulesEdition` — ownership and edition are identity state, not a function of any other column.)

**Level-gated state reconciles through one registry.** Any persisted state whose legal maximum depends on character level must add a reconciler to `LEVEL_GATED_RECONCILERS` in `backend/src/lib/leveling/level-reconciliation.ts` **and** a matching clamp-on-read in `serializeCharacter`, both computing the legal limit via one shared rule function (`lib/srd/` / `lib/leveling/` / `lib/classes/class-features.ts`) — never two inline copies of the rule. "One shared function" is scoped **per edition**: two editions may resolve to different functions, but a reconciler and its clamp-on-read must always resolve to the *same* one — see `subclassGateLevel`. Never hand-roll level-down logic at a new call site. See `docs/leveling.md`.

**Rules edition is data, not a global.** A group runs 2014 (SRD 5.1) or 2024 (SRD 5.2); both are supported per campaign (epic #1281, foundation #1285). Settle every rules question against **the edition of the character in front of you**, from that edition's actual text — research it, don't guess, and never assume one edition's answer holds for the other. Where the editions genuinely agree there is one rule and no fork: XP/proficiency tables, every spell-slot table (full/half/multiclass/Pact Magic/Mystic Arcanum), death saves, ASI levels, multiclass prerequisites, Unarmored Defense. The authority is **`Character.rulesEdition`**, read through `editionOf` — never a global, and never `Campaign.rulesEdition`, which is only the default a new character is created with. It is **write-once**: set by the create transaction, absent from `PATCH /api/characters/:id` and from every transaction op, which is what lets a reconciler treat edition as a constant. A rule that differs takes `edition` as its last parameter and stays **one** function per rule (`subclassGateLevel` is the pattern-setter); an edition-invariant rule — the majority — takes no `edition` and changes nothing. Code encoding 2014 rules is a supported edition's implementation, *not* legacy to delete. Rules citations name their edition (`SRD 5.2` / `PHB'24 p. NN` / `PHB'14 p. NN`); an unattributed citation is a bug.

**Rules logic is backend-owned; the frontend never originates a rule.** 5e rules live in backend `lib/` (`lib/srd/`, `lib/leveling/`, `lib/classes/`, `lib/inventory/starting-equipment.ts`), with **no exception**: the client receives resolved values on the wire, never the arithmetic. A shared workspace package may carry wire types and route schemas — never a rule the frontend executes (epic #1369: `@character-sheet/shared-types` for pure types, `@character-sheet/contracts` for the route zod schemas themselves, #1370; `.fallowrc.jsonc`'s `boundaries` block is the machine check, and it can only see imports, so the file-contents half is on you). Never re-derive a rule inside a component or a route, and never let a client-computed value be trusted by a transaction endpoint. Catalog *content* (items, spells, packs, feats, subclasses) lives in DB seed tables, not TS modules. Surviving `frontend/src/lib/` mirrors are debt worked down per module (#1383) — never precedent for new code.

**State changes go through intent-bearing transaction endpoints.** `PATCH /api/characters/:id` is a thin field-patch for cosmetic fields only. Every meaningful mutable domain is mutated only through a `POST …/transactions` endpoint that **validates its ops, applies them atomically, writes audit events, and returns the updated character**. Those four properties are the invariant — *not* one URL per domain: a shared endpoint dispatching to registered per-ability handlers satisfies it equally (see #1275), and is the preferred shape as feature count grows. `lib/inventory/inventory.ts` is the reference implementation; do not add new mutable domains to PATCH. From the campaign side, a player's sheet is mutated only through DM award/revoke (`lib/campaign/campaign-item-award.ts`), never by writing `InventoryItem` rows directly.

**Never call `fetch` from a component.** Every backend call goes through the API layer in `frontend/src/api/` — components import only the `client.ts` barrel; `fetch` itself is called from `http.ts` alone, underneath the per-domain modules (`characters.ts`, `campaign.ts`, `session.ts`, …).

**Frontend code is organized by domain.** Primitives in `components/ui/`, domain components in `features/<domain>/`, shared hooks in `hooks/`, pure logic (no JSX) in `lib/`. Use the `@/` alias for all cross-file imports — never `../`. See `docs/frontend.md` for the decision rule.

**Backend `@/` alias:** `@/*` → `backend/src/*` for **cross-directory** imports; same-directory siblings stay relative `./x.js`; always write the ESM `.js` extension (NodeNext).

**Tailwind v4:** named utilities and `@theme`-token utilities work normally — prefer `text-garnet-700` over `text-[var(--color-garnet-700)]`. Never reintroduce bare `--spacing-{name}` tokens (they break `max-w-sm/md/lg/xl`); use a `--space-*` prefix instead.

**Never render a skill/ability/save key directly in the UI.** Resolve display text through `skillLabel`/`abilityLabel`/`abilityAbbr` or the `SKILL_OPTIONS`/`ABILITY_OPTIONS` lists (`frontend/src/lib/abilities.ts`). Ad-hoc capitalization silently breaks camelCase skill keys (has shipped twice).

**Backend tests need Postgres.** `docker compose up db -d` first; `backend/.env` supplies `DATABASE_URL`. See `docs/testing.md`.

**Read a file in-session before you Edit it.** `Edit`/`Write` on a file with no read record this session is rejected. Riskiest cases: files "known" from grep or a subagent's report, worktree copies after reading the main-tree twin, and the first edit after a compaction handoff — `Read` the exact path first.

**Type-check before calling work "done".** `npm run typecheck` (root or `-w <workspace>`) catches the schema/shape-drift class that vitest/eslint miss (vitest transpiles without type-checking).

**Decompose large features before building.** Anything bigger than ~one screen or one endpoint gets sliced into GitHub issues first (`/issues` skill), then built one-PR-per-issue — in parallel via `/parallel-issues` + worktrees when independent. Monolithic sessions blow through context; decomposed ones ship clean PRs.

**Keep build artifacts out of the repo.** Screenshots and generated images go to `/tmp` or the session scratchpad — a `PreToolUse` hook (`.claude/hooks/block-project-artifacts.mjs`) enforces this. Fix the destination path; don't work around it.

**Comments state what the code can't.** Write comments only for the *why*: invariants, 5e-rule decisions, gotchas, and deliberate-coupling latches ("if you change this, also update X") — never to restate the code or label sections (a file that needs section banners needs splitting; endpoint contracts go in JSDoc on the handler). Refer to other code by exported **symbol name, never file path** (paths rot on reorg; symbols are greppable). Issue refs (`#NN`) for provenance are encouraged. Every suppression (`fallow-ignore-next-line`, `eslint-disable-next-line`) must be rule-specific and end with `-- <reason>`. When you edit code, update or delete its comment in the same edit — and never drop an existing why-comment in a refactor.

**Docs are pointers, not mirrors.** The code is the source of truth; docs exist only for what can't be derived from it (invariants, footguns, procedures). If a change makes a doc statement false, fix or delete that statement — never append descriptions of new code to a doc, and never add per-component/per-function inventories.

## Doc map

Read on demand — not auto-loaded:

| Doc | Read this when… |
|---|---|
| `docs/architecture.md` | You need the data patterns (catalog+snapshot, JSON columns, audit log, transaction pattern) or the auth/ownership model |
| `docs/development.md` | You need commands, the Prisma workflow, worktree stacks, or the add-a-domain recipe |
| `docs/testing.md` | You're running or writing tests (fixture isolation, e2e, visual regression) |
| `docs/leveling.md` | You're touching XP/level-up/level-down or any level-gated feature |
| `docs/frontend.md` | You're writing frontend code (conventions, Tailwind/contrast rules, dice engine, bundle splitting) |
| `docs/deployment.md` | You're packaging/hosting the app, or need the backup/restore runbook |
| `.claude/agent-memory/frontend-design-architect/design_system.md` | You need exact design token names and the design rationale |
