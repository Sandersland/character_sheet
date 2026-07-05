#!/usr/bin/env node
/**
 * autodevctl — thin client for the autodevd control socket.
 *
 * Usage:
 *   node .claude/skills/autodev/autodevctl.mjs <verb> [args] [--json]
 *
 *   status                      batch + per-issue state (state, cost, PR urls)
 *   report [--state-dir DIR]    per-issue rollup (outcome, cost, fix cycles,
 *                               active time); --state-dir reads the ledger
 *                               directly — works with no daemon (post-mortem)
 *   logs <issue> [--lines N]    tail a run's batch log
 *   add <issue[:prereqs]>...    enqueue into the running DAG
 *   pause [issue]               pause launches (global or per-issue)
 *   resume [issue]              undo pause
 *   stop <issue>                kill a running child + tear down its worktree
 *   retry <issue>               force a failed/skipped/parked issue back in
 *   reconcile                   run the janitor pass now
 *   ping                        liveness
 *   shutdown [--park]           graceful daemon stop (--park SIGTERMs children)
 *
 * Exit codes: 0 ok · 1 daemon error · 2 daemon not running (prints relaunch hint).
 */
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, renderReport } from "./report.mjs";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
const RUNTIME_DIR = process.env.AUTODEV_RUNTIME_DIR ?? join(ROOT, ".claude", "autodev");
const SOCK = join(RUNTIME_DIR, "autodevd.sock");
const DAEMON_JSON = join(RUNTIME_DIR, "daemon.json");

function relaunchHint() {
  let argv = "<issues...>";
  try {
    const dj = JSON.parse(readFileSync(DAEMON_JSON, "utf8"));
    if (Array.isArray(dj.argv) && dj.argv.length) argv = dj.argv.join(" ");
  } catch {
    /* no previous daemon.json — generic hint */
  }
  return `autodevd is not running — relaunch with:\n  nohup node ${join(SKILL_DIR, "autodevd.mjs")} ${argv} >/dev/null 2>&1 & disown`;
}

function request(verb, args, timeoutMs = 5000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const sock = connect(SOCK);
    let buf = "";
    const timer = setTimeout(() => {
      sock.destroy();
      rejectPromise(new Error("timeout"));
    }, timeoutMs);
    sock.once("connect", () => sock.write(JSON.stringify({ id: 1, verb, args }) + "\n"));
    sock.on("data", (chunk) => {
      buf += chunk;
      if (!buf.includes("\n")) return;
      clearTimeout(timer);
      sock.destroy();
      try {
        resolvePromise(JSON.parse(buf.slice(0, buf.indexOf("\n"))));
      } catch (err) {
        rejectPromise(err);
      }
    });
    sock.once("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
  });
}

// ---------- rendering ----------

function fmtCost(v) {
  return v == null ? "-" : `$${v.toFixed(2)}`;
}

function renderStatus(d) {
  const flags = [d.paused ? "PAUSED" : null, d.draining ? `draining:${d.draining}` : null, d.completedAt ? "idle (batch complete)" : null]
    .filter(Boolean)
    .join(" · ");
  console.log(`daemon pid=${d.daemon.pid} state=${d.daemon.stateDir}`);
  console.log(`batch base=${d.base} cap=${d.cap}${flags ? ` [${flags}]` : ""}`);
  for (const n of d.order) {
    const e = d.issues[n];
    const bits = [
      `#${n}`.padEnd(6),
      (e.paused ? `${e.status}(paused)` : e.status).padEnd(14),
      (e.currentState ?? "-").padEnd(14),
      fmtCost(e.costUsd).padStart(7),
      e.prUrl ?? (e.failure ? `✗ ${e.failure.slice(0, 60)}` : e.retryAt && e.status === "retry_wait" ? `retry at ${new Date(e.retryAt).toLocaleTimeString()}` : ""),
    ];
    console.log("  " + bits.join(" "));
  }
}

// ---------- CLI ----------

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const positional = argv.filter((a) => !a.startsWith("--"));
const [verb, ...rest] = positional;

if (!verb) {
  console.error("usage: autodevctl <status|report|logs|add|pause|resume|stop|retry|reconcile|ping|shutdown> [args] [--json]");
  process.exit(1);
}

// report --state-dir DIR: pure file read, no daemon required (post-mortem mode).
if (verb === "report" && argv.includes("--state-dir")) {
  const dir = argv[argv.indexOf("--state-dir") + 1];
  try {
    const report = buildReport(resolve(ROOT, dir));
    console.log(json ? JSON.stringify(report, null, 2) : renderReport(report));
    process.exit(0);
  } catch (err) {
    console.error(`autodevctl: ${err.message}`);
    process.exit(1);
  }
}

const args = {};
if (verb === "add") args.specs = rest;
else if (["pause", "resume"].includes(verb) && rest[0]) args.issue = Number(rest[0]);
else if (["stop", "retry", "logs"].includes(verb)) args.issue = rest[0] != null ? Number(rest[0]) : null;
if (verb === "logs") {
  const i = argv.indexOf("--lines");
  if (i !== -1) args.lines = Number(argv[i + 1]);
}
if (verb === "shutdown") args.park = argv.includes("--park");

let res;
try {
  res = await request(verb, args);
} catch {
  console.error(relaunchHint());
  process.exit(2);
}

if (!res.ok) {
  console.error(`autodevctl: ${res.error}`);
  process.exit(1);
}
if (json) {
  console.log(JSON.stringify(res.data, null, 2));
} else if (verb === "status") {
  renderStatus(res.data);
} else if (verb === "report") {
  console.log(renderReport(res.data));
} else if (verb === "logs") {
  console.log(res.data.tail);
  console.log(`\n(batch log: ${res.data.batchLog}${res.data.runLog ? ` · run log: tail -f ${res.data.runLog}` : ""})`);
} else if (verb === "ping") {
  console.log(`pong pid=${res.data.pid} uptime=${Math.round(res.data.uptimeMs / 1000)}s`);
} else {
  console.log(JSON.stringify(res.data));
}
