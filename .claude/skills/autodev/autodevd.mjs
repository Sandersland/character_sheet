#!/usr/bin/env node
/**
 * autodevd — resident autodev batch daemon.
 *
 * Same DAG semantics as the one-shot batch.mjs (both drive batch-core.mjs),
 * but stays resident: at all-terminal it idles instead of exiting, so state
 * survives (ready for a status/add control channel to attach later), and a
 * relaunch after a kill/reap adopts still-running detached children
 * losslessly. Today, adding work = relaunching with new issue specs.
 *
 * Launch (detached — Claude Code reaps background task groups, nohup escapes):
 *   nohup node .claude/skills/autodev/autodevd.mjs 123 124:123 --cap 3 \
 *     >/dev/null 2>&1 & disown
 *
 * Stop:
 *   node .claude/skills/autodev/autodevd.mjs stop          # drain: let running children finish
 *   node .claude/skills/autodev/autodevd.mjs stop --park   # SIGTERM children, park as retry_wait
 *
 * Recovery is relaunch-idempotency, not supervision: nothing auto-restarts a
 * dead daemon — re-running the launch command resumes the same batch (PID file
 * refuses a second live daemon; a stale PID is reclaimed).
 *
 * Runtime files (all gitignored):
 *   .claude/autodev/autodevd.pid   — live daemon pid (plain int)
 *   .claude/autodev/daemon.json    — {pid, stateDir, startedAt, argv} for relaunch hints
 *   <state-dir>/orchestrator.log   — the daemon's log (same vocabulary as batch.mjs)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine, parseIssueSpecs, pidAlive } from "./batch-core.mjs";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
const RUNTIME_DIR = process.env.AUTODEV_RUNTIME_DIR ?? join(ROOT, ".claude", "autodev");
const PID_FILE = join(RUNTIME_DIR, "autodevd.pid");
const DAEMON_JSON = join(RUNTIME_DIR, "daemon.json");
const SELF = join(SKILL_DIR, "autodevd.mjs");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function livePid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (!pidAlive(pid)) return null;
  // PID-recycle guard: only trust a pid whose command line is actually autodevd.
  const cmd = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).stdout ?? "";
  return cmd.includes("autodevd") ? pid : null;
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- stop subcommand ----------

async function cmdStop(park) {
  const pid = livePid();
  if (!pid) {
    console.error("autodevd: no daemon running");
    process.exit(1);
  }
  process.kill(pid, park ? "SIGUSR1" : "SIGTERM");
  console.log(`autodevd: sent ${park ? "SIGUSR1 (park)" : "SIGTERM (drain)"} to pid ${pid} — waiting for exit`);
  const started = Date.now();
  while (pidAlive(pid)) {
    await sleepMs(500);
    if ((Date.now() - started) % 10_000 < 500) console.log("autodevd: still draining…");
  }
  console.log("autodevd: stopped");
}

// ---------- launch ----------

function parseArgs(argv) {
  const cfg = { cap: 3, poll: 60, grace: 1800, base: "staging", stateDir: null, specs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cap") cfg.cap = Number(argv[++i]);
    else if (a === "--poll") cfg.poll = Number(argv[++i]);
    else if (a === "--grace") cfg.grace = Number(argv[++i]);
    else if (a === "--base") cfg.base = argv[++i];
    else if (a === "--state-dir") cfg.stateDir = argv[++i];
    else cfg.specs.push(a); // validated by parseIssueSpecs
  }
  return cfg;
}

function resolveStateDir(cfg) {
  if (cfg.stateDir) return resolve(ROOT, cfg.stateDir);
  // No explicit dir: re-attach to the previous daemon's batch if it still has
  // live work; otherwise start a fresh timestamped dir.
  const prev = readJson(DAEMON_JSON);
  const prevBatch = prev?.stateDir ? readJson(join(prev.stateDir, "batch.json")) : null;
  const nonTerminal =
    prevBatch && Object.values(prevBatch.issues).some((e) => !["merged", "failed", "skipped"].includes(e.status));
  if (nonTerminal) return prev.stateDir;
  return join(RUNTIME_DIR, "overnight", new Date().toISOString().replace(/[:.]/g, "-"));
}

function acquirePidFile() {
  mkdirSync(RUNTIME_DIR, { recursive: true }); // absent on a fresh checkout (gitignored)
  const pid = livePid();
  if (pid) {
    console.error(`autodevd: already running (pid ${pid}) — stop it with: node ${SELF} stop`);
    process.exit(1);
  }
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE); // stale (dead or recycled pid)
  try {
    writeFileSync(PID_FILE, String(process.pid) + "\n", { flag: "wx" });
  } catch {
    console.error("autodevd: lost the pidfile race to another launching daemon");
    process.exit(1);
  }
  // Last-resort cleanup: only remove the pidfile if it is still ours.
  process.on("exit", () => {
    try {
      if (Number(readFileSync(PID_FILE, "utf8").trim()) === process.pid) unlinkSync(PID_FILE);
    } catch {
      /* already gone */
    }
  });
}

