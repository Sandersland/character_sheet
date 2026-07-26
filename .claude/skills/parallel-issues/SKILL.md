---
name: parallel-issues
description: Take a list of GitHub issues and drive them through one repeatable pipeline — research each issue, write a plan per issue (one batch approval), build them in parallel in isolated git worktrees, open a PR per issue against a shared integration branch, then land the whole wave on staging. Use when the user gives several issue numbers to work at once, e.g. "/parallel-issues 24 45 61" or "ship issues 24, 45 and 61 in parallel onto an integration branch". This is an orchestrator that reuses the worktree and verify-frontend skills.
---

# parallel-issues

Take a list of GitHub issues and drive them through one repeatable pipeline: research each issue → write a plan per issue (one batch approval) → build them in parallel in isolated git worktrees → open a PR per issue against a shared integration branch → land the wave on `staging` as one squashed PR. This is an **orchestrator** — it reuses the `worktree` and `verify-frontend` skills rather than reimplementing them.

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

- Names any **acceptance criterion the issue cannot actually satisfy**. A refined issue is not a verified one: ACs get written against a tree that has since moved, prescribe an implementation that doesn't meet their own criterion, or assert a grep result that some unrelated caller makes unreachable. Correct the issue body and say so — never quietly satisfy the letter of a criterion you know is wrong.

Present **all plans together** in one message and **STOP for a single approval**. This is the only human gate in the pipeline. Do not proceed to any branch creation until the user approves.

### 3. Establish the integration branch

All issue branches and PRs hang off one integration branch.

- If the user passed an integration branch arg: `git checkout` it; create it from `staging` if it doesn't exist.
- If they didn't: **ask** for a name, or propose `integration/<short-theme>` and confirm, then:

```bash
git checkout staging && git pull
git checkout -b <integration-branch>
git push -u origin <integration-branch>
```

> **Fork from the branch that already holds the wave's prerequisites — normally `staging`, never `main`.** `staging` is the default branch and runs ahead of `main` between promotes, so forking from `main` silently drops every unpromoted dependency and the wave builds against a tree that no longer exists. If the wave depends on work that hasn't reached `staging` yet, fork from *that* branch and verify the prerequisite is actually present (`git log --oneline <base> | grep <pr>`) before creating any worktree.

> **Critical ordering — do this before step 4.** `.claude/skills/worktree/worktree.sh create` forks each new branch from the **main checkout's current HEAD**. So the main checkout must be sitting on the integration branch *before* you create any worktree, or the issue branches fork from the wrong base and their PRs won't target integration cleanly.

### 4. Spin up an isolated worktree per issue

From the main checkout root, for each issue (reusing the `worktree` skill / its script):

```bash
./.claude/skills/worktree/worktree.sh create feat/issue-<#>-<slug> --up
```

This assigns a slot (1–9), writes a gitignored `.env` with the slot's ports + `COMPOSE_PROJECT_NAME`, and boots an isolated `db + backend + frontend` stack (own Postgres volume → migrations are isolated). Capture each worktree's **slot** from the output. Ports are `base + slot*10`:

- frontend `http://localhost:$((5173 + slot*10))`
- backend  `http://localhost:$((4000 + slot*10))/api`
- postgres `localhost:$((5432 + slot*10))`

First boot builds images and runs `prisma migrate deploy && prisma db seed` against the private DB. Before handing off to a build agent, wait until the backend is healthy — poll `http://localhost:$((4000 + slot*10))/api/health` until it returns `200` (`/api/characters` 401s behind auth, so it never reads healthy).

### 5. Build each issue in parallel (one background agent per worktree)

Launch one background subagent per issue (`run_in_background: true`), so they build concurrently. Give each agent: its worktree path (`.claude/worktrees/feat/issue-<#>-<slug>`), its slot + ports, the approved plan, the issue number, and the integration branch name. Each agent follows this loop:

> **Paste the house-rules preamble into every build agent's brief.** A delegated agent does **not** inherit CLAUDE.md — if you don't restate the non-negotiables, it will violate them and burn a review cycle (e.g. reaching for a relative import, or dropping a why-comment during a refactor). Include this verbatim in each agent prompt:
>
> ```
> House rules (CLAUDE.md non-negotiables — follow exactly):
> - Comments state what the code can't: the *why* — invariants, 5e-rule decisions, gotchas, deliberate-coupling latches. Never restate the code and never write section banners (a grep gate rejects them). Refer to other code by exported symbol name, never file path. Every suppression ends with `-- <reason>`. When you edit code, update its comment in the same edit — and never drop an existing why-comment in a refactor.
> - Imports: use the `@/` alias for every cross-file import — never relative `../` paths.
> - Display text: never render a raw skill/ability/save key. Resolve through `skillLabel`/`abilityLabel`/`abilityAbbr` or the `SKILL_OPTIONS`/`ABILITY_OPTIONS` lists in `@/lib/abilities`.
> - Backend calls: only through `frontend/src/api/client.ts` — never `fetch` directly from a component.
> - Frontend placement: domain-agnostic primitives in `components/ui/`, domain components in `features/<domain>/`, pure logic (no JSX) in `lib/`.
> - Backend (if touched): derive-don't-persist; 5e rules data only in `lib/`; mutate state only through `…/transactions` endpoints; level-gated state through `LEVEL_GATED_RECONCILERS` + a clamp-on-read.
> - Docs: pointers, not mirrors — if your change makes an existing statement in `docs/`/CLAUDE.md false, fix or delete that statement in the same PR; never append descriptions of new code.
> - Artifacts: screenshots/captures go to `/tmp` only — never the project tree.
> ```
>
> Tailor the list to the issue's surface (drop the backend rules for a frontend-only issue, etc.), but keep the comment-style and `@/`-import rules in every brief — those are the ones delegated agents most often miss.

