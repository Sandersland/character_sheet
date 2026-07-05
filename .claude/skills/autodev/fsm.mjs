#!/usr/bin/env node
/**
 * autodev FSM driver — runs a machine of constrained, headless `claude -p` states.
 *
 * Each agent state is a fresh headless invocation with its own tools,
 * --allowedTools, model, turn/cost caps, and a PreToolUse guard (fsm-guard.mjs)
 * enforcing the state's bash allow/deny regexes. Script states are plain
 * functions (worktree setup, PR submit, labeling) — deterministic, zero tokens.
 * Transitions are validated against the machine JSON; every step lands in a
 * run ledger under .claude/autodev/runs/<run-id>/ for audit + resume.
 *
 * Usage:
 *   node fsm.mjs run <machine> [--issue N] [--integration BR] [--start STATE] [--only STATE] [--dry-run]
 *   node fsm.mjs resume <run-dir>
 */
import { spawn, spawnSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile as janitorReconcile } from "./janitor.mjs";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
const RUNS_DIR = join(ROOT, ".claude", "autodev", "runs");

// ---------- CLI ----------

function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  const opts = { issue: null, integration: null, start: null, only: null, dryRun: false, maxCost: null, pr: null, prHead: null, prCycle: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--issue") opts.issue = Number(rest[++i]);
    else if (a === "--integration") opts.integration = rest[++i];
    else if (a === "--pr") opts.pr = Number(rest[++i]);
    else if (a === "--pr-head") opts.prHead = rest[++i];
    else if (a === "--pr-cycle") opts.prCycle = Number(rest[++i]);
    else if (a === "--start") opts.start = rest[++i];
    else if (a === "--only") opts.only = rest[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--max-cost") opts.maxCost = Number(rest[++i]);
    else die(`unknown arg '${a}'`);
  }
  if (!cmd || !target) die("usage: fsm.mjs run <machine> [flags] | fsm.mjs resume <run-dir>");
  return { cmd, target, opts };
}

function die(msg) {
  console.error(`fsm: ${msg}`);
  process.exit(1);
}

// ---------- machine + templates ----------

function loadMachine(name) {
  const path = join(SKILL_DIR, "machines", `${name}.json`);
  if (!existsSync(path)) die(`no machine '${name}' at ${path}`);
  const machine = JSON.parse(readFileSync(path, "utf8"));
  machine._path = path;
  for (const [state, def] of Object.entries(machine.states)) {
    for (const next of Object.values(def.transitions ?? {})) {
      if (!machine.states[next]) die(`machine '${name}': state '${state}' transitions to unknown state '${next}'`);
    }
  }
  return machine;
}

// {{key}} → ctx value; objects/arrays render as pretty JSON.
function render(template, ctx) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = ctx[key];
    if (v === undefined || v === null) return `<missing:${key}>`;
    return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  });
}

function envelopeEpilogue(def) {
  const edges = Object.entries(def.transitions)
    .map(([edge, next]) => {
      const req = def.required?.[edge] ?? [];
      return `- "${edge}" (→ ${next})${req.length ? ` — payload MUST include: ${req.join(", ")}` : ""}`;
    })
    .join("\n");
  return [
    "",
    "## Output contract (mandatory)",
    "Your FINAL message must be exactly one fenced JSON block and nothing else:",
    "```json",
    '{ "transition": "<edge>", "payload": { ... }, "summary": "<1-2 lines>" }',
    "```",
    "Legal transitions:",
    edges,
    "Do not invent other transition names. Do not wrap the block in prose.",
  ].join("\n");
}

// ---------- claude invocation ----------

let HELP = null;
function supportsFlag(flag) {
  if (HELP === null) {
    try {
      HELP = execSync("claude --help", { encoding: "utf8" });
    } catch {
      HELP = "";
    }
  }
  return HELP.includes(flag);
}

const ENVELOPE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    transition: { type: "string" },
    payload: { type: "object" },
    summary: { type: "string" },
  },
  required: ["transition", "payload", "summary"],
});

function buildArgs(def, prompt, { resumeSession, maxBudgetUsd } = {}) {
  const args = ["-p", prompt, "--output-format", "json", "--setting-sources", "project"];
  if (resumeSession) args.push("--resume", resumeSession);
  if (def.model) args.push("--model", def.model);
  if (def.tools !== undefined) args.push("--tools", def.tools);
  if (def.allowedTools?.length) args.push("--allowedTools", ...def.allowedTools);
  if (def.disallowedTools?.length) args.push("--disallowedTools", ...def.disallowedTools);
  if (def.permissionMode) args.push("--permission-mode", def.permissionMode);
  if (def.maxTurns && supportsFlag("--max-turns")) args.push("--max-turns", String(def.maxTurns));
  // A retry may cap below the state's default to stay within remaining global budget.
  const budgetCap = maxBudgetUsd ?? def.maxBudgetUsd;
  if (budgetCap && supportsFlag("--max-budget-usd")) args.push("--max-budget-usd", String(budgetCap));
  if (def.fallbackModel && supportsFlag("--fallback-model")) args.push("--fallback-model", def.fallbackModel);
  // Children run with --setting-sources project (no user-level plugin MCP
  // servers), so a state that needs an MCP server declares it explicitly.
  if (def.mcpConfig) args.push("--mcp-config", JSON.stringify(def.mcpConfig), "--strict-mcp-config");
  if (supportsFlag("--json-schema")) args.push("--json-schema", ENVELOPE_SCHEMA);
  return args;
}

