# CLAUDE.md

D&D 5e character sheet app — **Phase 4: live play & automation**. The stack is Postgres + Prisma 7 + Express (backend) and Vite + React + TypeScript + Tailwind v4 (frontend), in an npm workspaces monorepo (`backend/`, `frontend/`). The sheet is fully interactive: HP management (damage, healing, rests, death saves, level-up), XP tracking (auto-derives level + proficiency bonus), full inventory CRUD (catalog + custom items, currency), spellcasting (slot management, casting rolls dice, learns/prepares/forgets spells), conditions (status effects + exhaustion), feats & Ability Score Improvements, maneuvers & fighting styles, and class resource pools. Beyond the printed sheet there's a live-play mode: sessions with combat/turn tracking and dice rolls, plus per-character journal entries. Every meaningful mutation is recorded in a unified audit log with LIFO undo. A guided character-creation flow (`/characters/new`) is also shipped.

## Quickstart

```bash
docker compose up --build   # db (5432) + pgAdmin (5050) + backend (4000) + frontend (5173)
```

Root scripts fan out to both workspaces:

```bash
npm run dev | lint | test | build
```

See `docs/development.md` for per-workspace commands, running outside Docker, and the Prisma workflow.

## Non-negotiables (always apply)

**Derive, don't persist.** `level` and `proficiencyBonus` are computed from `experiencePoints` in `serializeCharacter`; spellcasting slot totals/save DC/attack bonus are computed from class+level+ability scores via `deriveSpellcasting()` in `srd.ts`; `armorClass` is computed from the equipped body-armor snapshot + effective Dex + shield + Unarmored Defense by class via `deriveArmorClass()` in `srd.ts`; `speed` is the persisted racial base plus additive terms (feat speed bonuses + Monk Unarmored Movement via `deriveUnarmoredMovement()` + Barbarian Fast Movement via `deriveFastMovement()`). `race`/`class`/`background` are read from the selection relations. None of these are columns; don't add them back. (Exempt: `Character.ownerId` is legitimately persisted — ownership is identity state, not a function of any other column. See the User/AuthAccount/AuthSession identity model in `docs/architecture.md`.)

**Level-gated state reconciles through one registry.** Any persisted state whose legal maximum depends on character level (subclass choice, maneuvers known, future feats, Ability Score Improvements) must add a reconciler to `LEVEL_GATED_RECONCILERS` in `backend/src/lib/level-reconciliation.ts` **and** a matching clamp-on-read in `serializeCharacter`. Never hand-roll level-down logic at a new call site. See `docs/leveling.md` for the full pattern and checklist.

**5e rules data lives only in `lib/`.** `backend/src/lib/experience.ts` (XP curve), `backend/src/lib/srd.ts` (alignments, skills, ability math, spellcasting ability, slot tables, `deriveCreatedCharacter`), and `backend/src/lib/starting-equipment.ts` (class equipment packages). Never duplicate rules on the frontend or inline them in a route. (Catalog data — items, spells, packs — lives in DB tables, not here.)

**State changes go through intent-bearing transaction endpoints.** `PATCH /api/characters/:id` is a thin field-patch for cosmetic/DM-assigned fields (`name`, `armorClass`, `currency`, etc.). Every meaningful mutable domain (inventory, HP, XP, spellcasting, conditions, class choices, resources, advancement, …) is mutated only through its dedicated `POST …/transactions` endpoint, which validates ops, applies them atomically, writes audit events, and returns the updated character. `lib/inventory.ts` is the reference implementation. Do not add new mutable domains to PATCH. (Full router list: `docs/architecture.md`.)

**All backend calls go through `frontend/src/api/client.ts`.** Never call `fetch` directly from a component.

**Frontend code is organized by domain.** Reusable, domain-agnostic primitives live in `frontend/src/components/ui/`; domain components in `frontend/src/features/<domain>/`; reusable React hooks in `frontend/src/hooks/`; pure logic (no JSX) in `lib/`. Use the `@/` alias (maps to `src/`) for all cross-file imports — never `../` relative paths. See `docs/frontend.md` for the full decision rule.

**Tailwind v4 utilities work normally here.** Named size utilities (`max-w-xl`, `w-96`, etc.) and numeric spacing (`p-4`, `gap-2`) all resolve correctly. Custom `@theme` tokens also auto-generate idiomatic utilities — prefer `text-garnet-700` over `text-[var(--color-garnet-700)]`, `rounded-card` over `rounded-[var(--radius-card)]`, etc. One historical footgun to never reintroduce: bare `--spacing-{name}` custom tokens (e.g. `--spacing-sm`) collide with Tailwind's `--container-*` scale and break `max-w-sm/md/lg/xl/2xl`. If a named spacing rhythm is ever wanted, use a `--space-*` prefix instead.

**Never render a skill/ability/save key directly in the UI.** Skills are stored as camelCase keys (`animalHandling`, `sleightOfHand`); abilities and saving throws as lowercase words (`strength`). Resolve all display text through `skillLabel` / `abilityLabel` / `abilityAbbr`, or iterate the ready-made `SKILL_OPTIONS` / `ABILITY_OPTIONS` lists — all from `frontend/src/lib/abilities.ts`. Never hand-roll a `{ key, label }` array or capitalize keys ad-hoc (`key.charAt(0).toUpperCase() + …`); that hack only "works" for single-word abilities and silently breaks camelCase skill keys (this footgun has shipped twice). `SKILL_LABELS`/`ABILITY_LABELS` are typed `Record<SkillName/AbilityName, string>`, so a missing or renamed key is a compile error.