> **Run all tooling _inside the containers_, not on the host.** A worktree's `node_modules` are empty Docker-volume mountpoints — host-run `npx vitest`/`prisma` will fail. Each container bind-mounts the **repo root** at `/app` (root-context build since #820, so the workspaces install can link `packages/*`), with the workspace at `/app/backend` / `/app/frontend` and `node_modules` named volumes shadowing both the hoisted root tree and the workspace-local one. The backend container already has `DATABASE_URL` preset to the internal `db:5432`. Because source is bind-mounted, your host file edits are live in-container immediately, and any migration files / generated Prisma client land back in the worktree (so they get committed). (`docs/testing.md` describes the host-run flow — that is for the **main** checkout, which has real `node_modules`; the worktree diverges.) Run everything below from the worktree dir.
>
> **`cd` to the workspace, not to `/app`.** `/app` is the repo root, so running vitest there leaves the `@/` alias unresolved and every test file fails to collect — a total false red (~475 failed files) that looks catastrophic and is purely a wrong working directory. `docker compose exec` already lands in the workspace via the service's `working_dir`; the explicit `cd` below is belt-and-braces.
>
> **Wait for the boot install before running anything.** Both containers run `npm install` on every start so the named volume reconciles with `package.json`. Tooling fired before it finishes reports `Failed to resolve import "<pkg>"` for any dependency the branch added — indistinguishable from a real breakage. Poll the logs for the dev-server ready line (`docker compose logs frontend | grep -q "ready in"`) or the backend's `/api/health` → `200` first.

**Per chunk — test first:**
1. Write the unit tests from the plan **first** (they should fail).
2. Implement until they pass.
   - **Backend tests** (DB already wired via container env — no `DATABASE_URL` needed):
     ```bash
     docker compose exec -T backend sh -c 'cd /app/backend && npx vitest run <test-file>'
     ```
     Running the **whole** backend suite in a worktree needs `--fileParallelism=false` — at default parallelism the workers contend on the stack's small Postgres pool and produce cross-domain 500s that look like real regressions. (A `PrismaClientValidationError`, by contrast, is always a genuinely broken fixture.)
   - **Schema changes** — migrate **and regenerate the client in the same step** (a stale client after `migrate dev` causes confusing runtime errors like `Invalid value for argument 'type'. Expected <Enum>` even though the migration succeeded):
     ```bash
     docker compose exec -T backend sh -c 'cd /app/backend && npx prisma migrate dev --name <change> && npx prisma generate'
     ```
     Then `docker compose restart backend` so the running server picks up the regenerated client; wait for `/api/health` → `200` again.
   - **Frontend tests** need no DB:
     ```bash
     docker compose exec -T frontend sh -c 'cd /app/frontend && npx vitest run <test-file>'
     ```
3. **Lint before committing** — `ci.yml` runs lint, so a missed lint error fails CI even when tests pass:
   ```bash
   docker compose exec -T backend  sh -c 'cd /app/backend  && npm run lint'
   docker compose exec -T frontend sh -c 'cd /app/frontend && npm run lint'
   ```
   Both must be clean.
4. Commit each green chunk with a conventional message: `feat(<domain>): <summary> (#<#>)`.

> **Host git hooks lie in a worktree — replicate their gates in-container before you push.** Lefthook fires on the host, where the worktree has no real `node_modules`: `fallow` is missing entirely, and the `tsc` jobs resolve against the **main checkout**, so they report green for code they never read. CI's `fallow` job is a required check on `staging`, so a bypassed audit surfaces on the PR instead. Run `npx tsc --noEmit` per workspace and `npx fallow audit --base <integration-branch> --no-cache` **inside the containers** before pushing. Likewise, the `post-checkout` prisma-regen hook can write a client for the wrong branch after a rebase — regenerate in-container (false red, ~65 tests) rather than trusting it.

