#!/usr/bin/env node
/**
 * autodev batch orchestrator (one-shot) — run several issues through fsm.mjs
 * with a concurrency cap, a dependency DAG gated on real staging merges,
 * rate-limit rescheduling (fsm exit 75), and worktree cleanup, then exit when
 * every issue is terminal. For the resident/supervised form of the same loop
 * (survives reaping, adopts detached children, control channel) use
 * autodevd.mjs — both drive batch-core.mjs.
 *
 * Usage:
 *   node batch.mjs 123 124:123 125:124 [--cap 3] [--poll 60] [--grace 1800]
 *                  [--base staging] [--state-dir DIR]
 *
 * Each arg is `issue[:prereq[,prereq]]` — a prereq must have its PR MERGED
 * into --base before the dependent launches (dependents fork origin/<base>).
 *
 * Single atomic batch.json, restart-idempotent — rerun with the same
 * --state-dir to resume a batch. Lifecycle per issue:
 *   pending → running → waiting_merge → merged            (terminal, success)
 *                     ↘ retry_wait (fsm exit 75) → running
 *                     ↘ failed                             (terminal)
 *   pending → skipped (a prereq failed/skipped)            (terminal)
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine, parseIssueSpecs, validatePrereqs } from "./batch-core.mjs";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");

function parseArgs(argv) {
  const cfg = { cap: 3, poll: 60, grace: 1800, base: "staging", stateDir: null, specs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cap") cfg.cap = Number(argv[++i]);
    else if (a === "--poll") cfg.poll = Number(argv[++i]);
    else if (a === "--grace") cfg.grace = Number(argv[++i]);
    else if (a === "--base") cfg.base = argv[++i];
    else if (a === "--state-dir") cfg.stateDir = argv[++i];
    else cfg.specs.push(a);
  }
  let issues;
  try {
    issues = parseIssueSpecs(cfg.specs);
    if (!issues.length) throw new Error("no issues given");
    validatePrereqs(issues, new Set(issues.map((i) => i.issue)));
  } catch (err) {
    console.error(`batch: ${err.message}`);
    console.error("usage: batch.mjs <issue[:prereq[,prereq]]> ... [--cap N] [--poll S] [--grace S] [--base BR] [--state-dir DIR]");
    process.exit(1);
  }
  return { ...cfg, issues };
}

const cfg = parseArgs(process.argv.slice(2));
const stateDir = cfg.stateDir
  ? resolve(ROOT, cfg.stateDir)
  : join(ROOT, ".claude", "autodev", "overnight", new Date().toISOString().replace(/[:.]/g, "-"));

const engine = createEngine({
  stateDir,
  cfg: { cap: cfg.cap, grace: cfg.grace, base: cfg.base, issues: cfg.issues },
});
engine.loadOrInit();
engine.log(`START batch: issues=[${cfg.issues.map((i) => i.issue).join(" ")}] cap=${engine.batch.cap} poll=${cfg.poll}s grace=${engine.batch.grace}s base=${engine.batch.base}`);

let tick = 0;
while (!engine.allTerminal()) {
  engine.tick();
  tick++;
  if (tick % 10 === 0) engine.log(`HEARTBEAT running=${engine.runningCount()}/${engine.batch.cap} tick=${tick}`);
  await new Promise((r) => setTimeout(r, cfg.poll * 1000));
}

engine.log("DONE all issues reached a terminal state");
engine.summary();
engine.saveBatch();
