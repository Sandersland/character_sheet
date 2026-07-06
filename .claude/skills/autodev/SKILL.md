---
name: autodev
description: Run and operate the deterministic autonomous-development pipeline — pick a ready GitHub issue (or take a given issue number), confirm its scope, build it test-first in an isolated worktree, review it, and open a PR, fully unattended with per-state tool permissions and turn/cost budgets; batches run under a resident daemon (autodevd) driven via autodevctl. Use when the user says "/autodev", "run autodev", "autonomously pick up an issue", "work the backlog unattended", wants a hands-off issue→PR run — or asks about a running/finished batch ("how's the overnight batch doing?", "why did #N fail?", "add #N to the batch", "pause/stop the batch"). Not for interactive multi-issue building with a human approval gate — that's parallel-issues.
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

Submit arms **auto-merge** (squash) on the PR, so a green claude-review + CI lands it into the integration branch unattended. Set `"autoMerge": false` in the machine's `context` to keep PRs open for a human merge instead. Submit also repairs the root `package-lock.json` when a workspace `package.json` changed (workers can't reach the root lock from their containers) and swaps the issue's `ready` label for `in-staging` so unattended discovery never re-picks shipped work.

A second machine, **`machines/pr-response.json`** (`SetupPrWorktree → Respond → PushFix | FlagHuman | Fail → Done`), is the batch responder for PRs blocked only on the required `claude-review` check — the batch engine launches it automatically (see "review-blocked" semantics under Batch mode). It can also be run by hand: `node .claude/skills/autodev/fsm.mjs run pr-response --issue <n> --pr <prNumber> --pr-head <headBranch> [--pr-cycle <k>]` — `--pr-cycle` defaults to 1 and only names the throwaway `fix/pr<N>-c<k>` branch; `git branch -f` resets a stale same-name branch to the current PR head, so re-running without it is safe.