**After the last chunk — UI gate (if the issue has a UI surface):**
Run the **verify-frontend** skill, adapted to this worktree — run the frontend unit tests as usual, but point the browser verification at the **worktree's** frontend URL (`http://localhost:<5173+slot*10>`), not the hardcoded 5173. Screenshots go under `/tmp/` only — never the project tree.

> **Playwright MCP gotcha:** `target` refs reset across snapshots and page reloads, so a ref captured earlier goes stale and `browser_snapshot`/click calls error. Re-`browser_snapshot` to get fresh refs, or fall back to `browser_evaluate` with DOM queries to read/assert state reliably. Button accessible names come from their **text content**, not `title` — scope an ambiguous click via its containing row.

**On all-green — open the PR:**
```bash
gh pr create --base <integration-branch> --head feat/issue-<#>-<slug> \
  --title "<conventional title> (#<#>)" \
  --body "Refs #<#>

<summary of chunks shipped + test/verify results>"
```

> **`Closes #` must NOT go on an integration-targeted PR — it silently never fires.** GitHub only auto-closes from the **default branch** (`staging` here), so a `Closes #` on a PR merged into `integration/*` closes nothing and leaves the wave's issues open after everything has shipped. Say `Refs #<#>` here and carry every `Closes #<#>` on the integration → `staging` PR in step 6, which is where they actually fire.

If the integration branch **is** `staging` (or any protected branch), auto-merge is available — but do not arm it yet. See the gate in step 6: a PR is merged only after CI is green *and* review feedback has been resolved or filed. Arming `--auto` earlier races both.

(Auto-merge is unavailable on ad-hoc `integration/*` branches anyway — GitHub only allows it against branches with protection rules, so the command fails there; those PRs wait for the wave's merge step.)

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

### 6. Land the wave — merge serially, then one PR into `staging`

The build agents open PRs; **merging them is the orchestrator's job**, one at a time, and it is where waves actually go wrong.

**Per feature PR, in dependency order:**

1. **Wait for CI to finish** — never judge a PR by a partial run.
2. **Read the review and respond to it.** Every `claude-review` finding gets resolved in the PR or filed as a follow-up issue with the reasoning recorded — not silently dismissed. This is a merge gate, not a formality.
3. **Merge (squash), then rebase the remaining siblings** onto the advanced integration branch.
4. **Re-check the rebased siblings' CI.** A base advance invalidates a sibling's earlier green: their tests passed against a tree that no longer exists. Waves have shipped regressions precisely here.

> **Siblings conflict on shared files even when their code files are disjoint.** Docs (`docs/frontend.md`, `docs/architecture.md`, CLAUDE.md) and hot shared hooks collide on every merge after the first. Budget one resolve per sibling; that is normal, not a sign a plan was wrong.

> **Never `worktree.sh rm` before the PR reads `MERGED`.** A removed worktree takes its branch's local state with it, and a PR that then needs a fix has nowhere to be fixed from.

**When every issue has landed on the integration branch — open one PR into `staging`:**

```bash
gh pr create --base staging --head <integration-branch> \
  --title "<Wave theme> (#<#> #<#> …)" \
  --body "Closes #<#>
Closes #<#>
…

<what shipped per issue, measured outcomes, bugs found, follow-ups filed>"
```

This is the PR that carries **every** `Closes #` (step 5 explains why the feature PRs can't) — they fire on merge, because `staging` is the default branch.

Both merge styles have shipped waves and neither is wrong; **pick deliberately and say which**. `--squash` lands the wave as one commit on `staging` (wave 2 / #1304). `--merge` preserves the per-issue commits and their `(#NNNN)` refs in `staging`'s history (playtest-multiclass / #1205). Squash is the better default — it keeps `staging` readable one-line-per-wave — but reach for `--merge` when the per-issue commits are the audit trail someone will need. (Unrelated: the `staging` → `main` promote is **always** a merge commit; see the `promote` skill.)

> **A green CI on a `staging` PR does not include e2e** — the required checks are `claude-review`, `lint`, `test`, `build`, `fallow`. If the wave touched UI layout, run the e2e suite yourself (`docker compose --profile e2e run --rm e2e`) before merging; auto-merge will otherwise land the PR before e2e ever reports.

### 7. Report

Collect every background result into one table:

| Issue | Branch | Slot / URLs | Result |
|---|---|---|---|
| #<#> | feat/issue-<#>-<slug> | slot N · frontend/backend URLs | PR link **or** failure reason + link to the issue comment |

Note that `claude-code-review.yml` auto-reviews each opened PR, and `ci.yml` runs lint + Postgres tests on it. Once the wave has landed, tear each worktree down with `./.claude/skills/worktree/worktree.sh rm feat/issue-<#>-<slug>` (frees its slot in `.claude/worktrees/registry.json` — an abandoned worktree holds its slot until `rm`), delete the integration branch local + remote, and prune the merged feature branches. Leave a worktree up only when its PR failed and is still under inspection.