function guardSettingsFile(run) {
  const path = join(run.dir, "settings-guard.json");
  if (!existsSync(path)) {
    writeFileSync(
      path,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: `node "${join(SKILL_DIR, "fsm-guard.mjs")}"` }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );
  }
  return path;
}

function invokeClaude(stateName, def, args, cwd, run) {
  const wallMs = (def.wallMinutes ?? 30) * 60_000;
  return new Promise((resolvePromise) => {
    const child = spawn("claude", [...args, "--settings", guardSettingsFile(run)], {
      cwd,
      env: { ...process.env, FSM_STATE: stateName, FSM_MACHINE: run.machine._path },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, wallMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut: child.killed });
    });
  });
}

// Envelope may arrive as structured_output, as the whole result string, or as
// the last fenced JSON block in the result — accept all three.
function parseEnvelope(raw) {
  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    return { error: `claude stdout was not JSON: ${raw.slice(0, 400)}` };
  }
  const candidates = [];
  if (out.structured_output && typeof out.structured_output === "object") candidates.push(out.structured_output);
  const result = typeof out.result === "string" ? out.result : "";
  try {
    candidates.push(JSON.parse(result));
  } catch {
    const fences = [...result.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
    if (fences.length) {
      try {
        candidates.push(JSON.parse(fences[fences.length - 1][1]));
      } catch {
        /* fall through */
      }
    }
  }
  const envelope = candidates.find((c) => c && typeof c.transition === "string" && typeof c.payload === "object");
  if (!envelope) return { error: `no valid {transition, payload, summary} envelope in final message`, out };
  return { envelope, out };
}

function validateEnvelope(def, envelope) {
  if (!def.transitions[envelope.transition]) {
    return `transition '${envelope.transition}' is not legal here; legal: ${Object.keys(def.transitions).join(", ")}`;
  }
  const missing = (def.required?.[envelope.transition] ?? []).filter((k) => envelope.payload?.[k] === undefined);
  if (missing.length) return `payload for '${envelope.transition}' is missing required keys: ${missing.join(", ")}`;
  return null;
}

// Classify a nonzero-exit claude invocation so transient failures (rate limit,
// overload) can be retried/rescheduled instead of killing the run. Shape of a
// real rate-limit death (captured 2026-07-02, run …issue-124/raw-6-Worker-a1):
// { type:"result", subtype:"success", is_error:true, api_error_status:429,
//   result:"You've hit your session limit · resets 3:10am (America/New_York)",
//   total_cost_usd:3.96, session_id:"…" } — cost and session are present even
// on failure, so always harvest them.
function classifyFailure(res) {
  let out = null;
  try {
    out = JSON.parse(res.stdout);
  } catch {
    /* stdout not JSON — classify from raw text below */
  }
  const text = `${out?.result ?? ""}\n${res.stdout.slice(0, 2000)}\n${res.stderr.slice(0, 2000)}`;
  const rateLimited =
    out?.api_error_status === 429 ||
    out?.api_error_status === 529 ||
    /hit your session limit|rate.?limit|overloaded/i.test(text);
  // A per-invocation --max-budget-usd cap hit mid-work: retry-with-resume-able like a
  // crash, but the retry MUST re-slice from the global budget, not a fresh state cap
  // (#332 double-sliced $10+$10 inside one state). Rate limit takes precedence.
  const stateBudget = !rateLimited && out?.subtype === "error_max_budget_usd";
  return {
    kind: rateLimited ? "rate_limit" : stateBudget ? "state_budget" : "transient",
    retryAt: rateLimited ? parseResetTime(text) : null,
    costUsd: out?.total_cost_usd ?? 0,
    sessionId: out?.session_id ?? null,
    numTurns: out?.num_turns ?? null,
    detail: (out?.result ?? res.stderr ?? "").slice(0, 300),
  };
}

// "resets 3:10am (America/New_York)" → epoch ms of the NEXT occurrence of that
// wall-clock time in that zone (scan forward minute-by-minute ≤24h), +2min pad.
// Fallback: ~one hour from now.
function parseResetTime(text) {
  const fallback = Date.now() + 62 * 60_000;
  const m = text.match(/resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return fallback;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  const minute = Number(m[2] ?? 0);
  const tz = text.match(/\(([A-Za-z_]+\/[A-Za-z_]+)\)/)?.[1] ?? "America/New_York";
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const start = Math.ceil(Date.now() / 60_000) * 60_000;
    for (let t = start; t <= start + 24 * 3_600_000; t += 60_000) {
      const parts = fmt.formatToParts(new Date(t)).reduce((a, p) => ((a[p.type] = p.value), a), {});
      if (Number(parts.hour) % 24 === hour && Number(parts.minute) === minute) return t + 2 * 60_000;
    }
  } catch {
    /* Intl/tz failure → fallback */
  }
  return fallback;
}

