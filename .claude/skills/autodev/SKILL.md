---
name: autodev
description: Run the deterministic autonomous-development state machine — pick a ready GitHub issue (or take a given issue number), confirm its scope, build it test-first in an isolated worktree, review it, and open a PR, fully unattended with per-state tool permissions and turn/cost budgets. Use when the user says "/autodev", "run autodev", "autonomously pick up an issue", "work the backlog unattended", or wants a hands-off issue→PR run. Not for interactive multi-issue building with a human approval gate — that's parallel-issues.
---

# autodev

A finite state machine for unattended issue→PR development. Unlike the prompt-orchestrated pipelines (`parallel-issues`), transitions here are **code-enforced**: a Node driver runs each state as a separate headless `claude -p` invocation with its own tool restrictions, model, turn/cost caps, and a PreToolUse guard hook — then validates the state's JSON output envelope and follows the machine's transition table. Every step lands in a run ledger.

## The machine (`machines/issue-pipeline.json`)

```
GetWork ──found──▶ ClaimIssue ──claimed──▶ ConfirmScope ──ready──▶ SetupWorktree ──▶ Worker
   │empty   ▲          │taken (≤3)             │not-ready            (script,        done│  ▲
   ▼        └──────────┘                       ▼                      seeds UI char)     ▼  │changes
  Done                                    FlagIssue ─▶ ApplyFlag ─▶ Done             Reviewer│(≤3)
                                          (comment + needs-refinement                approve│──┘
                                           label + unassign)                             ▼
              any state error / budget breach ──▶ Fail ──▶ Done                    Submit ──▶ Done
                                    (comment + unassign)                     (push + PR, auto-merge)
```

Submit arms **auto-merge** (squash) on the PR, so a green claude-review + CI lands it into the integration branch unattended. Set `"autoMerge": false` in the machine's `context` to keep PRs open for a human merge instead.

