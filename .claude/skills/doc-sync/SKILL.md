---
name: doc-sync
description: Audit documentation and code-comment drift against the actual code for a change set, then update the docs in house-style and offer to file a `documentation`-labeled issue for anything out of scope. Use when the user says "/doc-sync", "check docs are up to date", "sync the docs", "did I miss any doc updates", or wants to verify a branch/PR's docs and comments still match its code before merging.
---

# doc-sync

Audit doc and comment drift against the code for a change set, fix what's safe to fix in house-style, and offer to file a `documentation` issue for anything ambiguous. The authority for *how* to write the fixes is `docs/documentation.md`; this skill summarizes its rules inline so it's self-contained.

Invocation: `/doc-sync [pr-number | --since <ref>]`

> The PR review gate runs these same checks automatically on PRs into `main`. Running `/doc-sync` locally before you open the PR just gets ahead of it.

**House-style rubric (from `docs/documentation.md` — apply to every fix):**
- **Right altitude.** Session-loaded `CLAUDE.md` = broad stable invariants only. On-demand `docs/` = cross-cutting knowledge. Code comments / `schema.prisma` model comments = facts about ONE file/function/model. `memory/` = roadmap/rationale. Don't push file-local facts up into a doc, or invariants down into a comment.
- **Invariant over enumeration.** Prefer documenting the pattern + why over listing instances. When an enumeration earns its place (router map, lib table), **anchor it to its source-of-truth file** so it self-corrects.
- **Canonical example.** Point recurring concepts at the one reference implementation (e.g. `lib/inventory.ts` for the transaction pattern) instead of re-describing.
- **Concrete & testable.** Every instruction must be checkable ("never add `level` as a column"), never vague.

## Steps

### 1. Determine the change set

- **Default:** `git diff main...HEAD --name-only` (everything this branch changed vs `main`).
- **PR number passed:** `gh pr diff <pr-number> --name-only`.
- **`--since <ref>`:** `git diff <ref>...HEAD --name-only`.

Also capture the actual diff hunks (`git diff main...HEAD`, or the PR/ref equivalent) — step 5 needs the changed lines, not just filenames.

### 2. Map changed paths → affected docs (doc-ownership map)

Use the doc-ownership map in `CLAUDE.md` (its Doc-map table + the per-surface mapping below). For each changed path, the affected doc(s):

| Changed path | Affected doc(s) |
|---|---|
| `backend/src/app.ts`, `backend/src/routes/*` | `architecture.md` → router map (and `api/client.ts` notes if a new endpoint) |
| `backend/src/lib/*` | `architecture.md` → lib responsibility table |
| `backend/src/lib/level-reconciliation.ts`, `lib/experience*.ts` | `architecture.md` lib table **+ `leveling.md`** |
| `backend/src/lib/srd.ts` (rules data) | `architecture.md` lib table **+ `CLAUDE.md`** (5e-rules-only-in-`lib` non-negotiable) |
| `backend/prisma/schema.prisma` — JSON columns, models, event types | `architecture.md` → data patterns / audit-log sections |
| `backend/src/lib/events.ts` — `EventCategory`/`EventType` | `architecture.md` → unified audit log |
| **New** transaction domain (Zod union + `apply*Operations` + route) | `CLAUDE.md` (transaction-endpoint non-negotiable) **+ `architecture.md`** |
| `frontend/src/{features,pages,components/ui,lib}/*` | `frontend.md` (+ `architecture.md` pages/routes table if a route changed) |
| `Dockerfile*`, `docker-compose*.yml`, env vars | `deployment.md` |
| `package.json`, `backend/prisma/*` workflow | `development.md` |

If a change touches a surface not in the map, note it for the issue offer in step 4 rather than guessing a home.

### 3. Diff the docs against the real code

For each affected doc, grep the **current** code for the things the doc claims, and compare:

- **Router map** → `rg "router\.(get|post|patch|delete)" backend/src/routes` and reconcile every endpoint against `architecture.md`'s table.
- **Lib table** → list `backend/src/lib/*.ts` and their exports; reconcile names + one-line responsibilities.
- **`api/client.ts`** → its exported functions vs the doc's "key ones" list.
- **Enums** (`EventCategory`/`EventType`, Prisma enums) → the doc's listed values vs the source union/enum.
- **Frontend folders / routes** → `App.tsx` routes and `features/`/`pages/` dirs vs `frontend.md`.

Flag every claim the code no longer supports (missing, renamed, added, or restated-and-now-wrong).

### 4. Update the docs (default), then offer an issue for the rest

**Default action: fix the docs directly**, in house-style:

- Anchor enumerations to their source-of-truth file; prefer stating the invariant over re-listing instances.
- Keep instructions concrete and testable.
- Respect altitude — if a stale fact is really about one file, fix it as a comment (step 5), not by bloating a doc.
- A genuinely new on-demand doc gets one row added to the `CLAUDE.md` Doc-map table.

**Then offer an issue** for anything ambiguous, large, or out of the mapped scope (a new surface with no documented home, a doc that needs restructuring, a contradiction you can't resolve confidently):

```bash
gh issue create --label documentation \
  --title "<short drift description>" \
  --body "<what changed, which doc/comment is now wrong, suggested fix or open question>"
```

Don't auto-file — present the proposed issue(s) and let the user confirm.

### 5. Comment-drift scan

Within the diff hunks, find comments / docstrings / `schema.prisma` model comments **adjacent to changed code** whose claims the change now contradicts or strands (an out-of-date "// returns null when …", a model comment describing a column that moved, a TODO the change resolved). Fix the ones you can fix safely; flag the rest for the issue offer. Comments explain *why* — when you fix one, keep it intent-bearing, don't restate the code.

### 6. Report

Print a short PASS/Δ report:

```
## doc-sync: <change set, e.g. main...HEAD (N files)>

**Verdict:** PASS (no drift) | Δ (drift found)

### Docs updated
- <file> → <what was reconciled>

### Comments fixed
- <file:line> → <what was corrected>

### Issues offered
- <title> — <why it's out of scope to auto-fix>
```

PASS only when no doc or comment in the change set's ownership map disagrees with the code.
