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
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SKILL_DIR, "../../..");
const RUNS_DIR = join(ROOT, ".claude", "autodev", "runs");

// ---------- CLI ----------

function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  const opts = { issue: null, integration: null, start: null, only: null, dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--issue") opts.issue = Number(rest[++i]);
    else if (a === "--integration") opts.integration = rest[++i];
    else if (a === "--start") opts.start = rest[++i];
    else if (a === "--only") opts.only = rest[++i];
    else if (a === "--dry-run") opts.dryRun = true;
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

function buildArgs(def, prompt, { resumeSession } = {}) {
  const args = ["-p", prompt, "--output-format", "json", "--setting-sources", "project"];
  if (resumeSession) args.push("--resume", resumeSession);
  if (def.model) args.push("--model", def.model);
  if (def.tools !== undefined) args.push("--tools", def.tools);
  if (def.allowedTools?.length) args.push("--allowedTools", ...def.allowedTools);
  if (def.disallowedTools?.length) args.push("--disallowedTools", ...def.disallowedTools);
  if (def.permissionMode) args.push("--permission-mode", def.permissionMode);
  if (def.maxTurns && supportsFlag("--max-turns")) args.push("--max-turns", String(def.maxTurns));
  if (def.maxBudgetUsd && supportsFlag("--max-budget-usd")) args.push("--max-budget-usd", String(def.maxBudgetUsd));
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
  while (attempt < 2) {
    attempt++;
    // Retry resumes the failed session with just the error; if there is no
    // session to resume (stdout wasn't JSON), re-send the full prompt instead.
    const promptForAttempt =
      attempt === 1
        ? prompt
        : session
          ? `Your previous final message was invalid: ${lastError}\nRe-emit ONLY the corrected fenced JSON envelope.` +
            envelopeEpilogue(def)
          : `${prompt}\n\nNOTE: your previous attempt failed with: ${lastError}`;
    const args = buildArgs(def, promptForAttempt, { resumeSession: attempt === 1 ? resumeSession : session });
    const started = Date.now();
    const res = await invokeClaude(stateName, def, args, cwd, run);
    writeFileSync(join(run.dir, `raw-${run.step}-${stateName}-a${attempt}.json`), res.stdout || res.stderr);
    if (res.timedOut) throw new Error(`state '${stateName}' exceeded its ${def.wallMinutes ?? 30}min wall clock`);
    if (res.code !== 0) throw new Error(`state '${stateName}' claude exited ${res.code}: ${res.stderr.slice(0, 500)}`);

    const { envelope, out, error } = parseEnvelope(res.stdout);
    if (out?.session_id) session = out.session_id;
    const costUsd = out?.total_cost_usd ?? 0;
    run.costUsd += costUsd;
    lastError = error ?? (envelope ? validateEnvelope(def, envelope) : "no envelope");
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

const HANDLERS = {
  async setupWorktree(run) {
    const { issue, slug, integrationBranch } = run.ctx;
    const branch = `feat/issue-${issue}-${slug}`;
    // Fork the branch from origin/<integration> WITHOUT touching the main
    // checkout's HEAD — worktree.sh attaches an existing branch as-is.
    sh("git", ["fetch", "origin", integrationBranch], { cwd: ROOT });
    const exists = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: ROOT });
    if (exists.status !== 0) sh("git", ["branch", branch, `origin/${integrationBranch}`], { cwd: ROOT });
    sh(join(SKILL_DIR, "..", "worktree", "worktree.sh"), ["create", branch, "--up"], { cwd: ROOT });
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
    return { transition: "ok", payload: { branch, slot }, summary: `worktree ${branch} up on slot ${slot}` };
  },

  async submit(run) {
    const { branch, worktree, integrationBranch, issue, prTitle } = run.ctx;
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
    return { transition: "ok", payload: { prUrl }, summary: `PR opened: ${prUrl}` };
  },

  async applyFlag(run) {
    const { issue, comment } = run.ctx;
    const file = join(run.dir, "flag-comment.md");
    writeFileSync(file, comment);
    sh("gh", ["issue", "comment", String(issue), "--body-file", file], { cwd: ROOT });
    sh("gh", ["issue", "edit", String(issue), "--add-label", "needs-refinement"], { cwd: ROOT });
    spawnSync("gh", ["issue", "edit", String(issue), "--remove-label", "ready"], { cwd: ROOT }); // tolerate absence
    return { transition: "ok", payload: {}, summary: `issue #${issue} flagged needs-refinement` };
  },

  async fail(run) {
    const { issue, failure } = run.ctx;
    if (issue) {
      const file = join(run.dir, "fail-comment.md");
      writeFileSync(
        file,
        [
          "Automated build via autodev could not complete.",
          "",
          `**Why it failed:** ${failure ?? "unknown"}`,
          `**Run ledger:** \`${run.dir}\``,
          run.ctx.worktree ? `**Worktree left intact for inspection:** \`${run.ctx.worktree}\`` : "",
        ].join("\n"),
      );
      spawnSync("gh", ["issue", "comment", String(issue), "--body-file", file], { cwd: ROOT });
      // No relabel here: a build/infra failure is not a scope problem. Only the
      // FlagIssue path (unbuildable scope) applies needs-refinement.
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
  writeFileSync(
    join(run.dir, "run.json"),
    JSON.stringify(
      {
        id: run.id,
        machine: run.machine.name,
        status: run.status,
        currentState: run.currentState,
        step: run.step,
        costUsd: run.costUsd,
        failedAt: run.failedAt ?? null,
        loops: run.loops,
        sessions: run.sessions,
        ctx: run.ctx,
        startedAt: run.startedAt,
      },
      null,
      2,
    ),
  );
}

// ---------- main loop ----------

async function execute(run) {
  const { machine } = run;
  const budget = machine.budget ?? {};
  saveRun(run);

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
        : run.costUsd >= (budget.maxCostUsd ?? Infinity)
          ? `cost budget ($${budget.maxCostUsd}) exhausted`
          : elapsedMin >= (budget.maxWallMinutes ?? Infinity)
            ? `wall-clock budget (${budget.maxWallMinutes}min) exhausted`
            : null;
    if (breach && stateName !== "Fail") {
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
  await execute(run);
  process.exit(run.status === "failed" ? 1 : 0);
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
  await execute(run);
  process.exit(run.status === "failed" ? 1 : 0);
} else {
  die(`unknown command '${cmd}'`);
}