- **agent states** run headless claude, constrained by `--tools`, `--allowedTools`, `--max-turns`, `--max-budget-usd`, per-state model, and `fsm-guard.mjs` (bash allow/deny regexes). `--setting-sources project` keeps local/user permission allowlists out of the child.
- **script states** are deterministic driver functions (worktree setup via the `worktree` skill's script, health polling, `gh pr create`, labeling) — zero tokens.
- Budgets (steps, $, wall clock) and the Reviewer→Worker loop limit live in the machine JSON; any breach routes to `Fail`, which comments on the issue and leaves the worktree intact.

## Running it

Launch the driver **in the background** (a full run takes tens of minutes) from the repo root:

```bash
node .claude/skills/autodev/fsm.mjs run issue-pipeline                      # discover a ready issue
node .claude/skills/autodev/fsm.mjs run issue-pipeline --issue 42           # skip discovery, start at ConfirmScope
node .claude/skills/autodev/fsm.mjs run issue-pipeline --integration my-br  # PR base (default: staging)
node .claude/skills/autodev/fsm.mjs run issue-pipeline --max-cost 40        # override the machine's global cost cap
```

**Exit codes:** `0` success · `1` failed · `75` (EX_TEMPFAIL) rate-limited — the run
saved `retryable: true` + `retryAt` (epoch ms) in `run.json` and kept its issue claim
and worktree; `resume <run-dir>` after `retryAt` re-enters the interrupted state on
its saved session. Crashed attempts are billed and ledgered (with `exitCode`), other
nonzero exits get one automatic in-process retry via session resume, and failed runs
push their committed work to `origin/<branch>` (compare link in the fail comment).

Debug/verification flags:

```bash
--dry-run        # print every state's claude command + rendered prompt; no invocations
--only GetWork   # run a single state and stop (great for smoke-testing one prompt)
--start Worker   # enter at a given state (ctx must already make sense — mostly for development)
node .claude/skills/autodev/fsm.mjs resume .claude/autodev/runs/<run-id>    # re-enter at the failed state
```

## Monitoring + reporting

Each run writes `.claude/autodev/runs/<run-id>/` (gitignored):

- `log.txt` — narrated progress (tail this)
- `run.json` — status, current state, ctx, cost so far
- `steps.jsonl` — one line per step: state, session id, turns, cost, transition
- `payloads/` — every validated state output; `raw-*.json` — full claude stdout per attempt
- `pr-body.md` / `flag-comment.md` / `fail-comment.md` — what was published

When the run finishes, report: the issue worked, the outcome (PR URL / flagged / failed + why), fix cycles used, total cost, and the run dir. On failure the worktree is left intact — inspect it, then tear down with `./.claude/skills/worktree/worktree.sh rm <branch>`.

## Extending

A new pipeline = a new `machines/<name>.json` + prompt files under `states/` — the driver is machine-agnostic. Per state you declare: `type` (agent/script/terminal), `prompt`/`resumePrompt` (template with `{{ctx}}` vars — `cwd` uses the same `{{…}}` syntax), `tools`, `allowedTools`, `bashAllow`/`bashDeny` regexes, `model`, `fallbackModel` (headless overload fallback), `maxTurns`, `maxBudgetUsd`, `wallMinutes`, `permissionMode`, `cwd`, `required` payload keys per edge, and `transitions`. Script states name a `handler` implemented in `fsm.mjs`.

Note the two-layer Bash contract: `allowedTools` prefix-matches the **whole** command (a piped `gh issue view … | jq` passes on its `gh` prefix), while the guard's `bashAllow`/`bashDeny` judge each **segment** — so filter commands (`head`, `jq`, …) belong in `bashAllow` even when absent from `allowedTools`; they're only reachable as pipe segments. In allowlist states the guard also blocks command substitution (`$(…)`/backticks) outright; in deny-based states substitution bodies are extracted and deny-checked.

## Concurrent runs

Concurrent runs are safe: `worktree.sh create` serializes slot assignment behind an mkdir lock (`.claude/worktrees/.slot.lock` — remove it by hand only if a create crashed while holding it), and each run **claims its issue by self-assigning** right after GetWork (the `ClaimIssue` script state). GetWork excludes assigned issues, so a `taken` claim loops back for a re-pick (≤3 tries). Failure paths (`Fail`, `ApplyFlag`) release the claim; a successful PR keeps the assignee as an ownership signal until merge.

## UI verification

When ConfirmScope marks `uiSurface: true`, the Reviewer gets a Playwright MCP server (declared per-state via `mcpConfig` → `--mcp-config --strict-mcp-config`) and, **after** its test runs, creates a deterministic test character via dev-login + `POST /api/characters` (fresh worktree DBs have catalog only, zero characters) and exercises the changed surface in the worktree's own frontend — login, click the flow, console check, screenshot to `/tmp`. The PR body reports the outcome (`UI: visually verified` vs an explicit ⚠ when verification failed).

> Ordering is load-bearing (learned from run `…issue-322`): `auth.test.ts`'s fixture cleanup deletes the `dev-user-local` User, cascading away its characters — so the character must be created after the last backend-suite run, never in SetupWorktree.

> Gotcha (verified empirically): `--tools` restricts the built-in toolset and **also strips MCP tools** — a state that needs an MCP server must omit `tools` and rely on `allowedTools` (headless mode auto-denies everything unlisted, so the wall holds).

## Known limits

- The Reviewer verifies UI against the seeded dummy character (level-1 Human Fighter), not production-like data — surfaces gated on higher levels/classes/inventory may need a human pass.
- The issue claim is check-then-assign (GitHub has no atomic claim); a sub-second tie between two runs can double-claim. The slot lock still prevents any port collision in that case.
- The subscription's **weekly** compute cap has no parseable in-band reset signal — hitting it looks like a rate_limit tempfail (exit 75) that never clears on resume. An orchestrator's rate-limit retry cap bounds the damage; if resumes keep tempfailing, check `/usage` manually.
