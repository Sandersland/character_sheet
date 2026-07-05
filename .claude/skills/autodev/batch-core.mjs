/**
 * autodev batch engine — the state + control-loop core shared by the one-shot
 * orchestrator (batch.mjs) and the resident daemon (autodevd.mjs).
 *
 * Owns batch.json (single atomic file, restart-idempotent), fsm.mjs child
 * processes, and the per-tick phases: pollMerges → propagateSkips →
 * pollAdopted → launchRetries → launchEligible.
 *
 * Children are spawned DETACHED (own process group, stdio to a log fd), so a
 * reaped/killed orchestrator no longer takes expensive in-flight Claude runs
 * down with it. The flip side is adoption: on restart, entries still
 * `running` with a live pid are kept and watched via run.json + pid liveness
 * (pollAdopted) instead of being blindly parked — blind parking would resume
 * a run dir whose original child is still alive (double-run).
 *
 * Per-issue lifecycle (see batch.mjs header for the CLI view):
 *   pending → running → waiting_merge → merged            (terminal, success)
 *                     ↘ retry_wait (fsm exit 75) → running
 *                     ↘ failed                             (terminal)
 *   pending → skipped (a prereq failed/skipped)            (terminal)
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile as janitorReconcile } from "./janitor.mjs";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
// Env seams for structural tests (stub FSM, isolated runs dir, no git/gh/worktree side effects).
const FSM = process.env.AUTODEV_FSM_BIN ?? join(SKILL_DIR, "fsm.mjs");
const RUNS_DIR = process.env.AUTODEV_RUNS_DIR ?? join(ROOT, ".claude", "autodev", "runs");
const GH = process.env.AUTODEV_GH_BIN ?? "gh";
const WORKTREE = process.env.AUTODEV_WORKTREE_BIN ?? join(SKILL_DIR, "..", "worktree", "worktree.sh");
const SKIP_GIT_SYNC = !!process.env.AUTODEV_SKIP_GIT_SYNC;

const MAX_RATE_RETRIES = 3; // bounds a weekly-cap tempfail that never clears

// ---------- issue-spec parsing (shared by batch.mjs and autodevd.mjs) ----------

/** Parse `issue[:prereq[,prereq]]` args; returns [{issue, prereqs}] or throws. */
export function parseIssueSpecs(args) {
  const issues = [];
  for (const a of args) {
    if (!/^\d+(:\d+(,\d+)*)?$/.test(a)) throw new Error(`bad issue spec '${a}' (want issue[:prereq[,prereq]])`);
    const [issue, deps] = a.split(":");
    issues.push({ issue: Number(issue), prereqs: deps ? deps.split(",").map(Number) : [] });
  }
  return issues;
}

