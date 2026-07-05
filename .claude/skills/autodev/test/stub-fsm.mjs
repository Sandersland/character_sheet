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
 *                                                 claude-review until the responder
 *                                                 marker flips it; 9911 is its dependent)
 *   9920  exit 0 with ctx.prUrl                  (merge-lagging scenario: the gh
 *                                                 stub reports 9920's PR all-green
 *                                                 but never merged → classifyPrBlock
 *                                                 returns "unknown")
 *   9930  exit 0 with ctx.prUrl                  (non-converging review-block: the
 *   9931  exit 0 with ctx.prUrl                   responder runs but GH_STUB_REVIEW_STUCK
 *                                                 keeps the review red; 9931 is the dependent)
 *
 * A `run pr-response …` invocation (any issue) plays the responder: writes a
 * run.json with ctx.pushed and — unless GH_STUB_REVIEW_STUCK matches the issue —
 * drops a `responded-<issue>` marker in RUNS_DIR that the gh stub reads to flip
 * the blocked PR to merged.
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
const machine = mode === "run" ? rest[0] : null;

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

if (machine === "pr-response") {
  // Responder stub: pretend we triaged, fixed, committed, pushed. The marker
  // flips the gh stub's blocked PR to merged; GH_STUB_REVIEW_STUCK suppresses
  // it so the review never greens (non-convergence scenario).
  const cycle = rest.includes("--pr-cycle") ? rest[rest.indexOf("--pr-cycle") + 1] : "1";
  save("completed", { pushed: true, prNumber: issue, branch: `fix/pr${issue}-c${cycle}` });
  if (process.env.GH_STUB_REVIEW_STUCK !== String(issue)) {
    writeFileSync(join(RUNS_DIR, `responded-${issue}`), "1");
  }
  process.exit(0);
}

switch (issue) {
  case 9900:
  case 9910: // review-block scenario: succeeds → waiting_merge; gh stub makes its PR review-blocked
  case 9911: // dependent of 9910 (launches once the responder marker merges 9910)
  case 9920: // merge-lagging scenario: succeeds → waiting_merge; gh stub reports all-green but unmerged
  case 9930: // non-converging review-block (GH_STUB_REVIEW_STUCK)
  case 9931: // dependent of 9930 (stays pending — prereq never merges)
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
