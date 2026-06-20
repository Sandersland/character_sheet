# CLAUDE.md

D&D 5e character sheet app — **Phase 4: live play & automation**. The stack is Postgres + Prisma 7 + Express (backend) and Vite + React + TypeScript + Tailwind v4 (frontend), in an npm workspaces monorepo (`backend/`, `frontend/`). The sheet is fully interactive: HP management (damage, healing, rests, death saves, level-up), XP tracking (auto-derives level + proficiency bonus), full inventory CRUD (catalog + custom items, currency), and spellcasting (slot management, casting rolls dice, learns/prepares/forgets spells). Every meaningful mutation is recorded in a unified audit log with LIFO undo. A guided character-creation flow (`/characters/new`) is also shipped.

## Quickstart

```bash
docker compose up --build   # db (5432) + pgAdmin (5050) + backend (4000) + frontend (5173)
```

Root scripts fan out to both workspaces:

```bash
npm run dev | lint | test | build
```

See `.claude/docs/development.md` for per-workspace commands, running outside Docker, and the Prisma workflow.

## Non-negotiables (always apply)

**Derive, don't persist.** `level` and `proficiencyBonus` are computed from `experiencePoints` in `serializeCharacter`; spellcasting slot totals/save DC/attack bonus are computed from class+level+ability scores via `deriveSpellcasting()` in `srd.ts`. `race`/`class`/`background` are read from the selection relations. None of these are columns; don't add them back.

**5e rules data lives only in `lib/`.** `backend/src/lib/experience.ts` (XP curve) and `backend/src/lib/srd.ts` (everything else: alignments, skills, ability math, spellcasting ability, slot tables, starting equipment, `deriveCreatedCharacter`). Never duplicate rules on the frontend or inline them in a route.

**State changes go through intent-bearing transaction endpoints.** `PATCH /api/characters/:id` is a thin field-patch for cosmetic/DM-assigned fields (`name`, `armorClass`, `currency`, etc.). Inventory, HP, XP, and spellcasting are mutated only through their dedicated `POST …/transactions` endpoints, which validate ops, apply them atomically, write audit events, and return the updated character. Do not add new mutable domains to PATCH.

**All backend calls go through `frontend/src/api/client.ts`.** Never call `fetch` directly from a component.

**Tailwind v4 utilities work normally here.** Named size utilities (`max-w-xl`, `w-96`, etc.) and numeric spacing (`p-4`, `gap-2`) all resolve correctly. Custom `@theme` tokens also auto-generate idiomatic utilities — prefer `text-garnet-700` over `text-[var(--color-garnet-700)]`, `rounded-card` over `rounded-[var(--radius-card)]`, etc. One historical footgun to never reintroduce: bare `--spacing-{name}` custom tokens (e.g. `--spacing-sm`) collide with Tailwind's `--container-*` scale and break `max-w-sm/md/lg/xl/2xl`. If a named spacing rhythm is ever wanted, use a `--space-*` prefix instead.

**Backend tests need Postgres.** Run `docker compose up db -d` first and export `DATABASE_URL` in the same shell command as `vitest` (not a prior `export`). See `.claude/docs/testing.md`.

## Doc map

Read these on demand — they are **not** auto-loaded:

| Doc | Read this when… |
|---|---|
| `.claude/docs/architecture.md` | You need the router map, lib responsibilities, the data patterns (catalog+snapshot, JSON columns, audit log, transaction pattern), or the Docker Compose layout |
| `.claude/docs/development.md` | You need full commands, Prisma workflow, or the step-by-step "how to add a new domain/feature" recipe |
| `.claude/docs/testing.md` | You need to run tests, write a new test file, or understand the fixture-isolation rules |
| `.claude/docs/frontend.md` | You're writing frontend code: Tailwind footgun, inline-panel-vs-Modal rule, primitives, dice engine, orchestrator pattern |
| `.claude/agent-memory/frontend-design-architect/design_system.md` | You need exact color/type/radius/shadow token names and the design direction rationale |