// Global budget headroom left for this run (the machine's cost cap minus spend so
// far). Used to cap a retry's per-invocation budget so an in-process retry can't
// re-slice a full fresh state cap past the global ceiling (#332).
function globalRemaining(run) {
  const cap = run.maxCostUsd ?? run.machine?.budget?.maxCostUsd ?? Infinity;
  return cap - run.costUsd;
}

async function runAgentState(stateName, def, run) {
  const templatePath = join(SKILL_DIR, def.prompt);
  const resumeSession = def.resumePrompt && run.sessions[stateName] ? run.sessions[stateName] : null;
  const template = readFileSync(resumeSession ? join(SKILL_DIR, def.resumePrompt) : templatePath, "utf8");
  const prompt = render(template, run.ctx) + envelopeEpilogue(def);
  const cwd = def.cwd ? render(def.cwd, run.ctx) : ROOT;

  if (run.dryRun) {
    console.log(`\n=== [dry-run] agent state ${stateName} (cwd: ${cwd}) ===`);
    console.log(`claude ${buildArgs(def, "<prompt>", { resumeSession }).join(" ")}`);
    console.log(`--- prompt ---\n${prompt}\n`);
    return { transition: Object.keys(def.transitions)[0], payload: {}, summary: "[dry-run]" };
  }

  let attempt = 0;
  let session = resumeSession;
  let lastError = null;
  let lastErrorKind = null; // "envelope" (bad final message) | "crash" (nonzero exit)
  while (attempt < 2) {
    attempt++;
    // Retry resumes the failed session with just the error; if there is no
    // session to resume (stdout wasn't JSON), re-send the full prompt instead.
    // A crashed attempt died MID-WORK (no invalid final message to correct) —
    // its resume asks to continue, not to re-emit.
    const promptForAttempt =
      attempt === 1
        ? prompt
        : session
          ? lastErrorKind === "crash"
            ? `Your previous invocation was interrupted mid-work (${lastError}). Continue from where you left off and finish the task.` +
              envelopeEpilogue(def)
            : `Your previous final message was invalid: ${lastError}\nRe-emit ONLY the corrected fenced JSON envelope.` +
              envelopeEpilogue(def)
          : `${prompt}\n\nNOTE: your previous attempt failed with: ${lastError}`;
    // A retry (attempt ≥ 2) caps its --max-budget-usd to what's left of the global
    // budget, so it never re-grants a full fresh state cap (the #332 double-slice).
    const retryBudget =
      attempt >= 2 && def.maxBudgetUsd ? Math.min(def.maxBudgetUsd, Math.max(0, globalRemaining(run))) : undefined;
    const args = buildArgs(def, promptForAttempt, {
      resumeSession: attempt === 1 ? resumeSession : session,
      maxBudgetUsd: retryBudget,
    });
    const started = Date.now();
    const res = await invokeClaude(stateName, def, args, cwd, run);
    writeFileSync(join(run.dir, `raw-${run.step}-${stateName}-a${attempt}.json`), res.stdout || res.stderr);
    if (res.timedOut) throw new Error(`state '${stateName}' exceeded its ${def.wallMinutes ?? 30}min wall clock`);
    if (res.code !== 0) {
      // Bill and ledger the failed attempt (a crashed child has usually spent
      // real money — #124's 429 death burned $3.96 invisibly before this fix),
      // then classify: rate limits reschedule the run (exit 75, resume later);
      // other nonzero exits get ONE in-process retry via session resume.
      const fail = classifyFailure(res);
      run.costUsd += fail.costUsd;
      if (fail.sessionId) session = fail.sessionId;
      ledgerStep(run, {
        state: stateName,
        attempt,
        sessionId: session,
        model: def.model ?? "default",
        turns: fail.numTurns,
        costUsd: fail.costUsd,
        durationMs: Date.now() - started,
        transition: null,
        exitCode: res.code,
        error: `${fail.kind}: ${fail.detail}`,
      });
      if (fail.kind === "rate_limit") {
        // Save the session so a later `fsm.mjs resume` re-enters mid-state.
        if (session) run.sessions[stateName] = session;
        throw Object.assign(new Error(`state '${stateName}' hit the rate limit: ${fail.detail}`), {
          tempfail: true,
          retryAt: fail.retryAt,
        });
      }
      lastError = `claude exited ${res.code}: ${fail.detail}`;
      lastErrorKind = "crash";
      if (attempt < 2) {
        // No point retrying with < ~$1 of global budget left — throw to the normal
        // breach/Fail path instead of spending the tail on a doomed attempt.
        const remaining = globalRemaining(run);
        if (remaining < 1) {
          throw new Error(
            `state '${stateName}' ${fail.kind} with only $${remaining.toFixed(2)} global budget left — not retrying: ${fail.detail}`,
          );
        }
        const budgetNote = def.maxBudgetUsd ? ` (retry capped at $${Math.min(def.maxBudgetUsd, remaining).toFixed(2)})` : "";
        log(run, `state ${stateName} attempt ${attempt} ${fail.kind === "state_budget" ? "hit its state budget cap" : "crashed"} (${lastError}) — retrying${session ? " via session resume" : ""}${budgetNote} in 30s`);
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      throw new Error(`state '${stateName}' claude exited ${res.code}: ${fail.detail}`);
    }

    const { envelope, out, error } = parseEnvelope(res.stdout);
    if (out?.session_id) session = out.session_id;
    const costUsd = out?.total_cost_usd ?? 0;
    run.costUsd += costUsd;
    lastError = error ?? (envelope ? validateEnvelope(def, envelope) : "no envelope");
    if (lastError) lastErrorKind = "envelope";
    ledgerStep(run, {
      state: stateName,
      attempt,
      sessionId: session,
      model: def.model ?? "default",
      turns: out?.num_turns ?? null,
      costUsd,
      durationMs: Date.now() - started,
      transition: lastError ? null : envelope.transition,
      error: lastError,
    });
    if (!lastError) {
      run.sessions[stateName] = session;
      return envelope;
    }
    log(run, `state ${stateName} attempt ${attempt} invalid output: ${lastError} — ${attempt < 2 ? "retrying" : "giving up"}`);
  }
  throw new Error(`state '${stateName}' failed to produce a valid envelope: ${lastError}`);
}

// ---------- script states ----------

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${res.status}: ${(res.stderr || res.stdout || "").slice(0, 800)}`);
  }
  return res.stdout;
}

async function pollHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`backend at ${url} not healthy after ${timeoutMs / 1000}s`);
}

// Workers run npm in-container where only the workspace is mounted (/app),
// so a workspace package.json change can't update the ROOT package-lock.json —
// npm ci then fails EUSAGE in CI while every in-worktree suite is green (bit
// PR #343). The driver runs on the host, so repair here before pushing.
// Non-fatal by design: on any error we log and proceed — CI stays the backstop.
function syncRootLockfile(run, worktree, integrationBranch, issue) {
  const changed = spawnSync("git", ["diff", "--name-only", `origin/${integrationBranch}...HEAD`], {
    cwd: worktree,
    encoding: "utf8",
  });
  if (changed.status !== 0 || !/(^|\/)package\.json$/m.test(changed.stdout)) return;
  log(run, "package.json changed — syncing root package-lock.json (lock-only)");
  const sync = spawnSync("npm", ["install", "--package-lock-only"], { cwd: worktree, encoding: "utf8" });
  if (sync.status !== 0) {
    log(run, `lockfile sync failed (non-fatal): ${(sync.stderr || "").slice(0, 300)}`);
    return;
  }
  const dirty = spawnSync("git", ["diff", "--quiet", "--", "package-lock.json"], { cwd: worktree });
  if (dirty.status !== 1) return; // lock already in sync
  try {
    sh("git", ["add", "package-lock.json"], { cwd: worktree });
    sh("git", ["commit", "-m", `build: sync root package-lock with workspace dep changes (#${issue})`], { cwd: worktree });
    log(run, "committed root package-lock sync");
  } catch (err) {
    log(run, `lockfile commit failed (non-fatal): ${err.message.slice(0, 300)}`);
  }
}

