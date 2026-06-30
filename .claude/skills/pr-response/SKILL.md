---
name: pr-response
description: Work through reviewer feedback on a GitHub pull request and drive it to a clean re-review. Use this whenever a PR has review comments to act on — e.g. "respond to the review on #265", "address the PR comments", "the claude-review check requested changes", "handle the bot's feedback", or "/pr-response 266". It judges which findings are actually worth doing (declining nits with no real benefit), replies on the PR with its verdict before changing code, then fixes the accepted findings test-first and pushes for re-review. Do NOT use it to generate a review of a diff (that's /code-review) or for code changes unrelated to PR feedback. Reuses the worktree skill.
---

# pr-response

Take an open PR's review feedback and drive it to a clean re-review: fetch the comments → **triage** each finding for real merit → **respond on the PR** with an address/decline verdict → fix the accepted ones **test-first** → push and let the review re-run. This is the response counterpart to `/code-review` (which *generates* reviews); it reuses the `worktree` skill rather than reimplementing it.

Use this when a PR has review feedback to handle — the `claude-review` check requested changes, a human left comments, or the user says "respond to the comments on #265".

Invocation: `/pr-response [pr-number]` — omit the number to use the PR for the current branch.

> **The order matters.** Triage and post the response *before* writing any code. The point of the skill is the judgment step — not every finding deserves a fix, and the PR should record why. Do not skip straight to editing.

> **Cost note:** this runs a full build+test loop per accepted finding and re-triggers CI on push. Scale effort to the finding count; for a single nit, say so and keep it light.

## Steps

### 1. Gather all feedback (read-only)

Resolve the PR number (the arg, or `gh pr view --json number -q .number` for the current branch), then pull every channel of feedback:

```bash
gh pr view <N> --json number,title,headRefName,baseRefName,state,reviews,comments
gh api repos/Sandersland/character_sheet/pulls/<N>/comments    # inline diff threads (path+line)
```

For inline threads you'll also want their GraphQL node IDs + resolved state (needed to reply/resolve in step 6):

```bash
gh api graphql -f query='
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:50){ nodes {
        id isResolved
        comments(first:20){ nodes { databaseId path line body author{login} } }
      } }
    }
  }
}' -f owner=Sandersland -f repo=character_sheet -F pr=<N>
```

> **Know the two comment shapes.** In this repo the automated `claude-review` bot posts an **issue-level conversation comment** (the structured findings list, author `claude`) plus one **PR-level `CHANGES_REQUESTED` review** — it does **not** leave inline threads. Inline review threads only appear when a human or `/code-review --comment` leaves them. Step 4 and step 6 handle both.

Focus on the **latest** review pass. Skip findings already fixed by commits after the review's `commit.oid`, and threads already `isResolved`.

> **A green check does not mean "no findings."** The `claude-review` check re-blocks (`CHANGES_REQUESTED`) on its first pass, but on follow-up passes it often leaves genuine findings in a plain **comment** while the check stays green and the PR stays mergeable. Always read the body of the latest `claude` comment and triage its findings on merit — never conclude "nothing to do" from the check colour alone. Only stop when the latest comment itself says it's clean (e.g. "No new findings").

### 2. Triage — the relevance gate (the point of the skill)

For each finding, **open the actual code and verify the claim** — the reviewer (especially a bot) can be wrong, stale, or suggest something that violates a house rule. Then classify:

- **Address** — real correctness bugs, races, data-integrity/security issues, accessibility regressions, doc-drift the gate blocks on, and nits that carry **genuine** clarity or performance benefit.
- **Decline** — not relevant, speculative, out of scope for this PR, conflicts with a deliberate decision already made, or where the suggested "fix" would *violate* a CLAUDE.md non-negotiable (e.g. expanding a one-line comment into a block) or actually reduce clarity. Every decline needs a concrete one-line reason.

Produce a triage table — `finding → verdict → reason → chunk` — and keep it; it becomes the PR response in step 4 and the report in step 8.

### 3. Plan: context, chunking, parallelism

- For each **Address** finding, read the surrounding file/function so the fix is precise, and reuse existing utilities rather than adding new code.
- Group the fixes into **committable chunks** by domain/file — each chunk is one coherent TDD cycle. Note its test plan and whether it has a UI surface needing browser verification (`verify-frontend`).
- **Decide parallelism for this PR and state the choice + why:**
  - **Default — sequential** in the PR's existing worktree. A worktree has one git index, so concurrent agents can't safely commit to it.
  - **Parallel** only when there are several genuinely file-disjoint chunks worth the overhead: spawn one background agent per chunk, each in its **own** worktree on a throwaway `fix/pr<N>-<slug>` sub-branch off the PR head, then merge each sub-branch back into the PR branch. For typical review volume this is overkill — prefer sequential.

### 4. Respond on the PR — before fixing

Post the verdict for **every** finding (address *and* decline), matched to the comment shape:

- **Inline review threads** (human / `--comment`): reply on each thread stating intent + reason, e.g.

  ```bash
  gh api repos/Sandersland/character_sheet/pulls/<N>/comments/<comment_databaseId>/replies \
    -f body="Addressing — will guard the ended-session case. (fix incoming)"
  ```
  Leave the **resolve** for step 6, when the fix actually lands.

- **Issue-level bot review** (the structured `claude` comment, no threads): post one structured PR comment with the triage table — there's nothing to resolve, and the bot's `CHANGES_REQUESTED` auto-dismisses on a clean re-run.

  ```bash
  gh pr comment <N> --body "$(cat <<'EOF'
  ## Review response

  | Finding | Verdict | Notes |
  |---|---|---|
  | leaveSession ended-session guard | ✅ Addressing | real bug — adding the active-session check |
  | combatRounds summed in recap | ✅ Addressing | switching to Math.max |
  | rejoin returns 201 | 🟡 Declining | intentional: <reason> |
  EOF
  )"
  ```

### 5. Implement TDD, chunk by chunk

Work in the PR's worktree (reuse it if live, else create it — see the worktree note below). Run **all** tooling inside the containers:

```bash
docker compose exec -T backend  sh -c 'cd /app && npx vitest run <test-file>'
docker compose exec -T frontend sh -c 'cd /app && npx vitest run <test-file>'
```

Per chunk:
1. **Write the failing regression test first** — capture the exact finding so it can't regress.
2. **Run it and confirm it's actually red _before_ touching the fix.** This is the step most easily skipped: if you fix first and the test passes on the first run, you never proved the test exercises the bug — it may be a tautology. Run red, then fix. Only mark a chunk **"test: N/A"** when there is genuinely no place to assert (a one-word error string, a doc edit) **or no test harness exists for that surface** (e.g. a page component with no `*.test.tsx`) — say which, and don't scaffold a heavy new harness just to cover a one-line guard.
3. Implement the fix until **green**.
4. **Lint** both workspaces as touched (`npm run lint` in each) — CI fails on a lint miss even when tests pass.
5. Commit: `fix(<domain>): <finding> (#<issue>)`. The issue/PR reference goes in the **commit message**, never in a code comment.

> **House rules for any delegated agent.** A subagent does not inherit CLAUDE.md. If you fan out in step 3, paste the non-negotiables preamble (see `parallel-issues`' "house-rules preamble") into each brief, tailored to the chunk's surface — keep the one-line-comment and `@/`-import rules in every brief.

### 6. Reply / resolve per finding as fixes land

For inline threads, reply with the commit ref and resolve the thread:

```bash
gh api graphql -f query='mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }' \
  -f id='<thread node id from step 1>'
```

Declined threads get the reasoned reply (resolving is optional — the reasoning is what matters).

### 7. Push + re-trigger review, await the new verdict

```bash
git push                       # updates the PR and re-triggers claude-code-review.yml
gh pr checks <N> --watch       # or re-fetch --json reviews,statusCheckRollup
```

A clean re-run makes the workflow **auto-dismiss** its own stale `CHANGES_REQUESTED`, turning the check green. If the new pass raises **new** findings, loop back to step 1 for that pass. Do not auto-merge — report and let the user decide.

> **The triage gate (step 2) bounds the loop — don't chase nits forever.** Each fix push can surface adjacent, ever-smaller findings; that's expected. Re-run the gate every pass: address what carries real benefit, decline the rest with a reason. When a pass yields only marginal nits — or you've already declined something equivalent — stop and report rather than looping again; say in the report that you're stopping and why. A clean pass ("No new findings") or only-declines is the natural exit. The point is convergence, not a zero-comment PR at any cost.

### 8. Report

One table: `finding → verdict (addressed / declined) → commit or thread link → new review status`. Leave the worktree up for inspection (tear down later with `./.claude/skills/worktree/worktree.sh rm <branch>`).

> **Worktree reuse.** An open PR built via `parallel-issues` usually still has a live worktree — check `.claude/worktrees/registry.json` for its head branch. Reuse it. If none exists, `./.claude/skills/worktree/worktree.sh create <head-branch> --up` is idempotent: it re-attaches the existing branch and boots an isolated stack. Wait for the backend to answer (`200`/`401` on `/api/characters`) before running in-container commands. Falling back to the main checkout works too, but then tooling runs on the host per `.claude/docs/testing.md`.
