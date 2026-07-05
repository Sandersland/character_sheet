/**
 * autodev janitor — reconcile run liveness ↔ worktree slots (the slot-leak fix).
 *
 * A reaped/killed run used to freeze at run.json `status: "running"` and leak
 * its worktree slot in registry.json until MAX_SLOT was exhausted and every
 * new run died at SetupWorktree ("no free slots"). reconcile() repairs both
 * sides and is called from three places: every daemon tick (batch-core),
 * fsm.mjs's SetupWorktree self-heal, and (control channel) on demand.
 *
 * Run-state classification (run.json):
 *   terminal   completed | failed                       → slot reclaimable
 *   parked     retry-scheduled                          → PROTECTED (a rate-limit or
 *              drain park legitimately has no live process; the batch resumes it —
 *              batch-core stamps drain-parked runs to retry-scheduled for this reason)
 *   live       running + pid alive + heartbeat fresher than AUTODEV_HEARTBEAT_STALE_MS
 *              (default 15 min; the generous bound covers synchronous script states
 *              — e.g. docker compose up — that starve the 30s heartbeat timer)
 *   dead       running + (pid gone | heartbeat stale | legacy run with no pid/heartbeat)
 *              → reaped: run.json finalized failed, steps.jsonl reap line appended
 *
 * Registry sweep (per branch in registry.json):
 *   worktree dir gone                        → `worktree.sh rm` (clears the stale
 *                                              reservation; rm tolerates missing dirs)
 *   dir exists, owning run terminal or dead  → `worktree.sh rm` (slot freed)
 *   dir exists, owning run live or parked    → untouched
 *   dir exists, NO owning run                → untouched — manual worktrees
 *                                              (parallel-issues, interactive) share
 *                                              the registry and are not autodev's
 *
 * Spend note: a reaped run's already-ledgered costUsd (run.json/steps.jsonl) is
 * the harvested spend; whatever the in-flight claude invocation burned after its
 * last ledger write died with its stdout and is unrecoverable.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
const RUNS_DIR = process.env.AUTODEV_RUNS_DIR ?? join(ROOT, ".claude", "autodev", "runs");
const WORKTREES_DIR = process.env.AUTODEV_WORKTREES_DIR ?? join(ROOT, ".claude", "worktrees");
const WORKTREE = process.env.AUTODEV_WORKTREE_BIN ?? join(SKILL_DIR, "..", "worktree", "worktree.sh");
const HEARTBEAT_STALE_MS = Number(process.env.AUTODEV_HEARTBEAT_STALE_MS ?? 15 * 60_000);

const TERMINAL = ["completed", "failed"];

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** "terminal" | "parked" | "live" | "dead" for a parsed run.json. */
export function runState(run) {
  if (!run) return "dead";
  if (TERMINAL.includes(run.status)) return "terminal";
  if (run.status === "retry-scheduled") return "parked";
  const hbAge = run.lastHeartbeat ? Date.now() - run.lastHeartbeat : Infinity;
  return pidAlive(run.pid) && hbAge < HEARTBEAT_STALE_MS ? "live" : "dead";
}

function listRunDirs() {
  try {
    return readdirSync(RUNS_DIR)
      .filter((d) => /-issue-\d+$/.test(d))
      .map((d) => join(RUNS_DIR, d));
  } catch {
    return [];
  }
}

/** Finalize a dead run's ledger: run.json → failed, steps.jsonl reap line. */
function reapRun(dir, run, log) {
  run.status = "failed";
  run.ctx = { ...run.ctx, failure: run.ctx?.failure ?? "reaped: stale heartbeat (janitor)" };
  const tmp = join(dir, "run.json.tmp");
  writeFileSync(tmp, JSON.stringify(run, null, 2));
  renameSync(tmp, join(dir, "run.json"));
  appendFileSync(
    join(dir, "steps.jsonl"),
    JSON.stringify({
      step: run.step ?? null,
      state: run.currentState ?? null,
      transition: null,
      costUsd: 0,
      error: "reaped: stale heartbeat (janitor)",
    }) + "\n",
  );
  log(`JANITOR reaped ${dir.split("/").pop()} (was ${run.currentState ?? "?"}, $${(run.costUsd ?? 0).toFixed(2)} ledgered)`);
}

/**
 * One reconcile pass. Returns { reapedRuns, freedSlots } (arrays of run-dir
 * basenames / branch names). Never throws — a janitor failure must not take
 * the caller down; failures are logged and the item skipped.
 *
 * `protect` — run-dir paths the caller owns and is actively managing (a batch
 * passes its non-terminal entries' rundirs): never reaped, never swept. This
 * closes the adoption race where a just-resumed child hasn't overwritten
 * run.json's stale pid yet.
 */
export function reconcile({ log = () => {}, protect = [] } = {}) {
  const reapedRuns = [];
  const freedSlots = [];
  const protectSet = new Set(protect.filter(Boolean).map((p) => resolve(p)));

  // 1. Reap dead runs (frozen "running" run.jsons), newest-first index by branch.
  const runsByBranch = new Map(); // branch -> {dir, run, state} (newest wins)
  for (const dir of listRunDirs().sort().reverse()) {
    const run = readJson(join(dir, "run.json"));
    if (!run) continue;
    const state = protectSet.has(resolve(dir)) ? "live" : runState(run);
    if (state === "dead" && !TERMINAL.includes(run.status)) {
      try {
        reapRun(dir, run, log); // mutates run.status → failed
        reapedRuns.push(dir.split("/").pop());
      } catch (err) {
        log(`JANITOR reap failed for ${dir}: ${err.message} (skipped)`);
        continue;
      }
    }
    const branch = run.ctx?.branch;
    if (branch && !runsByBranch.has(branch)) {
      runsByBranch.set(branch, { dir, run, state: protectSet.has(resolve(dir)) ? "live" : runState(run) });
    }
  }

  // 2. Registry sweep — free slots whose branch has no worktree dir or whose
  // owning run is finished/dead. Manual (non-autodev) worktrees have no run
  // and are never touched.
  const registry = readJson(join(WORKTREES_DIR, "registry.json")) ?? {};
  for (const branch of Object.keys(registry)) {
    const dirExists = existsSync(join(WORKTREES_DIR, branch));
    const owner = runsByBranch.get(branch);
    let reason = null;
    if (!dirExists) reason = "worktree dir gone (stale reservation)";
    else if (owner && ["terminal", "dead"].includes(owner.state)) reason = `owning run ${owner.run.status}`;
    if (!reason) continue;
    const res = spawnSync(WORKTREE, ["rm", branch], { encoding: "utf8", cwd: ROOT });
    if (res.status === 0) {
      freedSlots.push(branch);
      log(`JANITOR freed slot ${registry[branch]} (${branch}: ${reason})`);
    } else {
      log(`JANITOR failed to free ${branch}: ${(res.stderr || res.stdout || "").trim().slice(0, 200)} (skipped)`);
    }
  }

  return { reapedRuns, freedSlots };
}