// Attach `branch` as an isolated worktree stack and seed ctx with its coords.
// Self-heal on "no free slots": a leaked slot (reaped run that never freed its
// worktree) must not brick a fresh run — reconcile and retry once. No `protect`
// list is needed here (deliberate): this run has a live pid and a fresh
// heartbeat, so runState classifies it live; protect only exists for the
// batch-adoption race where a resumed child hasn't overwritten a stale
// pid in run.json yet.
async function attachWorktreeStack(run, branch) {
  try {
    sh(join(SKILL_DIR, "..", "worktree", "worktree.sh"), ["create", branch, "--up"], { cwd: ROOT });
  } catch (err) {
    if (!/no free slots/i.test(err.message)) throw err;
    log(run, "no free worktree slots — running janitor reconcile, then retrying once");
    const { reapedRuns, freedSlots } = janitorReconcile({ log: (m) => log(run, m) });
    log(run, `janitor: reaped ${reapedRuns.length} run(s), freed ${freedSlots.length} slot(s)`);
    sh(join(SKILL_DIR, "..", "worktree", "worktree.sh"), ["create", branch, "--up"], { cwd: ROOT });
  }
  const registry = JSON.parse(readFileSync(join(ROOT, ".claude", "worktrees", "registry.json"), "utf8"));
  const slot = registry[branch];
  if (!slot) throw new Error(`worktree.sh did not register a slot for ${branch}`);
  const backendUrl = `http://localhost:${4000 + slot * 10}/api`;
  log(run, `worktree ${branch} on slot ${slot}; waiting for backend health…`);
  // /api/health is the public probe — /api/characters 401s behind auth.
  await pollHealth(`${backendUrl}/health`, 10 * 60_000);
  Object.assign(run.ctx, {
    branch,
    slot,
    worktree: join(ROOT, ".claude", "worktrees", branch),
    backendUrl,
    frontendUrl: `http://localhost:${5173 + slot * 10}`,
  });
  return slot;
}

// The responder's fix/pr* worktree is single-cycle by design — tear it down on
// both success paths (non-fatal; the janitor sweeps it once the run is terminal).
function teardownFixWorktree(run, branch) {
  const res = spawnSync(join(SKILL_DIR, "..", "worktree", "worktree.sh"), ["rm", branch], { cwd: ROOT });
  log(run, res.status === 0 ? `responder worktree ${branch} torn down` : `responder worktree ${branch} teardown failed (non-fatal; janitor will sweep)`);
}

