---
name: parallel-issues
description: Take a list of GitHub issues and drive them through one repeatable pipeline — research each issue, write a plan per issue (one batch approval), build them in parallel in isolated git worktrees, and open a PR per issue against a shared integration branch. Use when the user gives several issue numbers to work at once, e.g. "/parallel-issues 24 45 61" or "ship issues 24, 45 and 61 in parallel onto an integration branch". This is an orchestrator that reuses the worktree and verify-frontend skills.
---

# parallel-issues

Take a list of GitHub issues and drive them through one repeatable pipeline: research each issue → write a plan per issue (one batch approval) → build them in parallel in isolated git worktrees → open a PR per issue against a shared integration branch. This is an **orchestrator** — it reuses the `worktree` and `verify-frontend` skills rather than reimplementing them.

Use this when the user gives you several issue numbers to work at once, e.g. "run `/parallel-issues 24 45 61`" or "ship issues 24, 45 and 61 in parallel onto an integration branch".

Invocation: `/parallel-issues <issue-numbers...> [integration-branch]`

> **Cost note:** this fans out one background agent per issue, each running a full build+test+verify loop. It is token-heavy. Scale the worktree count to the issue list, and say so up front if the list is large.

## Steps

### 1. Gather the issues + readiness gate (read-only)

For each issue number, read it and its discussion:

```bash
gh issue view <#> --json title,body,labels,comments
```

**Readiness gate — check the label before doing anything else.** This pipeline only builds issues that have been refined and marked `ready` (see the `issues` skill for the readiness convention). Inspect each issue's readiness label:

- **`ready`** → proceed.
- **`epic`** → refuse. An epic is a tracker, not a unit of work — point the user at its sub-issues and offer to build those instead.
- **`needs-refinement`** → refuse. The issue has open decisions/ambiguity and must be refined first (run the `issues` skill). Building it would mean guessing at unsettled scope.
- **no readiness label** → proceed only with a warning that the issue hasn't been triaged; recommend refining it via the `issues` skill first.

If any requested issue is not `ready`, **stop here before the planning fan-out** and report which issues are blocked and why, rather than silently building an under-specified or non-atomic issue.

For the `ready` issues, summarize per issue: what it requires, the acceptance criteria, and which areas of the codebase it touches. Do **not** create branches or write code yet.

### 2. Plan every issue (parallel Plan agents) → one batch approval

Launch one `Plan` subagent per issue **in parallel** (single message, multiple tool calls). Give each agent the issue summary and require a plan that:

- Respects the CLAUDE.md non-negotiables — derive-don't-persist, 5e rules only in `lib/`, state changes through transaction endpoints, all backend calls via `frontend/src/api/client.ts`, frontend organized by domain, level-gated state through `LEVEL_GATED_RECONCILERS`. Reuse existing utilities; don't propose new code where something already exists.
- Breaks the work into **committable chunks**.
- Gives a **test plan per chunk** (which unit tests, backend vs frontend).
- Flags whether each chunk has a **UI surface** that needs browser verification.

Present **all plans together** in one message and **STOP for a single approval**. This is the only human gate in the pipeline. Do not proceed to any branch creation until the user approves.

### 3. Establish the integration branch

All issue branches and PRs hang off one integration branch.

- If the user passed an integration branch arg: `git checkout` it; create it from `main` if it doesn't exist.
- If they didn't: **ask** for a name, or propose `integration/<short-theme>` and confirm, then:

```bash
git checkout main && git pull
git checkout -b <integration-branch>
git push -u origin <integration-branch>
```

> **Critical ordering — do this before step 4.** `scripts/worktree.sh create` forks each new branch from the **main checkout's current HEAD**. So the main checkout must be sitting on the integration branch *before* you create any worktree, or the issue branches fork from the wrong base and their PRs won't target integration cleanly.

### 4. Spin up an isolated worktree per issue

From the main checkout root, for each issue (reusing the `worktree` skill / its script):

```bash
./scripts/worktree.sh create feat/issue-<#>-<slug> --up
```

This assigns a slot (1–9), writes a gitignored `.env` with the slot's ports + `COMPOSE_PROJECT_NAME`, and boots an isolated `db + backend + frontend` stack (own Postgres volume → migrations are isolated). Capture each worktree's **slot** from the output. Ports are `base + slot*10`:

- frontend `http://localhost:$((5173 + slot*10))`
- backend  `http://localhost:$((4000 + slot*10))/api`
- postgres `localhost:$((5432 + slot*10))`

