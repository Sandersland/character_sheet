#!/usr/bin/env node
/**
 * Stub fsm.mjs for structural batch/daemon tests (zero Claude spend).
 * Honors the real CLI contract (`run <machine> --issue N --integration BR`,
 * `resume <run-dir>`, exit codes 0/1/75, run dir + run.json under
 * AUTODEV_RUNS_DIR) and keys its behavior off the issue number:
 *
 *   9900  exit 0 with ctx.prUrl                  (real success)
 *   9901  exit 75 first run (retry-scheduled),   (rate-limit park → resume succeeds)
 *         exit 0 + prUrl on resume
 *   9902  exit 1 always                          (crash; resume also crashes)
 *   9903  write run.json then sleep 300s,        (long-runner, killable)
 *         heartbeating every 2s like the real fsm
 *   9910  exit 0 with ctx.prUrl                  (review-block scenario: the gh
 *   9911  exit 0 with ctx.prUrl                   stub marks 9910's PR blocked on
 *                                                 claude-review; 9911 is its
 *                                                 dependent — never launches)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RUNS_DIR = process.env.AUTODEV_RUNS_DIR;
if (!RUNS_DIR) {
  console.error("stub-fsm: AUTODEV_RUNS_DIR must be set");
  process.exit(2);
}

const [mode, ...rest] = process.argv.slice(2);
let dir, issue, resumed;

if (mode === "run") {
  issue = Number(rest[rest.indexOf("--issue") + 1]);
  dir = join(RUNS_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-issue-${issue}`);
  mkdirSync(dir, { recursive: true });
  resumed = false;
} else if (mode === "resume") {
  dir = rest[0];
  issue = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")).ctx.issue;
  resumed = true;
} else {
  console.error(`stub-fsm: unknown mode '${mode}'`);
  process.exit(2);
}

function save(status, extraCtx = {}, extra = {}) {
  writeFileSync(
    join(dir, "run.json"),
    JSON.stringify(
      {
        id: dir.split("/").pop(),
        status,
        costUsd: 0.01,
        ctx: { issue, branch: `stub/issue-${issue}`, ...extraCtx },
        startedAt: Date.now(),
        // Liveness fields (like the real fsm's saveRun) — without them a
        // batch-tick janitor pass would classify a live stub as a legacy
        // dead run and reap it mid-scenario.
        pid: process.pid,
        lastHeartbeat: Date.now(),
        ...extra,
      },
      null,
      2,
    ),
  );
}

switch (issue) {
  case 9900:
  case 9910: // review-block scenario: succeeds → waiting_merge; gh stub makes its PR review-blocked
  case 9911: // dependent of 9910 (never launches — prereq never merges)
    save("completed", { prUrl: `https://example.test/pr/${issue}` });
    process.exit(0);
  case 9901:
    if (resumed) {
      save("completed", { prUrl: `https://example.test/pr/${issue}` });
      process.exit(0);
    }
    save("retry-scheduled", {}, { retryable: true, retryAt: Date.now() + 2000 });
    process.exit(75);
  case 9902:
    save("running");
    process.exit(1);
  case 9903:
    save("running");
    setInterval(() => save("running"), 2000); // heartbeat like the real fsm
    setTimeout(() => process.exit(0), 300_000); // long-runner; killed by tests
    break;
  default:
    console.error(`stub-fsm: no behavior for issue ${issue}`);
    process.exit(2);
}