const HANDLERS = {
  // Claim the issue via assignee so concurrent runs can't both build it —
  // GetWork excludes assigned issues, so 'taken' loops back for a re-pick.
  async claimIssue(run) {
    const { issue } = run.ctx;
    const view = sh("gh", ["issue", "view", String(issue), "--json", "assignees"], { cwd: ROOT });
    if (JSON.parse(view).assignees.length > 0) {
      return { transition: "taken", payload: {}, summary: `issue #${issue} already claimed — re-picking` };
    }
    sh("gh", ["issue", "edit", String(issue), "--add-assignee", "@me"], { cwd: ROOT });
    return { transition: "claimed", payload: { claimed: true }, summary: `claimed issue #${issue}` };
  },

  async setupWorktree(run) {
    const { issue, slug, integrationBranch } = run.ctx;
    const branch = `feat/issue-${issue}-${slug}`;
    // Fork the branch from origin/<integration> WITHOUT touching the main
    // checkout's HEAD — worktree.sh attaches an existing branch as-is.
    sh("git", ["fetch", "origin", integrationBranch], { cwd: ROOT });
    const exists = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: ROOT });
    if (exists.status !== 0) sh("git", ["branch", branch, `origin/${integrationBranch}`], { cwd: ROOT });
    const slot = await attachWorktreeStack(run, branch);
    // NOTE: don't seed a test character here — auth.test.ts's fixture cleanup
    // deletes the dev-user-local User (cascading its characters), so anything
    // created before the Worker's full-suite run is guaranteed to be wiped.
    // The Reviewer creates its own character AFTER its test runs instead.
    return { transition: "ok", payload: { branch, slot }, summary: `worktree ${branch} up on slot ${slot}` };
  },

  async setupPrWorktree(run) {
    const { prNumber, prHead, prCycle } = run.ctx;
    if (!prNumber || !prHead) throw new Error("pr-response machine needs --pr and --pr-head");
    // A FRESH fix/pr<N>-c<cycle> branch off the PR head — never the PR's own
    // feat/issue-* branch (the janitor reaps worktrees whose owning run is
    // terminal, and the original issue run is). The cycle number keeps relaunch
    // names unique; -f resets any stale local branch to the pushed head.
    const branch = `fix/pr${prNumber}-c${prCycle ?? 1}`;
    sh("git", ["fetch", "origin", prHead], { cwd: ROOT });
    sh("git", ["branch", "-f", branch, `origin/${prHead}`], { cwd: ROOT });
    const slot = await attachWorktreeStack(run, branch);
    return { transition: "ok", payload: { branch, slot }, summary: `responder worktree ${branch} up on slot ${slot} (PR #${prNumber}, head ${prHead})` };
  },

  async pushFix(run) {
    const { worktree, branch, prNumber, prHead } = run.ctx;
    // Deterministic push to the PR's own head — re-triggers claude-review; the
    // original Submit already armed auto-merge, so a green re-run lands the PR.
    sh("git", ["push", "origin", `HEAD:${prHead}`], { cwd: worktree });
    run.ctx.pushed = true;
    teardownFixWorktree(run, branch);
    return { transition: "ok", payload: { pushed: true }, summary: `pushed fixes to ${prHead} (PR #${prNumber}); review re-running` };
  },

  async flagNeedsHuman(run) {
    const { prNumber, branch } = run.ctx;
    const file = join(run.dir, "needs-human.md");
    writeFileSync(
      file,
      [
        "## ⚠ autodev responder: needs human review-response",
        "",
        `**Why:** ${run.ctx.reason ?? "responder cycles exhausted without convergence"}`,
        "",
        "No push will re-trigger the required `claude-review` check, so a human must adjudicate: fix a finding, or dismiss/override the review. Dependent batch issues stay queued (not skipped) and unblock when this PR merges.",
        "",
        `_autodev run ${run.id} (responder cycle ${run.ctx.prCycle ?? 1})_`,
      ].join("\n"),
    );
    sh("gh", ["pr", "comment", String(prNumber), "--body-file", file], { cwd: ROOT });
    run.ctx.needsHuman = true;
    teardownFixWorktree(run, branch);
    return { transition: "ok", payload: { needsHuman: true }, summary: `PR #${prNumber} flagged for human review-response` };
  },

  async submit(run) {
    const { branch, worktree, integrationBranch, issue, prTitle } = run.ctx;
    syncRootLockfile(run, worktree, integrationBranch, issue);
    sh("git", ["push", "-u", "origin", branch], { cwd: worktree });
    const stepsFile = join(run.dir, "steps.jsonl");
    const steps = existsSync(stepsFile)
      ? readFileSync(stepsFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const costTable = steps
      .map((s) => `| ${s.state} | ${s.turns ?? "-"} | $${(s.costUsd ?? 0).toFixed(2)} |`)
      .join("\n");
    const body = [
      `Closes #${issue}`,
      "",
      `## Summary`,
      ...(run.ctx.chunks ?? []).map((c) => `- ${typeof c === "string" ? c : JSON.stringify(c)}`),
      "",
      `**Tests:** ${run.ctx.testsSummary ?? "see run ledger"}`,
      `**Review:** approved after ${run.loops["Reviewer->Worker"] ?? 0} fix cycle(s)`,
      run.ctx.uiVerified
        ? "**UI:** visually verified by the reviewer in the worktree stack (screenshots in the run ledger)"
        : run.ctx.uiSurface
          ? "**UI:** ⚠ surface NOT visually verified — run verify-frontend before relying on it"
          : "",
      run.ctx.budgetLanded
        ? `**⚠ Budget landed:** cost cap hit before the final internal re-review — last Worker pass reported green suites; CI + claude-review adjudicate. (${run.ctx.budgetLanded})`
        : "",
      ...(run.ctx.blockedWrites?.length
        ? [
            "",
            "## ⚠ Blocked writes",
            "The worker was permission-denied writing these files; intended content is in the run ledger payloads:",
            ...run.ctx.blockedWrites.map((w) => `- \`${w.path}\` — ${w.reason ?? "denied"}`),
          ]
        : []),
      "",
      `## autodev run ${run.id}`,
      "| state | turns | cost |",
      "|---|---|---|",
      costTable,
      `_total: $${run.costUsd.toFixed(2)}_`,
      "",
      "🤖 Generated with [Claude Code](https://claude.com/claude-code) autodev",
    ].join("\n");
    writeFileSync(join(run.dir, "pr-body.md"), body);
    const out = sh(
      "gh",
      ["pr", "create", "--base", integrationBranch, "--head", branch, "--title", `${prTitle} (#${issue})`, "--body-file", join(run.dir, "pr-body.md")],
      { cwd: worktree },
    );
    const prUrl = out.trim().split("\n").pop();
    run.ctx.prUrl = prUrl;
    // Arm auto-merge (squash, per the feature->staging convention) so the PR
    // lands itself once checks pass. Non-fatal: an unprotected base (e.g. an
    // integration branch) doesn't support auto-merge — the PR just stays open.
    let armed = false;
    if (run.ctx.autoMerge !== false) {
      armed = spawnSync("gh", ["pr", "merge", prUrl, "--squash", "--auto"], { cwd: worktree }).status === 0;
    }
    // ready -> in-staging: shipped issues stay open until promote-to-main
    // ("Closes #" fires there), and stale `ready` labels let GetWork re-pick
    // already-built work (bit #300). Tolerate either label being absent.
    spawnSync("gh", ["issue", "edit", String(issue), "--remove-label", "ready"], { cwd: ROOT });
    spawnSync("gh", ["issue", "edit", String(issue), "--add-label", "in-staging"], { cwd: ROOT });
    return { transition: "ok", payload: { prUrl, autoMergeArmed: armed }, summary: `PR opened: ${prUrl}${armed ? " (auto-merge armed)" : ""}` };
  },

  async applyFlag(run) {
    const { issue, comment, interactiveOnly } = run.ctx;
    const file = join(run.dir, "flag-comment.md");
    writeFileSync(file, comment);
    sh("gh", ["issue", "comment", String(issue), "--body-file", file], { cwd: ROOT });
    // A `.claude/`-deliverable issue (interactiveOnly) is refined + correct — just not
    // headless-buildable — so tag `needs-interactive` and KEEP `ready` (a human can
    // build it). Everything else is a real scope gap: `needs-refinement`, drop `ready`.
    const label = interactiveOnly ? "needs-interactive" : "needs-refinement";
    sh("gh", ["issue", "edit", String(issue), "--add-label", label], { cwd: ROOT });
    if (!interactiveOnly) {
      spawnSync("gh", ["issue", "edit", String(issue), "--remove-label", "ready"], { cwd: ROOT }); // tolerate absence
    }
    spawnSync("gh", ["issue", "edit", String(issue), "--remove-assignee", "@me"], { cwd: ROOT }); // release the claim
    return { transition: "ok", payload: {}, summary: `issue #${issue} flagged ${label}` };
  },

  async fail(run) {
    const { issue, failure, branch, worktree, integrationBranch } = run.ctx;
    // Preserve committed work remotely: the Worker's bashDeny blocks `git push`
    // and only Submit pushes, so without this a failed run's commits exist only
    // in the local worktree (last night's #124/#331 each stranded a full
    // implementation). The driver itself is unrestricted — push from here.
    let pushedLine = "";
    if (worktree && branch && existsSync(worktree)) {
      const ahead = spawnSync("git", ["rev-list", "--count", `origin/${integrationBranch}..HEAD`], {
        cwd: worktree,
        encoding: "utf8",
      });
      const commits = ahead.status === 0 ? Number(ahead.stdout.trim()) : 0;
      if (commits > 0) {
        const push = spawnSync("git", ["push", "-u", "origin", branch], { cwd: worktree });
        if (push.status === 0) {
          const slugRes = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
            cwd: ROOT,
            encoding: "utf8",
          });
          const slug = slugRes.status === 0 ? slugRes.stdout.trim() : null;
          const compare = slug ? ` — https://github.com/${slug}/compare/${integrationBranch}...${branch}` : "";
          pushedLine = `**Partial work pushed:** \`${branch}\` (${commits} commit${commits === 1 ? "" : "s"})${compare}`;
          log(run, `pushed partial work: ${branch} (${commits} commits)`);
        } else {
          log(run, `failed to push partial work on ${branch} (non-fatal)`);
        }
      }
    }
    // ctx.claimed guards against commenting on an issue this run never owned —
    // a ClaimIssue->GetWork loop exhaust reaches Fail with ctx.issue set to the
    // last-checked (someone else's) issue.
    if (issue && run.ctx.claimed) {
      const file = join(run.dir, "fail-comment.md");
      writeFileSync(
        file,
        [
          "Automated build via autodev could not complete.",
          "",
          `**Why it failed:** ${failure ?? "unknown"}`,
          `**Run ledger:** \`${run.dir}\``,
          run.ctx.worktree ? `**Worktree left intact for inspection:** \`${run.ctx.worktree}\`` : "",
          pushedLine,
        ].join("\n"),
      );
      spawnSync("gh", ["issue", "comment", String(issue), "--body-file", file], { cwd: ROOT });
      // No relabel here: a build/infra failure is not a scope problem. Only the
      // FlagIssue path (unbuildable scope) applies needs-refinement.
      spawnSync("gh", ["issue", "edit", String(issue), "--remove-assignee", "@me"], { cwd: ROOT }); // release the claim
    }
    return { transition: "ok", payload: {}, summary: `run failed: ${failure ?? "unknown"}` };
  },
};