**Backend tests need Postgres.** Run `docker compose up db -d` first and export `DATABASE_URL` in the same shell command as `vitest` (not a prior `export`). See `docs/testing.md`.

**Read a file in-session before you Edit it.** `Edit`/`Write` on an existing file the harness has no read record for is rejected — costing a wasted retry. This bit 16 of the last 50 sessions (34 retries), overwhelmingly on files "known" from grep, a subagent's report, or pre-compaction context but never actually `Read` this session. Highest-risk triggers: docs/config you assume you remember (`docs/*`, `.env.example`, `lefthook.yml`, `package.json`), files handed back by a subagent, editing a **worktree** copy after reading only the main-tree twin (different path = not read), and the first edit after a compaction handoff. In all of these, `Read` the exact path first — the read is correctness (you're not editing a stale mental copy), not overhead.

**Type-check before you call frontend/backend work "done".** Run `npm run typecheck` (root, or `-w frontend` / `-w backend` for one workspace) — a fast `tsc --noEmit` that catches the schema/shape-drift class `vitest`/`eslint` miss: referencing a field that a snapshot type no longer has (e.g. `JournalEntry.title` after title was dropped), or a transaction handler whose `Promise<void>` vs `Promise<boolean>` signature drifted. `pre-push` runs this too, but running it mid-change closes the loop in seconds instead of surfacing errors at push/CI. See `docs/development.md`.

**Decompose large features before building, not after.** Anything bigger than ~one screen or one endpoint gets sliced into GitHub issues up front (use the `/issues` skill), then built one-PR-per-issue — in parallel via `/parallel-issues` + worktrees when the slices are independent. This is a hard-won lesson: the features tackled as a single monolithic session (spellcasting, turn-tracking, subclasses) each blew through context and needed 3–4 compaction handoffs, while the same-sized work decomposed into issues first shipped cleanly as reviewable PRs. When a request is large, the first move is a plan that names the PR/issue boundaries — not code. See `.claude/skills/issues` and `.claude/skills/parallel-issues`.

**Keep build artifacts out of the repo.** Screenshots, Playwright captures, and any generated images go to `/tmp` or the session scratchpad — never the project tree. A `PreToolUse` hook (`.claude/hooks/block-project-artifacts.mjs`, wired in `.claude/settings.json`) enforces this for `Write`/`Edit` of image files, for Playwright screenshots, and for `Bash` commands that redirect/copy an image into the tree (`> shot.png`, `cp x.png frontend/`, `--output …png`); don't work around it by renaming or shelling out — fix the destination path.

**Documentation is part of Done.** A wrong doc is worse than no doc, so when a change touches a surface below, update the mapped doc/comment in the same PR. Put each fact at its lowest-drift home (code comments for single-file facts, on-demand docs for cross-cutting patterns); see `docs/documentation.md`. The `/doc-sync` skill and the PR review gate enforce this — the gate now submits a blocking verdict (red `claude-review` check) on PRs into `staging` as well as `main`.

| When a change touches… | Update… |
|---|---|
| `backend/src/routes/*`, `app.ts` mounts | architecture.md router map |
| `backend/src/lib/*` | architecture.md lib table (+ leveling.md if `level-reconciliation`/`experience*`; this file if `srd.ts` rules) |
| `schema.prisma` JSON cols / models / `CharacterEventType`; `lib/events.ts` `EventCategory` | architecture.md (JSON columns + audit log) |
| `frontend/src/{features,pages,components/ui,lib}/*` | frontend.md |
| new mutable domain / `…/transactions` endpoint | this file (non-negotiables) + architecture.md transaction pattern |
| `Dockerfile*`, `docker-compose*`, env vars | deployment.md |
| `package.json` scripts / Prisma workflow | development.md |

## Doc map

Read these on demand — they are **not** auto-loaded:

| Doc | Read this when… |
|---|---|
| `docs/architecture.md` | You need the router map, lib responsibilities, the data patterns (catalog+snapshot, JSON columns, audit log, transaction pattern), or the Docker Compose layout |
| `docs/development.md` | You need full commands, Prisma workflow, or the step-by-step "how to add a new domain/feature" recipe |
| `docs/testing.md` | You need to run tests, write a new test file, or understand the fixture-isolation rules |
| `docs/leveling.md` | You're touching XP, level-up/level-down, or any feature whose availability/count is gated by character level (subclass, maneuvers, future feats/ASI) |
| `docs/frontend.md` | You're writing frontend code: directory structure + where components/hooks/types belong, `@/` alias, Tailwind footgun, inline-panel-vs-Modal rule, primitives, dice engine, orchestrator pattern |
| `docs/deployment.md` | You're packaging the app for hosting (combined single-origin vs split images, prod compose, env vars) or deploying the dev environment to Railway behind Cloudflare Access |
| `docs/documentation.md` | You're adding or substantially editing any doc, or deciding where a piece of knowledge should live (the placement/tiering rule + house style) |
| `.claude/agent-memory/frontend-design-architect/design_system.md` | You need exact color/type/radius/shadow token names and the design direction rationale |