/** Every prereq must be a member of `known` (a Set of issue numbers). */
export function validatePrereqs(issues, known) {
  for (const { issue, prereqs } of issues) {
    for (const p of prereqs) {
      if (!known.has(p)) throw new Error(`issue #${issue} depends on #${p}, which is not in the batch`);
    }
  }
}

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function createEngine({ stateDir, cfg = null }) {
  mkdirSync(stateDir, { recursive: true });
  const LOG_FILE = join(stateDir, "orchestrator.log");
  const statePath = join(stateDir, "batch.json");

  let batch; // { base, cap, grace, order, completedAt?, issues: { [n]: {prereqs, status, pid, rundir, retryAt, rateRetries, resumed, doneAt} } }
  const children = new Map(); // issue -> ChildProcess (this process's own spawns only)
  let draining = null; // null | "wait" | "park"
  let wakeFn = () => {}; // daemon's sleep-interrupt; fired when a drain may have completed

  function saveBatch() {
    const tmp = join(stateDir, "batch.json.tmp");
    writeFileSync(tmp, JSON.stringify(batch, null, 2));
    renameSync(tmp, statePath);
  }

  function log(msg) {
    const line = `${new Date().toISOString()} | ${msg}`;
    console.log(line);
    appendFileSync(LOG_FILE, line + "\n");
  }

  // ---------- helpers ----------

  function sh(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts });
  }

  // Make ROOT reflect the tip of origin/<base> before launching a node. ConfirmScope
  // runs in ROOT (before SetupWorktree) and verifies the issue's code refs against the
  // working tree — so a dependent launched seconds after its prereq's PR merged would
  // otherwise read a stale checkout and false-flag "prereq code absent from <base>"
  // (bit #398 + #425). Fetch + fast-forward; best-effort (SetupWorktree re-fetches for
  // the actual fork, so a failure here only risks the ConfirmScope read, never the build).
  function refreshBase() {
    if (SKIP_GIT_SYNC) return;
    const base = batch.base;
    const f = sh("git", ["fetch", "origin", base]);
    if (f.status !== 0) return log(`BASE-SYNC fetch failed (non-fatal): ${(f.stderr || "").trim().slice(0, 120)}`);
    const co = sh("git", ["checkout", base]);
    if (co.status !== 0) return log(`BASE-SYNC checkout ${base} failed (non-fatal): ${(co.stderr || "").trim().slice(0, 120)}`);
    const ff = sh("git", ["merge", "--ff-only", `origin/${base}`]);
    const sha = (sh("git", ["rev-parse", "--short", "HEAD"]).stdout || "").trim();
    log(
      ff.status === 0
        ? `BASE-SYNC ${base}@${sha} (fast-forwarded to origin/${base})`
        : `BASE-SYNC ${base}@${sha} ff-only failed (non-fatal): ${(ff.stderr || "").trim().slice(0, 120)}`,
    );
  }

  // A PR titled "... (#N)" merged into base? Client-side re-check kills the
  // (#123)-vs-(#1234) substring false positive in GitHub's search.
  function isMerged(n, base) {
    const res = sh(GH, ["pr", "list", "--state", "merged", "--base", base, "--search", `(#${n}) in:title`, "--json", "title"]);
    if (res.status !== 0) return false; // transient gh failure → re-check next tick
    try {
      return JSON.parse(res.stdout).some((pr) => pr.title.includes(`(#${n})`));
    } catch {
      return false;
    }
  }

  // Why the open PR for issue #n isn't merging. The required `claude-review`
  // gate posts CHANGES_REQUESTED on its first pass, so a perfectly good PR sits
  // BLOCKED with all CI green — that's recoverable via /pr-response and must NOT
  // be treated like a real conflict/failure (which would wrongly skip dependents).
  //   "review-blocked" — mergeable, only claude-review is red → keep waiting
  //   "conflict"       — CONFLICTING → real, fail
  //   "other-red"      — a non-review required check failed → real, fail
  //   "unknown"        — transient gh failure, checks still running, or green +
  //                      auto-merge just lagging → conservatively keep waiting
  const RED = (c) => c.status === "COMPLETED" && !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(c.conclusion);
  function classifyPrBlock(n, base) {
    // --base scopes the open lookup to this batch's target branch, mirroring
    // isMerged — else a stray open PR for #n against another branch could be
    // classified instead of ours (the .title.includes guard only dedups substrings).
    const res = sh(GH, ["pr", "list", "--state", "open", "--base", base, "--search", `(#${n}) in:title`, "--json", "number,mergeable,statusCheckRollup,title"]);
    if (res.status !== 0) return "unknown";
    let pr;
    try {
      pr = JSON.parse(res.stdout).find((p) => p.title.includes(`(#${n})`));
    } catch {
      return "unknown";
    }
    if (!pr) return "unknown";
    if (pr.mergeable === "CONFLICTING") return "conflict";
    const checks = pr.statusCheckRollup ?? [];
    const name = (c) => c.name ?? c.context;
    if (checks.some((c) => name(c) !== "claude-review" && RED(c))) return "other-red";
    const review = checks.find((c) => name(c) === "claude-review");
    if (review && RED(review)) return "review-blocked";
    return "unknown";
  }

  function readRunJson(entry) {
    try {
      return JSON.parse(readFileSync(join(entry.rundir, "run.json"), "utf8"));
    } catch {
      return null;
    }
  }

  // Stamp a parked entry's run.json to "retry-scheduled" so the janitor
  // classifies it as parked (protected), not as a dead orphan — a SIGTERM'd
  // or crashed child leaves status "running" with a dead pid, which is
  // otherwise indistinguishable from a reaped run.
  function stampRunParked(n, entry) {
    if (!entry.rundir) return;
    const run = readRunJson(entry);
    if (!run || ["completed", "failed", "retry-scheduled"].includes(run.status)) return;
    run.status = "retry-scheduled";
    run.retryable = true;
    run.retryAt = run.retryAt ?? Date.now();
    try {
      const tmp = join(entry.rundir, "run.json.tmp");
      writeFileSync(tmp, JSON.stringify(run, null, 2));
      renameSync(tmp, join(entry.rundir, "run.json"));
    } catch (err) {
      log(`PARK #${n} could not stamp run.json (${err.message}) — janitor may reap it`);
    }
  }

  function teardownWorktree(n, entry) {
    const run = readRunJson(entry);
    const branch = run?.ctx?.branch;
    if (!branch) return log(`CLEANUP #${n} skipped (no branch in run.json)`);
    const res = sh(WORKTREE, ["rm", branch]);
    log(res.status === 0 ? `CLEANUP #${n} (${branch}) worktree torn down, slot freed` : `CLEANUP #${n} (${branch}) teardown FAILED (non-fatal)`);
  }

  function runningCount() {
    return Object.values(batch.issues).filter((e) => e.status === "running").length;
  }

  function rateLimitPause() {
    return Object.values(batch.issues).some((e) => e.status === "retry_wait");
  }

  function latestRunDir(n) {
    const res = sh("bash", ["-c", `ls -dt "${RUNS_DIR}"/*-issue-${n} 2>/dev/null | head -1`]);
    return res.stdout?.trim() || null;
  }

  // ---------- child process management ----------

  function launch(n, { resumeDir } = {}) {
    const entry = batch.issues[n];
    // Fresh-base guarantee for a new run (a resume already has its worktree).
    if (!resumeDir) refreshBase();
    const args = resumeDir ? [FSM, "resume", resumeDir] : [FSM, "run", "issue-pipeline", "--issue", String(n), "--integration", batch.base];
    const logPath = join(stateDir, `issue-${n}.log`);
    // Detached + fd stdio: the child owns its process group and its log fd, so
    // it survives this orchestrator being killed/reaped. No unref() — while we
    // ARE alive we want the close event for onChildExit.
    const out = openSync(logPath, "a");
    const child = spawn("node", args, { cwd: ROOT, detached: true, stdio: ["ignore", out, out], env: process.env });
    closeSync(out);
    entry.status = "running";
    entry.pid = child.pid;
    children.set(n, child);
    child.on("close", (code) => {
      children.delete(n);
      onChildExit(n, code ?? 1);
    });
    log(`${resumeDir ? "RESUME" : "LAUNCH"} #${n} (running ${runningCount()}/${batch.cap}) -> ${logPath}`);
    saveBatch();
  }

  function onChildExit(n, code) {
    const entry = batch.issues[n];
    entry.rundir = entry.rundir ?? latestRunDir(n);
    const run = readRunJson(entry);

    if (entry.stopping) {
      // Killed via the control channel: terminal, no resume attempt, and the
      // worktree goes too (`stop` means "abandon this run").
      delete entry.stopping;
      entry.status = "failed";
      entry.stoppedBy = "ctl";
      teardownWorktree(n, entry);
      log(`STOP #${n} killed via control channel (rc=${code}); worktree torn down`);
    } else if (code === 75) {
      // fsm tempfail contract: rate-limited, claim + worktree intact, resume at retryAt.
      entry.rateRetries = (entry.rateRetries ?? 0) + 1;
      if (entry.rateRetries > MAX_RATE_RETRIES) {
        entry.status = "failed";
        log(`FAIL #${n} rate-limit retries exhausted (${MAX_RATE_RETRIES}) — likely the weekly cap; check /usage`);
      } else {
        entry.retryAt = run?.retryAt ?? Date.now() + 62 * 60_000;
        entry.status = "retry_wait";
        log(`RETRY-WAIT #${n} rate-limited (attempt ${entry.rateRetries}/${MAX_RATE_RETRIES}) — resume at ${new Date(entry.retryAt).toISOString()}`);
      }
    } else if (code === 0 && run?.ctx?.prUrl) {
      // Real success: PR is armed on GitHub, safe to reclaim the local slot now.
      teardownWorktree(n, entry);
      entry.status = "waiting_merge";
      entry.doneAt = Date.now();
      log(`WAIT-MERGE #${n} (${run.ctx.prUrl}) polling for auto-merge`);
    } else if (code === 0) {
      // Graceful Fail/Flag exit — status "completed" but no PR. Terminal, no grace.
      entry.status = "failed";
      log(`FAIL #${n} run completed WITHOUT a PR (${run?.ctx?.failure ?? "flagged or failed gracefully"}); worktree kept`);
    } else if (draining) {
      // Drained mid-flight (stop --park SIGTERMed it, or it crashed while we
      // were shutting down): park for the next daemon launch, don't burn the
      // one-resume-attempt on our own signal.
      if (entry.rundir) {
        entry.status = "retry_wait";
        entry.retryAt = Date.now();
        stampRunParked(n, entry);
        log(`PARK #${n} rc=${code} during drain — will resume ${entry.rundir} on next launch`);
      } else {
        entry.status = "pending";
        log(`PARK #${n} rc=${code} during drain, no run dir — back to pending`);
      }
    } else if (!entry.resumed) {
      // One generic resume for driver/script crashes (fsm already retried agent blips).
      entry.resumed = true;
      if (entry.rundir) {
        log(`CRASH #${n} rc=${code} — one resume attempt`);
        launch(n, { resumeDir: entry.rundir });
        return; // launch() saved state
      }
      entry.status = "failed";
      log(`FAIL #${n} rc=${code} with no run dir to resume; worktree kept`);
    } else {
      entry.status = "failed";
      log(`FAIL #${n} rc=${code} after resume attempt (${run?.ctx?.failure ?? "unknown"}); worktree kept`);
    }
    saveBatch();
    // A draining daemon is asleep between ticks — wake it so the last child's
    // exit ends the drain immediately instead of after up to a full poll.
    if (draining) wakeFn();
  }

  // ---------- control loop phases ----------

  function pollMerges() {
    for (const [n, entry] of Object.entries(batch.issues)) {
      if (entry.status !== "waiting_merge") continue;
      if (isMerged(n, batch.base)) {
        entry.status = "merged";
        log(`MERGED #${n} (PR landed on ${batch.base})`);
      } else if (Date.now() - entry.doneAt >= batch.grace * 1000) {
        const cls = classifyPrBlock(n, batch.base);
        if (cls === "conflict" || cls === "other-red") {
          entry.status = "failed";
          log(`FAIL #${n} auto-merge did not fire within ${batch.grace}s (${cls}); dependents will be skipped`);
        } else {
          // review-blocked or unknown: recoverable/transient. Keep polling for the
          // merge instead of failing — do NOT skip dependents. Reset the grace
          // window so we re-check periodically without hammering gh. Split the log
          // by classification: only review-blocked warrants a /pr-response prompt;
          // unknown (transient gh failure, checks pending, or green + auto-merge
          // just lagging) is neutral and must not send an operator chasing a
          // non-issue. reviewBlockedLogged stays a once-guard across both.
          if (!entry.reviewBlockedLogged) {
            if (cls === "review-blocked") {
              log(`NEEDS-REVIEW-RESPONSE #${n} blocked on claude-review (all CI green) — run /pr-response to unblock; keeping open`);
            } else {
              log(`WAIT-MERGE #${n} merge status unclear (${cls}); re-checking after grace — no action needed`);
            }
            entry.reviewBlockedLogged = true;
          }
          entry.doneAt = Date.now();
        }
      }
    }
  }

  function propagateSkips() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [n, entry] of Object.entries(batch.issues)) {
        if (entry.status !== "pending") continue;
        const poisoned = entry.prereqs.some((p) => ["failed", "skipped"].includes(batch.issues[p]?.status));
        if (poisoned) {
          entry.status = "skipped";
          log(`SKIP #${n} (prereq failed/skipped: ${entry.prereqs.join(",")})`);
          changed = true;
        }
      }
    }
  }

  // Watch `running` entries whose child handle we DON'T own — detached children
  // adopted after a daemon restart. Their exit can't fire a close event here,
  // so their run.json + pid are the truth: a terminal run.json is synthesized
  // into the matching onChildExit outcome; a dead pid with a non-terminal
  // run.json is a crash.
  function pollAdopted() {
    for (const [n, entry] of Object.entries(batch.issues)) {
      if (entry.status !== "running" || children.has(Number(n))) continue;
      entry.rundir = entry.rundir ?? latestRunDir(Number(n));
      const run = readRunJson(entry);
      if (run?.status === "completed") {
        log(`ADOPT #${n} finished while unwatched (completed)`);
        onChildExit(Number(n), 0);
      } else if (run?.status === "retry-scheduled") {
        log(`ADOPT #${n} finished while unwatched (rate-limited)`);
        onChildExit(Number(n), 75);
      } else if (run?.status === "failed") {
        // fsm already ran its Fail handler and finalized the run — don't burn
        // the one-resume-attempt re-driving a completed failure.
        entry.status = "failed";
        log(`ADOPT #${n} finished while unwatched (failed: ${run?.ctx?.failure ?? "unknown"}); worktree kept`);
        saveBatch();
      } else if (!pidAlive(entry.pid)) {
        log(`ADOPT #${n} child pid ${entry.pid ?? "?"} is gone with run.json non-terminal — crash path`);
        onChildExit(Number(n), 1);
      }
      // else: still running under a live pid — leave it alone.
    }
  }

  function launchRetries() {
    if (draining || batch.paused) return;
    for (const [n, entry] of Object.entries(batch.issues)) {
      if (entry.paused) continue;
      if (entry.status !== "retry_wait" || Date.now() < entry.retryAt) continue;
      if (runningCount() >= batch.cap) return;
      launch(Number(n), { resumeDir: entry.rundir });
    }
  }

  function launchEligible() {
    if (draining || batch.paused) return;
    if (rateLimitPause()) return; // account-wide limit: don't pile on new sessions
    for (const { issue } of batch.order) {
      if (runningCount() >= batch.cap) return;
      const entry = batch.issues[issue];
      if (entry.paused) continue;
      if (entry.status !== "pending") continue;
      if (!entry.prereqs.every((p) => batch.issues[p].status === "merged")) continue;
      launch(issue);
    }
  }

  // Janitor pass: reap dead orphan runs + free leaked worktree slots. Runs
  // AFTER pollAdopted (adoption settles this batch's own entries first) and
  // additionally protects our non-terminal rundirs — a just-resumed child may
  // not have overwritten run.json's stale pid yet.
  function runJanitor() {
    const protect = Object.values(batch.issues)
      .filter((e) => ["running", "retry_wait"].includes(e.status) && e.rundir)
      .map((e) => e.rundir);
    try {
      return janitorReconcile({ log, protect });
    } catch (err) {
      log(`JANITOR pass failed (non-fatal): ${err.message}`);
      return { reapedRuns: [], freedSlots: [] };
    }
  }

  function tick() {
    pollMerges();
    propagateSkips();
    pollAdopted();
    runJanitor();
    launchRetries();
    launchEligible();
    saveBatch();
  }

  function allTerminal() {
    return Object.values(batch.issues).every((e) => ["merged", "failed", "skipped"].includes(e.status));
  }

  function summary() {
    log("SUMMARY ---------------------------------------------");
    for (const { issue } of batch.order) log(`  #${issue} -> ${batch.issues[issue].status}`);
    log("SUMMARY ---------------------------------------------");
  }

  // ---------- lifecycle ----------

  function loadOrInit() {
    if (existsSync(statePath)) {
      batch = JSON.parse(readFileSync(statePath, "utf8"));
      // Reconcile anything "running" from the previous orchestrator process.
      // Children are detached, so a live pid means the run SURVIVED — keep it
      // running and let pollAdopted watch it (parking it would double-run the
      // run dir once the surviving child and a resume both write to it).
      // A dead pid gets the old treatment: resume the interrupted run dir
      // (a killed run usually left its issue self-assigned, so a fresh
      // `fsm run` would bounce ClaimIssue→taken→GetWork and grab an
      // unrelated issue — resume, never relaunch).
      for (const [n, entry] of Object.entries(batch.issues)) {
        if (entry.status !== "running") continue;
        if (pidAlive(entry.pid)) {
          log(`RECONCILE #${n} still running (pid ${entry.pid} alive) — adopting`);
          continue;
        }
        entry.rundir = entry.rundir ?? latestRunDir(Number(n));
        if (entry.rundir) {
          entry.status = "retry_wait";
          entry.retryAt = Date.now();
          stampRunParked(n, entry);
          log(`RECONCILE #${n} was running at shutdown — will resume ${entry.rundir}`);
        } else {
          entry.status = "pending";
          log(`RECONCILE #${n} was running at shutdown, no run dir — back to pending`);
        }
      }
      log(`RESTART batch from ${statePath}`);
      if (cfg?.issues?.length) addIssues(cfg.issues);
    } else {
      if (!cfg?.issues?.length) throw new Error(`no batch.json at ${statePath} and no issues given`);
      batch = {
        base: cfg.base,
        cap: cfg.cap,
        grace: cfg.grace,
        order: cfg.issues,
        issues: Object.fromEntries(
          cfg.issues.map(({ issue, prereqs }) => [issue, { prereqs, status: "pending", rateRetries: 0, resumed: false }]),
        ),
      };
      validatePrereqs(cfg.issues, new Set(cfg.issues.map((i) => i.issue)));
      // Pre-merged prereqs (earlier batch, manual PR) unblock dependents immediately.
      for (const [n, entry] of Object.entries(batch.issues)) {
        if (isMerged(n, batch.base)) {
          entry.status = "merged";
          log(`MERGED #${n} (pre-existing; detected at startup)`);
        }
      }
    }
    saveBatch();
  }

  /** Merge new issue specs into a loaded batch as pending entries (daemon `add`). */
  function addIssues(specs) {
    const fresh = specs.filter(({ issue }) => {
      if (batch.issues[issue]) {
        log(`ADD #${issue} skipped (already in batch: ${batch.issues[issue].status})`);
        return false;
      }
      return true;
    });
    if (!fresh.length) return;
    const known = new Set([...Object.keys(batch.issues).map(Number), ...fresh.map((i) => i.issue)]);
    validatePrereqs(fresh, known);
    for (const { issue, prereqs } of fresh) {
      batch.order.push({ issue, prereqs });
      batch.issues[issue] = { prereqs, status: "pending", rateRetries: 0, resumed: false };
      if (isMerged(issue, batch.base)) {
        batch.issues[issue].status = "merged";
        log(`MERGED #${issue} (pre-existing; detected at add)`);
      } else {
        log(`ADD #${issue} pending (prereqs: ${prereqs.join(",") || "none"})`);
      }
    }
    delete batch.completedAt; // batch has live work again
    saveBatch();
  }

  // ---------- control-channel operations ----------

  /** Full machine-readable state for `autodevctl status`. */
  function statusSnapshot() {
    const issues = {};
    for (const { issue } of batch.order) {
      const e = batch.issues[issue];
      const run = e.rundir ? readRunJson(e) : null;
      issues[issue] = {
        // Surface an in-flight stop: entry.status stays "running" until the
        // SIGTERM'd child actually exits, but the user should see it took.
        status: e.stopping ? "stopping" : e.status,
        paused: e.paused ?? false,
        prereqs: e.prereqs,
        pid: e.pid ?? null,
        retryAt: e.retryAt ?? null,
        rateRetries: e.rateRetries ?? 0,
        stoppedBy: e.stoppedBy ?? null,
        rundir: e.rundir ?? null,
        prUrl: run?.ctx?.prUrl ?? null,
        currentState: run?.currentState ?? null,
        costUsd: run?.costUsd ?? null,
        failure: run?.ctx?.failure ?? null,
      };
    }
    return {
      base: batch.base,
      cap: batch.cap,
      paused: batch.paused ?? false,
      completedAt: batch.completedAt ?? null,
      draining,
      order: batch.order.map((o) => o.issue),
      issues,
    };
  }

  /** Pause launches — global (no issue) or per-issue. Running children are not touched. */
  function pause(issue) {
    if (issue == null) batch.paused = true;
    else if (batch.issues[issue]) batch.issues[issue].paused = true;
    else throw new Error(`issue #${issue} is not in the batch`);
    log(`PAUSE ${issue == null ? "batch" : `#${issue}`} (via control channel)`);
    saveBatch();
  }

  function resumeWork(issue) {
    if (issue == null) delete batch.paused;
    else if (batch.issues[issue]) delete batch.issues[issue].paused;
    else throw new Error(`issue #${issue} is not in the batch`);
    log(`RESUME-WORK ${issue == null ? "batch" : `#${issue}`} (via control channel)`);
    saveBatch();
  }

  /** Kill a running child (pgroup) and mark its issue failed; worktree torn down in onChildExit. */
  function stopIssue(issue) {
    const entry = batch.issues[issue];
    if (!entry) throw new Error(`issue #${issue} is not in the batch`);
    if (entry.status !== "running") throw new Error(`issue #${issue} is ${entry.status}, not running`);
    entry.stopping = true;
    saveBatch();
    try {
      process.kill(-entry.pid, "SIGTERM");
    } catch {
      try {
        process.kill(entry.pid, "SIGTERM");
      } catch {
        /* already gone — pollAdopted routes it through the stopping branch */
      }
    }
    log(`STOP #${issue} SIGTERM sent (pid ${entry.pid})`);
  }

  /** Force a parked/failed/skipped issue back into the launch queue. */
  function retryIssue(issue) {
    const entry = batch.issues[issue];
    if (!entry) throw new Error(`issue #${issue} is not in the batch`);
    if (!["failed", "skipped", "retry_wait"].includes(entry.status)) {
      throw new Error(`issue #${issue} is ${entry.status} — retry applies to failed/skipped/retry_wait`);
    }
    entry.rundir = entry.rundir ?? latestRunDir(Number(issue));
    entry.status = entry.rundir ? "retry_wait" : "pending";
    entry.retryAt = Date.now();
    entry.resumed = false;
    entry.rateRetries = 0;
    delete entry.stoppedBy;
    delete entry.stopping; // hygiene — unreachable today (stopping implies running), cheap insurance if the guard relaxes
    delete batch.completedAt; // live work again
    log(`RETRY #${issue} forced (${entry.rundir ? `will resume ${entry.rundir}` : "no run dir — fresh launch"})`);
    saveBatch();
  }

  /**
   * Stop accepting/launching work. mode "wait": let running children finish.
   * mode "park": SIGTERM every running child's process group so onChildExit /
   * pollAdopted parks them as retry_wait for the next launch.
   */
  function drain(mode) {
    if (draining === "park") return; // already at max escalation
    draining = mode;
    log(`DRAIN ${mode} (${runningCount()} running)`);
    if (mode !== "park") return;
    for (const [n, entry] of Object.entries(batch.issues)) {
      if (entry.status !== "running" || !entry.pid) continue;
      try {
        process.kill(-entry.pid, "SIGTERM"); // detached child = pgroup leader
      } catch {
        try {
          process.kill(entry.pid, "SIGTERM"); // pre-detach child from an old batch
        } catch {
          /* already gone — pollAdopted will reconcile */
        }
      }
      log(`DRAIN sent SIGTERM to #${n} (pid ${entry.pid})`);
    }
  }

  return {
    stateDir,
    get batch() {
      return batch;
    },
    get draining() {
      return draining;
    },
    setWake(fn) {
      wakeFn = fn;
    },
    log,
    saveBatch,
    loadOrInit,
    addIssues,
    tick,
    runJanitor,
    statusSnapshot,
    pause,
    resumeWork,
    stopIssue,
    retryIssue,
    drain,
    allTerminal,
    runningCount,
    summary,
  };
}