// ---------- ledger ----------

function log(run, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(run.dir, "log.txt"), line + "\n");
}

function ledgerStep(run, record) {
  appendFileSync(join(run.dir, "steps.jsonl"), JSON.stringify({ step: run.step, ...record }) + "\n");
}

function saveRun(run) {
  // Atomic (tmp+rename): the janitor and batch orchestrator read run.json
  // concurrently — a torn read must never look like a corrupt/dead run.
  const tmp = join(run.dir, "run.json.tmp");
  writeFileSync(
    tmp,
    JSON.stringify(
      {
        id: run.id,
        machine: run.machine.name,
        status: run.status,
        currentState: run.currentState,
        step: run.step,
        costUsd: run.costUsd,
        failedAt: run.failedAt ?? null,
        retryable: run.retryable ?? false,
        retryAt: run.retryAt ?? null,
        maxCostUsd: run.maxCostUsd ?? null,
        loops: run.loops,
        sessions: run.sessions,
        ctx: run.ctx,
        startedAt: run.startedAt,
        // Liveness signal for the janitor: pid + a heartbeat refreshed every
        // 30s by the timer in execute() (and on every state transition).
        pid: process.pid,
        lastHeartbeat: Date.now(),
      },
      null,
      2,
    ),
  );
  renameSync(tmp, join(run.dir, "run.json"));
}