First boot builds images and runs `prisma migrate deploy && prisma db seed` against the private DB. Before handing off to a build agent, wait until the backend is healthy — poll `http://localhost:$((4000 + slot*10))/api/characters` until it returns `200`.

### 5. Build each issue in parallel (one background agent per worktree)

Launch one background subagent per issue (`run_in_background: true`), so they build concurrently. Give each agent: its worktree path (`.claude/worktrees/feat/issue-<#>-<slug>`), its slot + ports, the approved plan, the issue number, and the integration branch name. Each agent follows this loop:

> **Run all tooling _inside the containers_, not on the host.** A worktree's `node_modules` are empty Docker-volume mountpoints — host-run `npx vitest`/`prisma` will fail. Each container bind-mounts its workspace at `/app` (`./backend:/app`, `./frontend:/app`) with deps in a named volume, and the backend container already has `DATABASE_URL` preset to the internal `db:5432`. Because source is bind-mounted, your host file edits are live in-container immediately, and any migration files / generated Prisma client land back in the worktree (so they get committed). (`.claude/docs/testing.md` describes the host-run flow — that is for the **main** checkout, which has real `node_modules`; the worktree diverges.) Run everything below from the worktree dir.

**Per chunk — test first:**
1. Write the unit tests from the plan **first** (they should fail).
2. Implement until they pass.
   - **Backend tests** (DB already wired via container env — no `DATABASE_URL` needed):
     ```bash
     docker compose exec -T backend sh -c 'cd /app && npx vitest run <test-file>'
     ```
   - **Schema changes** — migrate **and regenerate the client in the same step** (a stale client after `migrate dev` causes confusing runtime errors like `Invalid value for argument 'type'. Expected <Enum>` even though the migration succeeded):
     ```bash
     docker compose exec -T backend sh -c 'cd /app && npx prisma migrate dev --name <change> && npx prisma generate'
     ```
     Then `docker compose restart backend` so the running server picks up the regenerated client; wait for `/api/characters` → `200` again.
   - **Frontend tests** need no DB:
     ```bash
     docker compose exec -T frontend sh -c 'cd /app && npx vitest run <test-file>'
     ```
3. **Lint before committing** — `ci.yml` runs lint, so a missed lint error fails CI even when tests pass:
   ```bash
   docker compose exec -T backend  sh -c 'cd /app && npm run lint'
   docker compose exec -T frontend sh -c 'cd /app && npm run lint'
   ```
   Both must be clean.
4. Commit each green chunk with a conventional message: `feat(<domain>): <summary> (#<#>)`.

**After the last chunk — UI gate (if the issue has a UI surface):**
Run the **verify-frontend** skill, adapted to this worktree — run the frontend unit tests as usual, but point the browser verification at the **worktree's** frontend URL (`http://localhost:<5173+slot*10>`), not the hardcoded 5173. Screenshots go under `/tmp/` only — never the project tree.

> **Playwright MCP gotcha:** `target` refs reset across snapshots and page reloads, so a ref captured earlier goes stale and `browser_snapshot`/click calls error. Re-`browser_snapshot` to get fresh refs, or fall back to `browser_evaluate` with DOM queries to read/assert state reliably. Button accessible names come from their **text content**, not `title` — scope an ambiguous click via its containing row.

**On all-green — open the PR:**
```bash
gh pr create --base <integration-branch> --head feat/issue-<#>-<slug> \
  --title "<conventional title> (#<#>)" \
  --body "Closes #<#>

<summary of chunks shipped + test/verify results>"
```

**On any failure** (tests won't pass, verification fails, the plan is ambiguous or wrong): **stop** this agent. Do **not** force a PR. Leave the worktree intact for inspection, and leave a comment on the issue explaining what happened:

```bash
gh issue comment <#> --body "Automated build via /parallel-issues could not complete.

**Why it failed:** <root cause>
**Where:** <which chunk>
**What was attempted:** <summary>
**Failing output:**
\`\`\`
<failing test / verification output>
\`\`\`"
```

Then report the failure back to the orchestrator.

### 6. Report

Collect every background result into one table:

| Issue | Branch | Slot / URLs | Result |
|---|---|---|---|
| #<#> | feat/issue-<#>-<slug> | slot N · frontend/backend URLs | PR link **or** failure reason + link to the issue comment |

Note that `claude-code-review.yml` auto-reviews each opened PR, and `ci.yml` runs lint + Postgres tests on it. Leave worktrees up for inspection; tear one down with `./scripts/worktree.sh rm feat/issue-<#>-<slug>` (frees its slot in `.claude/worktrees/registry.json` — an abandoned worktree holds its slot until `rm`).