- **agent states** run headless claude, constrained by `--tools`, `--allowedTools`, `--max-turns`, `--max-budget-usd`, per-state model, and `fsm-guard.mjs` (bash allow/deny regexes). `--setting-sources project` keeps local/user permission allowlists out of the child.
- **script states** are deterministic driver functions (worktree setup via the `worktree` skill's script, health polling, `gh pr create`, labeling) — zero tokens; they are never budget-gated.
- Budgets (steps, $, wall clock) and the Reviewer→Worker loop limit live in the machine JSON; a breach before an agent state routes to `Fail` (comment, worktree intact) — except a cost breach on the way into Reviewer **after** a green Worker pass, which routes to Submit with a `⚠ Budget landed` PR-body flag and lets CI + claude-review adjudicate instead of failing at 99%.

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

When the run finishes, report: the issue worked, the outcome (PR URL / flagged / failed + why), fix cycles used, total cost, and the run dir. On failure the worktree is left intact — inspect it, then tear down with `./.claude/skills/worktree/worktree.sh rm <branch>` (or let the janitor reclaim it). For batches, `autodevctl report` produces exactly this rollup per issue — see "Reading `report`" below.

## Extending

A new pipeline = a new `machines/<name>.json` + prompt files under `states/` — the driver is machine-agnostic. Per state you declare: `type` (agent/script/terminal), `prompt`/`resumePrompt` (template with `{{ctx}}` vars — `cwd` uses the same `{{…}}` syntax), `tools`, `allowedTools`, `bashAllow`/`bashDeny` regexes, `model`, `fallbackModel` (headless overload fallback), `maxTurns`, `maxBudgetUsd`, `wallMinutes`, `permissionMode`, `cwd`, `required` payload keys per edge, and `transitions`. Script states name a `handler` implemented in `fsm.mjs`.

Note the two-layer Bash contract: `allowedTools` prefix-matches the **whole** command (a piped `gh issue view … | jq` passes on its `gh` prefix), while the guard's `bashAllow`/`bashDeny` judge each **segment** — so filter commands (`head`, `jq`, …) belong in `bashAllow` even when absent from `allowedTools`; they're only reachable as pipe segments. In allowlist states the guard also blocks command substitution (`$(…)`/backticks) outright; in deny-based states substitution bodies are extracted and deny-checked.

## Concurrent runs

Concurrent runs are safe: `worktree.sh create` serializes slot assignment behind an mkdir lock (`.claude/worktrees/.slot.lock` — remove it by hand only if a create crashed while holding it), and each run **claims its issue by self-assigning** right after GetWork (the `ClaimIssue` script state). GetWork excludes assigned issues, so a `taken` claim loops back for a re-pick (≤3 tries). Failure paths (`Fail`, `ApplyFlag`) release the claim; a successful PR keeps the assignee as an ownership signal until merge.

## Batch mode (`batch.mjs` one-shot · `autodevd.mjs` daemon)

To work several issues unattended (e.g. overnight), the batch engine (`batch-core.mjs`) orchestrates fsm.mjs runs with a concurrency cap and a dependency DAG gated on **real merges into the base branch** (dependents fork `origin/<base>`, so a prereq's PR must land first). It has two frontends sharing the same flags, log vocabulary, and `batch.json`:

```bash
# One-shot: runs to all-terminal, then exits (the original form).
node .claude/skills/autodev/batch.mjs 123 124:123 125:124 331 332:331 --cap 3   # issue[:prereq[,prereq]]
# flags: --cap 3 (concurrent runs) --poll 60 (s) --grace 1800 (s to wait for auto-merge) --base staging --state-dir DIR

# Daemon: resident + supervised — survives Claude Code reaping its launcher,
# idles at all-terminal so more work can be added, adopts children on relaunch.
nohup node .claude/skills/autodev/autodevd.mjs 123 124:123 --cap 3 >/dev/null 2>&1 & disown
node .claude/skills/autodev/autodevd.mjs stop          # graceful: stop launching, let running children finish
node .claude/skills/autodev/autodevd.mjs stop --park   # SIGTERM children; they park as retry_wait for the next launch
```

**Prefer the daemon for anything long-running.** Claude Code reaps background task process groups — a reaped one-shot orchestrator used to freeze its runs at `status: "running"` and leak their worktree slots. The daemon model fixes this structurally:

- **fsm children are spawned detached** (own process group, own log fd), so killing/reaping the orchestrator never kills an in-flight (expensive) Claude run.
- **PID file** (`.claude/autodev/autodevd.pid`): a second launch while a daemon is live is refused; a stale pidfile (dead or recycled pid) is reclaimed automatically.
- **Relaunch is the recovery path** — nothing auto-restarts a dead daemon. Re-running the launch command re-attaches to the previous non-terminal batch (recorded in `.claude/autodev/daemon.json`; `--state-dir` overrides) and **adopts** entries whose child pid is still alive instead of re-launching them — zero lost or duplicated runs. Dead children resume their run dir, as before.
- At all-terminal the daemon logs `DONE` + `SUMMARY`, stamps `batch.completedAt`, and idles resident; `autodevctl add` (or relaunching with new issue specs) merges new work into the same batch as `pending`.

Watch the milestone log (`LAUNCH/RESUME/ADOPT/WAIT-MERGE/MERGED/RESPOND/RESPOND-OK/RESPOND-FAIL/RESPOND-PARK/NEEDS-HUMAN/RETRY-WAIT/PARK/SKIP/FAIL/CLEANUP/DRAIN/DONE/SUMMARY`): `tail -f <state-dir>/orchestrator.log`. State dir defaults to `.claude/autodev/overnight/<ts>/`; per-issue child logs live beside `batch.json`.

Semantics worth knowing (both frontends):

- **Success = `run.json.ctx.prUrl` set**, never `status` alone — a graceful Fail/Flag exit is also `status: "completed"` but has no PR, and is marked failed immediately (no merge-grace). Merged runs' worktrees are torn down to free slots; failed runs keep theirs (their commits were already pushed by the driver's fail handler).
- **Exit 75 (rate limit)** → the issue parks in `retry_wait` and is resumed via `fsm.mjs resume` at the `retryAt` the driver parsed from the limit message (≤3 rate-limit retries — a weekly-cap hit never clears, see Known limits). While anything is rate-limit-parked, NEW launches pause: the limit is account-wide.
- **Other crashes** get one `resume` attempt before the issue is marked failed — except during a drain, where a nonzero exit parks as `retry_wait` instead (a `stop --park` SIGTERM must not burn the resume attempt). A failed/skipped prereq transitively skips its dependents.
- **An open PR never terminal-fails — an entry in `waiting_merge` only leaves it by merging or by the PR being CLOSED unmerged.** At grace expiry the merge poll classifies the PR (`classifyPrBlock`, scoped to the batch's `--base`): a `conflict` or `other-red` check flags a human once (`⚠ auto-merge blocked` PR comment + `NEEDS-HUMAN` log) and keeps polling — dependents stay queued and unblock whenever the fixed PR merges (the old terminal-FAIL here declared #381 dead 11 minutes before its PR merged). Closing the PR without merging is the deliberate abandon signal: the entry fails, dependents are skipped, and `autodevctl retry` can relaunch it fresh. A `review-blocked` PR (mergeable, only `claude-review` red — the gate posts CHANGES_REQUESTED on its first pass) spawns a **responder** child (`machines/pr-response.json`, entry status `responding`, occupies a cap slot): it forks a throwaway `fix/pr<N>-c<cycle>` branch off the PR head in its own worktree, triages the findings with the `/pr-response` decline gate, posts the verdict table on the PR, fixes accepted findings test-first, and the driver pushes to the PR head so the review re-runs and auto-merge fires (`RESPOND` → `RESPOND-OK`). Bounded at **2 cycles per PR**; after that (or when the responder declines every finding) the PR is flagged with a `⚠ needs human review-response` comment (`NEEDS-HUMAN`), stays `waiting_merge`, and dependents are **never** skipped — a manual fix still merges and unblocks them. A responder crash burns the cycle but never fails the entry (`RESPOND-FAIL`); a rate-limit park resumes the same cycle (`RESPOND-PARK`), and retry exhaustion burns it (`rateRetries` is reset per cycle — exhaustion must count against the 2-cycle bound, never spin relaunches). An `unknown` classification (transient gh failure, checks still pending, or green + auto-merge just lagging) keeps polling with a neutral `WAIT-MERGE … merge status unclear` log — it is not a review block and never triggers a responder.
- **Restart-idempotent**: single atomic `batch.json`; rerun with the same `--state-dir` to pick a batch back up (`running` entries with a live pid are adopted; with a dead pid, resumed).
- State store is a plain JSON file by design — SQLite deferred until an analytics need is proven (decision 2026-07-02).

Structural changes to the engine are covered by a zero-spend smoke test (`bash .claude/skills/autodev/test/smoke-daemon.sh` — stub fsm/gh/worktree via the `AUTODEV_*` env seams in `batch-core.mjs`/`janitor.mjs`); run it before merging engine changes.

## Heartbeats + janitor (`janitor.mjs`)

Every fsm run writes `pid` + `lastHeartbeat` into `run.json` (30s timer + every transition; atomic tmp+rename), so liveness is observable. `janitor.reconcile()` — run on every batch tick, by SetupWorktree's self-heal, and callable standalone — repairs the two things a reaped run used to leak:

- **Dead runs are finalized**: a non-terminal `run.json` whose pid is gone or whose heartbeat is older than 15 min (`AUTODEV_HEARTBEAT_STALE_MS`; generous because synchronous script states — `docker compose up` — starve the timer) is rewritten to `failed` with a `steps.jsonl` reap line. Its already-ledgered `costUsd` is the harvested spend; whatever the in-flight invocation burned after its last ledger write is unrecoverable. Legacy run.jsons with no pid/heartbeat fields are treated as dead.
- **Leaked slots are freed**: for each `registry.json` branch — worktree dir gone → stale reservation cleared; dir present with a terminal/dead owning run → full `worktree.sh rm`. A branch with a **live or parked owning run, or with no autodev run at all** (manual worktrees — parallel-issues, interactive — share the registry) is never touched. Ownership resolves by `ctx.branch`, newest run dir wins — sound only because the fsm stamps `ctx.branch` **before** `worktree.sh create`, so a relaunch of the same issue owns its (reused) branch name from the moment the worktree exists; stamping after create let the sweep destroy a mid-setup worktree whose branch still resolved to the previous failed run (killed #456/#457 on 2026-07-05).

Parked runs are protected by status: exit-75 tempfails are already `retry-scheduled`, and batch-core stamps drain-parked/interrupted runs to `retry-scheduled` too — a parked run legitimately has no live process and must not be reaped. The batch additionally passes its own non-terminal rundirs as `protect` (a just-resumed child hasn't overwritten the stale pid in `run.json` yet).

SetupWorktree **self-heals** on "no free slots" (reconcile, then retry the create once — a leaked slot no longer bricks a fresh run after burning ConfirmScope spend) and on "no slot recorded" (a wedged half-created worktree from a create/teardown race: `worktree.sh rm` the unregistered dir, then retry once).

## Control channel (`autodevctl.mjs`)

Interact with a live daemon over its Unix socket (`.claude/autodev/autodevd.sock` — NDJSON `{id, verb, args}` → `{id, ok, data|error}`, one request per connection; protocol details in `control.mjs`):

```bash
node .claude/skills/autodev/autodevctl.mjs <verb> [args] [--json]
```

| Verb | Effect |
|---|---|
| `status` | daemon + per-issue state (status, FSM state, cost, PR url); `--json` for the raw snapshot |
| `report [--state-dir DIR]` | per-issue rollup: outcome, cost, fix cycles, active time (see below); `--state-dir` reads the ledger directly with **no daemon** (post-mortem) |
| `logs <issue> [--lines N]` | tail the issue's batch log; prints the run-dir log path for `tail -f` |
| `add <issue[:prereqs]>…` | enqueue into the running DAG (launches next tick, cap/DAG permitting) |
| `pause [issue]` / `resume [issue]` | gate future launches, globally or per-issue — a running child is **not** killed |
| `stop <issue>` | SIGTERM the child's process group, mark failed (`stoppedBy: "ctl"`), tear down its worktree |
| `retry <issue>` | force a failed/skipped/parked issue back into the queue (resumes its run dir when one exists) |
| `reconcile` | run the janitor pass now; returns `{reapedRuns, freedSlots}` |
| `ping` | liveness (`pong pid=… uptime=…`) |
| `shutdown [--park]` | graceful daemon stop over the socket (same drain semantics as `autodevd stop`) |

Exit codes: `0` ok · `1` daemon-side error (bad verb/args, unknown issue) · `2` **daemon not running** — prints the exact relaunch command (recovered from `daemon.json`'s recorded argv) instead of hanging. A stale socket left by a SIGKILL'd daemon is probed and reclaimed on the next launch; graceful shutdown removes it.

Handlers share the daemon's event loop with the tick, so a response can lag a few seconds behind a `spawnSync` gh merge poll — accepted; mutations are still race-free (single thread, synchronous tick body).

### Reading `report`

`report` (`report.mjs`) joins `batch.json` + `run.json` + `steps.jsonl` per issue — no new state store; the plain-JSON ledger stays the source of truth. One row per issue:

```
issue   outcome        cost  cycles  active  detail
#392    pr             $1.57    0      4m    https://github.com/…/pull/413
#446    failed        $11.01    2     38m    reaped: stale heartbeat (janitor)
```

- **outcome** precedence: `pr` (the only real success) → `skipped` (poisoned prereq) → `failed` + `ctx.failure` → `flagged` (graceful FlagIssue: needs-interactive/needs-refinement) → `parked` (retry_wait, will resume) → `in-flight @ State`.
- **cycles** = `loops["Reviewer->Worker"]` (review fix loops used); **cost** = `run.costUsd` (billed failures included; a reaped run's cost is a floor — see Known limits).
- **active** = Σ `steps.jsonl` `durationMs` — deliberately NOT wall-clock: `startedAt` resets on every resume, so wall time across rate-limit parks would lie.

### Driving it as an agent

Answer operational questions with verbs, not jq forensics: "how's the batch doing?" → `status` (or `report` once it's done) · "why did #N fail?" → `report` for the reason, then `logs N` / the row's run dir for depth · "add #N" → `add N[:prereqs]` · "pause/stop things" → `pause` / `stop N` / `shutdown` · "is it even alive?" → `ping`, and on exit 2 relaunch with the printed command (relaunch is the recovery path — nothing auto-restarts the daemon). For a batch whose daemon is gone, `report --state-dir <dir>` still answers the outcome question.

## UI verification

When ConfirmScope marks `uiSurface: true`, the Reviewer gets a Playwright MCP server (declared per-state via `mcpConfig` → `--mcp-config --strict-mcp-config`) and, **after** its unit-test/lint runs, verifies the UI in two passes. First it runs the full deterministic e2e suite (`docker compose --profile e2e run --rm e2e`), whose `global-setup.ts` idempotently re-seeds the personas (Smoke Fighter L1 + Wizard L5) — so the Reviewer no longer hand-rolls a test character via curl, and the suite result lands as `e2eSuite` in the approve payload. Then an exploratory Playwright-MCP pass exercises **only** the surface the issue changed (login, click the changed flow, console check, screenshot to `/tmp`) — it does not re-verify flows the suite already covers. The PR body reports the outcome (`UI: visually verified` vs an explicit ⚠ when verification failed).

> Ordering is load-bearing (learned from run `…issue-322`): `auth.test.ts`'s fixture cleanup deletes the `dev-user-local` User, cascading away its characters — which is why the e2e suite (re-seeding personas via `global-setup.ts`) runs after the last backend-suite run, never before.

> Gotcha (verified empirically): `--tools` restricts the built-in toolset and **also strips MCP tools** — a state that needs an MCP server must omit `tools` and rely on `allowedTools` (headless mode auto-denies everything unlisted, so the wall holds).

## Known limits

- The Reviewer verifies UI against the e2e suite's seeded personas (Smoke Fighter L1, Wizard L5), not production-like data — surfaces gated on higher levels/other classes/inventory may need a human pass.
- The issue claim is check-then-assign (GitHub has no atomic claim); a sub-second tie between two runs can double-claim. The slot lock still prevents any port collision in that case.
- A run failed by the janitor or batch keeps `run.json` as the source of truth, but a reaped child's **post-last-ledger spend is invisible** — the claude invocation's cost report died with its stdout. Treat reaped runs' `costUsd` as a floor.
- The subscription's **weekly** compute cap has no parseable in-band reset signal — hitting it looks like a rate_limit tempfail (exit 75) that never clears on resume. An orchestrator's rate-limit retry cap bounds the damage; if resumes keep tempfailing, check `/usage` manually.