// ---------- main loop ----------

async function execute(run) {
  const { machine } = run;
  const budget = machine.budget ?? {};
  saveRun(run);
  // Heartbeat: agent states legitimately run for up to wallMinutes (~30 min)
  // between transitions, so liveness needs its own timer — it keeps beating
  // while invokeClaude awaits. unref() lets the process exit without teardown
  // on every exit path. Synchronous script work (spawnSync) can starve it for
  // minutes; the janitor's stale threshold (15 min) is sized for that.
  setInterval(() => saveRun(run), 30_000).unref();

  while (true) {
    const stateName = run.currentState;
    const def = machine.states[stateName];
    if (def.type === "terminal") {
      run.status = run.ctx.failure ? "failed" : "completed";
      break;
    }

    // Budgets — any breach reroutes to Fail (or hard-stops if already failing).
    const elapsedMin = (Date.now() - run.startedAt) / 60_000;
    const breach =
      run.step >= (budget.maxSteps ?? 30)
        ? `step budget (${budget.maxSteps}) exhausted`
        : run.costUsd >= (run.maxCostUsd ?? budget.maxCostUsd ?? Infinity)
          ? `cost budget ($${run.maxCostUsd ?? budget.maxCostUsd}) exhausted`
          : elapsedMin >= (budget.maxWallMinutes ?? Infinity)
            ? `wall-clock budget (${budget.maxWallMinutes}min) exhausted`
            : null;
    if (breach && stateName !== "Fail" && def.type === "agent") {
      // Graceful landing: a breach on the way INTO Reviewer means the last
      // Worker already reported done with green suites (ctx.prTitle set) —
      // submit with a ⚠ instead of failing and let CI + claude-review
      // adjudicate. (#126 died at 99%: final fix committed+green, budget
      // breached before the third internal review; its salvage PR then passed
      // CI review unchanged.) Script states are $0 and never budget-gated.
      if (stateName === "Reviewer" && run.ctx.prTitle && machine.states.Submit) {
        run.ctx.budgetLanded = breach;
        run.currentState = "Submit";
        log(run, `BUDGET-LAND: ${breach} — last Worker was green, skipping re-review → Submit`);
        saveRun(run);
        continue;
      }
      run.ctx.failure = breach;
      run.currentState = machine.states.Fail ? "Fail" : "Done";
      log(run, `BUDGET: ${breach} → ${run.currentState}`);
      saveRun(run);
      continue;
    }

    run.step++;
    log(run, `step ${run.step}: entering ${stateName} (${def.type})${run.dryRun ? " [dry-run]" : ""}`);

    let envelope;
    try {
      envelope =
        def.type === "agent"
          ? await runAgentState(stateName, def, run)
          : run.dryRun
            ? { transition: Object.keys(def.transitions)[0], payload: {}, summary: `[dry-run script ${def.handler}]` }
            : await HANDLERS[def.handler](run);
    } catch (err) {
      if (stateName === "Fail") {
        log(run, `Fail handler itself errored: ${err.message}`);
        run.status = "failed";
        break;
      }
      // Rate limit (tempfail): don't enter Fail — the issue claim and worktree
      // must survive. Persist retryAt + the mid-state session, exit 75
      // (EX_TEMPFAIL) so an orchestrator can `fsm.mjs resume <run-dir>` after
      // the window resets.
      if (err.tempfail) {
        run.failedAt = stateName;
        run.retryable = true;
        run.retryAt = err.retryAt;
        run.status = "retry-scheduled";
        log(run, `TEMPFAIL in ${stateName}: ${err.message} — retryable at ${new Date(err.retryAt).toISOString()} (resume this run dir)`);
        saveRun(run);
        return;
      }
      run.ctx.failure = err.message;
      run.failedAt = stateName; // resume re-enters here by default
      run.currentState = machine.states.Fail ? "Fail" : "Done";
      log(run, `ERROR in ${stateName}: ${err.message} → ${run.currentState}`);
      saveRun(run);
      continue;
    }

    // Script states ledger here; agent states already ledger per attempt.
    if (def.type === "script") {
      ledgerStep(run, { state: stateName, handler: def.handler, costUsd: 0, transition: envelope.transition });
    }

    // Merge payload into ctx (payload keys win) and persist it.
    Object.assign(run.ctx, envelope.payload);
    writeFileSync(join(run.dir, "payloads", `${run.step}-${stateName}.json`), JSON.stringify(envelope, null, 2));
    log(run, `${stateName} → '${envelope.transition}': ${envelope.summary}`);

    if (run.only) {
      run.status = "only-state-done";
      break;
    }

    const next = def.transitions[envelope.transition];
    const edge = `${stateName}->${next}`;
    const limit = machine.loopLimits?.[edge];
    if (limit !== undefined) {
      run.loops[edge] = (run.loops[edge] ?? 0) + 1;
      if (run.loops[edge] > limit) {
        run.ctx.failure = `loop limit on ${edge} (${limit}) exceeded`;
        run.currentState = "Fail";
        log(run, `LOOP LIMIT: ${edge} exceeded ${limit} → Fail`);
        saveRun(run);
        continue;
      }
    }
    run.currentState = next;
    saveRun(run);
  }

  saveRun(run);
  log(run, `run ${run.status} — ${run.step} steps, $${run.costUsd.toFixed(2)}${run.ctx.prUrl ? `, PR: ${run.ctx.prUrl}` : ""}`);
}