async function cmdLaunch(argv) {
  const cfg = parseArgs(argv);
  let specs;
  try {
    specs = parseIssueSpecs(cfg.specs);
  } catch (err) {
    console.error(`autodevd: ${err.message}`);
    process.exit(1);
  }

  acquirePidFile();
  const stateDir = resolveStateDir(cfg);
  const engine = createEngine({
    stateDir,
    cfg: { cap: cfg.cap, grace: cfg.grace, base: cfg.base, issues: specs },
  });
  try {
    engine.loadOrInit();
  } catch (err) {
    console.error(`autodevd: ${err.message}`);
    console.error(`usage: autodevd.mjs <issue[:prereq[,prereq]]> ... [--cap N] [--poll S] [--grace S] [--base BR] [--state-dir DIR]`);
    process.exit(1);
  }
  writeFileSync(DAEMON_JSON, JSON.stringify({ pid: process.pid, stateDir, startedAt: Date.now(), argv }, null, 2));

  // Signals: first SIGTERM/SIGINT drains gently (running children finish);
  // a second one — or SIGUSR1 directly — escalates to park (SIGTERM children).
  let wake = () => {};
  engine.setWake(() => wake()); // child exits during a drain end the sleep early
  let stops = 0;
  const onStop = (sig) => {
    stops++;
    engine.drain(sig === "SIGUSR1" || stops >= 2 ? "park" : "wait");
    wake();
  };
  process.on("SIGTERM", () => onStop("SIGTERM"));
  process.on("SIGINT", () => onStop("SIGINT"));
  process.on("SIGUSR1", () => onStop("SIGUSR1"));

  engine.log(`DAEMON start pid=${process.pid} state=${stateDir} cap=${engine.batch.cap} poll=${cfg.poll}s grace=${engine.batch.grace}s base=${engine.batch.base}`);

  let tick = 0;
  let announcedDone = false;
  // Async while + sleep, NOT setInterval — the tick body is full of spawnSync
  // (gh merge polls, git sync) and must never re-enter.
  while (true) {
    engine.tick();
    if (engine.draining && engine.runningCount() === 0) break;
    if (engine.allTerminal()) {
      if (!announcedDone) {
        engine.batch.completedAt = Date.now();
        engine.saveBatch();
        engine.log("DONE all issues reached a terminal state — idling (add more or stop)");
        engine.summary();
        announcedDone = true;
      }
    } else {
      announcedDone = false; // new work arrived (addIssues cleared completedAt)
    }
    tick++;
    if (tick % 10 === 0) engine.log(`HEARTBEAT running=${engine.runningCount()}/${engine.batch.cap} tick=${tick}${engine.batch.completedAt ? " (idle)" : ""}`);
    await new Promise((r) => {
      wake = r;
      setTimeout(r, cfg.poll * 1000);
    });
    wake = () => {};
  }

  engine.saveBatch();
  engine.log(`DAEMON stopped (drain=${engine.draining}) pid=${process.pid}`);
  engine.summary();
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* exit hook double-checks */
  }
}

// ---------- dispatch ----------

const argv = process.argv.slice(2);
if (argv[0] === "stop") {
  await cmdStop(argv.includes("--park"));
} else {
  await cmdLaunch(argv);
}
