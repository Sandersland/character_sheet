#!/usr/bin/env node
/**
 * autodev batch orchestrator — run several issues through fsm.mjs with a
 * concurrency cap, a dependency DAG gated on real staging merges, rate-limit
 * rescheduling (fsm exit 75), and worktree cleanup.
 *
 * Usage:
 *   node batch.mjs 123 124:123 125:124 [--cap 3] [--poll 60] [--grace 1800]
 *                  [--base staging] [--state-dir DIR]
 *
 * Each arg is `issue[:prereq[,prereq]]` — a prereq must have its PR MERGED
 * into --base before the dependent launches (dependents fork origin/<base>).
 *
 * Per-issue lifecycle (single atomic batch.json, restart-idempotent — rerun
 * with the same --state-dir to resume a batch):
 *   pending → running → waiting_merge → merged            (terminal, success)
 *                     ↘ retry_wait (fsm exit 75) → running
 *                     ↘ failed                             (terminal)
 *   pending → skipped (a prereq failed/skipped)            (terminal)
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
// Both overridable for structural tests (stub FSM + isolated runs dir).
const FSM = process.env.AUTODEV_FSM_BIN ?? join(SKILL_DIR, "fsm.mjs");
const RUNS_DIR = process.env.AUTODEV_RUNS_DIR ?? join(ROOT, ".claude", "autodev", "runs");

const MAX_RATE_RETRIES = 3; // bounds a weekly-cap tempfail that never clears

// ---------- CLI ----------

function parseArgs(argv) {
  const cfg = { cap: 3, poll: 60, grace: 1800, base: "staging", stateDir: null, issues: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cap") cfg.cap = Number(argv[++i]);
    else if (a === "--poll") cfg.poll = Number(argv[++i]);
    else if (a === "--grace") cfg.grace = Number(argv[++i]);
    else if (a === "--base") cfg.base = argv[++i];
    else if (a === "--state-dir") cfg.stateDir = argv[++i];
    else if (/^\d+(:\d+(,\d+)*)?$/.test(a)) {
      const [issue, deps] = a.split(":");
      cfg.issues.push({ issue: Number(issue), prereqs: deps ? deps.split(",").map(Number) : [] });
    } else {
      console.error(`batch: unknown arg '${a}'`);
      process.exit(1);
    }
  }
  if (!cfg.issues.length) {
    console.error("usage: batch.mjs <issue[:prereq[,prereq]]> ... [--cap N] [--poll S] [--grace S] [--base BR] [--state-dir DIR]");
    process.exit(1);
  }
  const known = new Set(cfg.issues.map((i) => i.issue));
  for (const { issue, prereqs } of cfg.issues) {
    for (const p of prereqs) {
      if (!known.has(p)) {
        console.error(`batch: issue #${issue} depends on #${p}, which is not in the batch`);
        process.exit(1);
      }
    }
  }
  return cfg;
}

// ---------- state (single atomic JSON file) ----------

let STATE_DIR;
let LOG_FILE;
let batch; // { base, issues: { [n]: {prereqs, status, pid, rundir, retryAt, rateRetries, resumed, doneAt} } }

function saveBatch() {
  const tmp = join(STATE_DIR, "batch.json.tmp");
  writeFileSync(tmp, JSON.stringify(batch, null, 2));
  renameSync(tmp, join(STATE_DIR, "batch.json"));
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
  const res = sh("gh", ["pr", "list", "--state", "merged", "--base", base, "--search", `(#${n}) in:title`, "--json", "title"]);
  if (res.status !== 0) return false; // transient gh failure → re-check next tick
  try {
    return JSON.parse(res.stdout).some((pr) => pr.title.includes(`(#${n})`));
  } catch {
    return false;
  }
}

function readRunJson(entry) {
  try {
    return JSON.parse(readFileSync(join(entry.rundir, "run.json"), "utf8"));
  } catch {
    return null;
  }
}

function teardownWorktree(n, entry) {
  const run = readRunJson(entry);
  const branch = run?.ctx?.branch;
  if (!branch) return log(`CLEANUP #${n} skipped (no branch in run.json)`);
  const res = sh("bash", [join(SKILL_DIR, "..", "worktree", "worktree.sh"), "rm", branch]);
  log(res.status === 0 ? `CLEANUP #${n} (${branch}) worktree torn down, slot freed` : `CLEANUP #${n} (${branch}) teardown FAILED (non-fatal)`);
}

function runningCount() {
  return Object.values(batch.issues).filter((e) => e.status === "running").length;
}

function rateLimitPause() {
  return Object.values(batch.issues).some((e) => e.status === "retry_wait");
}

// ---------- child process management ----------

const children = new Map(); // issue -> ChildProcess

function launch(n, { resumeDir } = {}) {
  const entry = batch.issues[n];
  // Fresh-base guarantee for a new run (a resume already has its worktree).
  if (!resumeDir) refreshBase();
  const args = resumeDir ? [FSM, "resume", resumeDir] : [FSM, "run", "issue-pipeline", "--issue", String(n), "--integration", batch.base];
  const logPath = join(STATE_DIR, `issue-${n}.log`);
  const child = spawn("node", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const sink = (d) => appendFileSync(logPath, d);
  child.stdout.on("data", sink);
  child.stderr.on("data", sink);
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

function latestRunDir(n) {
  const res = sh("bash", ["-c", `ls -dt "${RUNS_DIR}"/*-issue-${n} 2>/dev/null | head -1`]);
  return res.stdout?.trim() || null;
}

function onChildExit(n, code) {
  const entry = batch.issues[n];
  entry.rundir = entry.rundir ?? latestRunDir(n);
  const run = readRunJson(entry);

  if (code === 75) {
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
}

// ---------- control loop phases ----------

function pollMerges() {
  for (const [n, entry] of Object.entries(batch.issues)) {
    if (entry.status !== "waiting_merge") continue;
    if (isMerged(n, batch.base)) {
      entry.status = "merged";
      log(`MERGED #${n} (PR landed on ${batch.base})`);
    } else if (Date.now() - entry.doneAt >= batch.grace * 1000) {
      entry.status = "failed";
      log(`FAIL #${n} auto-merge did not fire within ${batch.grace}s (checks red or conflict); dependents will be skipped`);
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

function launchRetries() {
  for (const [n, entry] of Object.entries(batch.issues)) {
    if (entry.status !== "retry_wait" || Date.now() < entry.retryAt) continue;
    if (runningCount() >= batch.cap) return;
    launch(Number(n), { resumeDir: entry.rundir });
  }
}

function launchEligible() {
  if (rateLimitPause()) return; // account-wide limit: don't pile on new sessions
  for (const { issue } of batch.order) {
    if (runningCount() >= batch.cap) return;
    const entry = batch.issues[issue];
    if (entry.status !== "pending") continue;
    if (!entry.prereqs.every((p) => batch.issues[p].status === "merged")) continue;
    launch(issue);
  }
}

function allTerminal() {
  return Object.values(batch.issues).every((e) => ["merged", "failed", "skipped"].includes(e.status));
}

function summary() {
  log("SUMMARY ---------------------------------------------");
  for (const { issue } of batch.order) log(`  #${issue} -> ${batch.issues[issue].status}`);
  log("SUMMARY ---------------------------------------------");
}

// ---------- main ----------

const cfg = parseArgs(process.argv.slice(2));
STATE_DIR = cfg.stateDir ?? join(ROOT, ".claude", "autodev", "overnight", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(STATE_DIR, { recursive: true });
LOG_FILE = join(STATE_DIR, "orchestrator.log");

const statePath = join(STATE_DIR, "batch.json");
if (existsSync(statePath)) {
  batch = JSON.parse(readFileSync(statePath, "utf8"));
  // A process cannot survive a restart — anything "running" needs reconciling.
  // A killed run usually left its issue CLAIMED (self-assigned), so a fresh
  // `fsm run` would bounce ClaimIssue→taken→GetWork and grab an unrelated
  // issue. Resume the interrupted run dir instead (retry_wait due now).
  for (const [n, entry] of Object.entries(batch.issues)) {
    if (entry.status === "running") {
      entry.rundir = entry.rundir ?? latestRunDir(Number(n));
      if (entry.rundir) {
        entry.status = "retry_wait";
        entry.retryAt = Date.now();
        log(`RECONCILE #${n} was running at shutdown — will resume ${entry.rundir}`);
      } else {
        entry.status = "pending";
        log(`RECONCILE #${n} was running at shutdown, no run dir — back to pending`);
      }
    }
  }
  log(`RESTART batch from ${statePath}`);
} else {
  batch = {
    base: cfg.base,
    cap: cfg.cap,
    grace: cfg.grace,
    order: cfg.issues,
    issues: Object.fromEntries(
      cfg.issues.map(({ issue, prereqs }) => [issue, { prereqs, status: "pending", rateRetries: 0, resumed: false }]),
    ),
  };
  // Pre-merged prereqs (earlier batch, manual PR) unblock dependents immediately.
  for (const [n, entry] of Object.entries(batch.issues)) {
    if (isMerged(n, batch.base)) {
      entry.status = "merged";
      log(`MERGED #${n} (pre-existing; detected at startup)`);
    }
  }
}
saveBatch();
log(`START batch: issues=[${cfg.issues.map((i) => i.issue).join(" ")}] cap=${batch.cap} poll=${cfg.poll}s grace=${batch.grace}s base=${batch.base}`);

let tick = 0;
while (!allTerminal()) {
  pollMerges();
  propagateSkips();
  launchRetries();
  launchEligible();
  saveBatch();
  tick++;
  if (tick % 10 === 0) log(`HEARTBEAT running=${runningCount()}/${batch.cap} tick=${tick}`);
  await new Promise((r) => setTimeout(r, cfg.poll * 1000));
}

log("DONE all issues reached a terminal state");
summary();
saveBatch();