// ---------- entry ----------

// With --issue given, skip discovery and start at GetWork's 'found' successor.
function afterGetWork(machine) {
  const getWork = machine.states[machine.initial];
  return getWork?.transitions?.found ?? machine.initial;
}

const { cmd, target, opts } = parseArgs(process.argv.slice(2));

if (cmd === "run") {
  const machine = loadMachine(target);
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}${opts.issue ? `-issue-${opts.issue}` : ""}`;
  const dir = join(RUNS_DIR, id);
  mkdirSync(join(dir, "payloads"), { recursive: true });
  const run = {
    id,
    dir,
    machine,
    status: "running",
    currentState: opts.only ?? opts.start ?? (opts.issue ? afterGetWork(machine) : machine.initial),
    step: 0,
    costUsd: 0,
    loops: {},
    sessions: {},
    ctx: { ...(machine.context ?? {}), ...(opts.issue ? { issue: opts.issue } : {}) },
    startedAt: Date.now(),
    dryRun: opts.dryRun,
    only: opts.only,
  };
  if (opts.integration) run.ctx.integrationBranch = opts.integration;
  if (opts.pr) Object.assign(run.ctx, { prNumber: opts.pr, prHead: opts.prHead, prCycle: opts.prCycle ?? 1 });
  if (opts.maxCost) run.maxCostUsd = opts.maxCost;
  await execute(run);
  process.exit(run.status === "retry-scheduled" ? 75 : run.status === "failed" ? 1 : 0);
} else if (cmd === "resume") {
  const dir = resolve(target);
  const saved = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  const machine = loadMachine(saved.machine);
  const run = {
    ...saved,
    dir,
    machine,
    status: "running",
    // Re-enter at --start, else the state that failed, else wherever it stopped.
    currentState: opts.start ?? saved.failedAt ?? saved.currentState,
    failedAt: null,
    startedAt: Date.now(), // wall budget restarts on resume
    dryRun: false,
    only: null,
  };
  log(run, `resuming at ${run.currentState}`);
  delete run.ctx.failure;
  run.retryable = false;
  run.retryAt = null;
  if (opts.maxCost) run.maxCostUsd = opts.maxCost;
  await execute(run);
  process.exit(run.status === "retry-scheduled" ? 75 : run.status === "failed" ? 1 : 0);
} else {
  die(`unknown command '${cmd}'`);
}
