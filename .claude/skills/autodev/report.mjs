/**
 * autodev report — per-issue rollup over the existing plain-JSON ledger
 * (batch.json + run.json + steps.jsonl; no new state store by design).
 *
 * Answers "where is it failing / what did it cost" at a glance instead of
 * forensic jq over run dirs. Served live by the daemon's `report` verb and
 * readable post-mortem via `autodevctl report --state-dir DIR` (no daemon
 * needed — it's a pure file reader).
 *
 * Outcome per issue, in precedence order:
 *   PR <url>            run produced a PR (the only real success signal)
 *   skipped             a prereq failed/skipped upstream
 *   failed: <why>       ctx.failure (Fail path, janitor reap, budget breach…)
 *   flagged             graceful FlagIssue exit (needs-interactive / needs-refinement)
 *   parked              retry_wait — rate-limited or drain-parked, will resume
 *   in-flight @ State   still running
 *
 * Time is reported as ACTIVE time (sum of steps.jsonl durationMs): run.json's
 * startedAt resets on every resume, so wall-clock across parks would lie.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readJsonl(path) {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function outcomeOf(entry, run) {
  if (run?.ctx?.prUrl) return { kind: "pr", detail: run.ctx.prUrl };
  if (entry.status === "skipped") return { kind: "skipped", detail: `prereq failed/skipped (${(entry.prereqs ?? []).join(",")})` };
  if (run?.ctx?.failure) return { kind: "failed", detail: run.ctx.failure };
  // Ledger invariant: FlagIssue is the only path that completes with ctx.comment
  // set (fsm.mjs applyFlag) — a future run type that sets ctx.comment on real
  // success would be misclassified here; give it a dedicated ctx flag instead.
  if (run?.status === "completed" && run?.ctx?.comment) {
    return { kind: "flagged", detail: run.ctx.interactiveOnly ? "needs-interactive" : "needs-refinement" };
  }
  if (entry.status === "failed") {
    const why = entry.stoppedBy === "ctl" ? "stopped via control channel" : run ? "no failure reason recorded (crash?)" : "no run ledger";
    return { kind: "failed", detail: why };
  }
  if (entry.status === "retry_wait") {
    return { kind: "parked", detail: `retry at ${entry.retryAt ? new Date(entry.retryAt).toISOString() : "?"}` };
  }
  if (entry.status === "running") return { kind: "in-flight", detail: run?.currentState ?? "?" };
  if (entry.status === "waiting_merge") return { kind: "waiting-merge", detail: run?.ctx?.prUrl ?? "" };
  return { kind: entry.status, detail: "" };
}

/** Build the rollup for a batch state dir. Throws if there's no batch.json. */
export function buildReport(stateDir) {
  const batch = readJson(join(stateDir, "batch.json"));
  if (!batch) throw new Error(`no batch.json in ${stateDir}`);

  const rows = batch.order.map(({ issue }) => {
    const entry = batch.issues[issue];
    const run = entry.rundir ? readJson(join(entry.rundir, "run.json")) : null;
    const steps = entry.rundir ? readJsonl(join(entry.rundir, "steps.jsonl")) : [];
    const outcome = outcomeOf(entry, run);
    return {
      issue: Number(issue),
      status: entry.status,
      outcome: outcome.kind,
      detail: outcome.detail,
      costUsd: run?.costUsd ?? 0,
      fixCycles: run?.loops?.["Reviewer->Worker"] ?? 0,
      steps: run?.step ?? 0,
      activeMs: steps.reduce((ms, s) => ms + (s.durationMs ?? 0), 0),
      rateRetries: entry.rateRetries ?? 0,
      rundir: entry.rundir ?? null,
    };
  });

  return {
    stateDir,
    base: batch.base,
    cap: batch.cap,
    completedAt: batch.completedAt ?? null,
    totalCostUsd: rows.reduce((c, r) => c + r.costUsd, 0),
    rows,
  };
}

/** Human-readable table for the CLI. */
export function renderReport(report) {
  const mins = (ms) => (ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : ms > 0 ? `${Math.round(ms / 1000)}s` : "-");
  const lines = [];
  lines.push(`batch ${report.stateDir}  (base=${report.base}${report.completedAt ? ", complete" : ""})`);
  lines.push("issue   outcome        cost  cycles  active  detail");
  for (const r of report.rows) {
    lines.push(
      [
        `#${r.issue}`.padEnd(7),
        r.outcome.padEnd(13),
        `$${r.costUsd.toFixed(2)}`.padStart(7),
        String(r.fixCycles).padStart(4),
        mins(r.activeMs).padStart(7),
        ` ${r.detail}`,
      ].join(" "),
    );
  }
  lines.push(`total: $${report.totalCostUsd.toFixed(2)} across ${report.rows.length} issue(s)`);
  return lines.join("\n");
}
