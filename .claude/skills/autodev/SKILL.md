---
name: autodev
description: Run the deterministic autonomous-development state machine — pick a ready GitHub issue (or take a given issue number), confirm its scope, build it test-first in an isolated worktree, review it, and open a PR, fully unattended with per-state tool permissions and turn/cost budgets. Use when the user says "/autodev", "run autodev", "autonomously pick up an issue", "work the backlog unattended", or wants a hands-off issue→PR run. Not for interactive multi-issue building with a human approval gate — that's parallel-issues.
---

# autodev

A finite state machine for unattended issue→PR development. Unlike the prompt-orchestrated pipelines (`parallel-issues`), transitions here are **code-enforced**: a Node driver runs each state as a separate headless `claude -p` invocation with its own tool restrictions, model, turn/cost caps, and a PreToolUse guard hook — then validates the state's JSON output envelope and follows the machine's transition table. Every step lands in a run ledger.

## The machine (`machines/issue-pipeline.json`)

```
GetWork ──found──▶ ConfirmScope ──ready──▶ SetupWorktree ──▶ Worker ──done──▶ Reviewer
   │empty              │not-ready            (script)          ▲                │approve
   ▼                   ▼                                       │changes         ▼
  Done            FlagIssue ─▶ ApplyFlag ─▶ Done               └──(≤3 loops)  Submit ──▶ Done
                  (comment + needs-refinement label)                          (push + PR)
                            any state error / budget breach ──▶ Fail ──▶ Done
```

- **agent states** run headless claude, constrained by `--tools`, `--allowedTools`, `--max-turns`, `--max-budget-usd`, per-state model, and `fsm-guard.mjs` (bash allow/deny regexes). `--setting-sources project` keeps local/user permission allowlists out of the child.
- **script states** are deterministic driver functions (worktree setup via the `worktree` skill's script, health polling, `gh pr create`, labeling) — zero tokens.
- Budgets (steps, $, wall clock) and the Reviewer→Worker loop limit live in the machine JSON; any breach routes to `Fail`, which comments on the issue and leaves the worktree intact.

## Running it

Launch the driver **in the background** (a full run takes tens of minutes) from the repo root:

```bash
node .claude/skills/autodev/fsm.mjs run issue-pipeline                      # discover a ready issue
node .claude/skills/autodev/fsm.mjs run issue-pipeline --issue 42           # skip discovery, start at ConfirmScope
node .claude/skills/autodev/fsm.mjs run issue-pipeline --integration my-br  # PR base (default: staging)
```

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

A new pipeline = a new `machines/<name>.json` + prompt files under `states/` — the driver is machine-agnostic. Per state you declare: `type` (agent/script/terminal), `prompt`/`resumePrompt` (template with `{{ctx}}` vars — `cwd` uses the same `{{…}}` syntax), `tools`, `allowedTools`, `bashAllow`/`bashDeny` regexes, `model`, `maxTurns`, `maxBudgetUsd`, `wallMinutes`, `permissionMode`, `cwd`, `required` payload keys per edge, and `transitions`. Script states name a `handler` implemented in `fsm.mjs`.

Note the two-layer Bash contract: `allowedTools` prefix-matches the **whole** command (a piped `gh issue view … | jq` passes on its `gh` prefix), while the guard's `bashAllow`/`bashDeny` judge each **segment** — so filter commands (`head`, `jq`, …) belong in `bashAllow` even when absent from `allowedTools`; they're only reachable as pipe segments. In allowlist states the guard also blocks command substitution (`$(…)`/backticks) outright; in deny-based states substitution bodies are extracted and deny-checked.

## Known limits (v1)

- The Reviewer does not drive a browser; when the issue has a UI surface the PR body flags that visual verification is still needed (run `verify-frontend` on the PR, per the repo's UI-verification convention).
- One run at a time is the intended mode; concurrent runs work but will race for worktree slots.
