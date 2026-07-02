#!/usr/bin/env node
/**
 * PreToolUse guard for autodev FSM states.
 *
 * fsm.mjs wires this hook into each headless state via a generated --settings
 * file and sets FSM_STATE + FSM_MACHINE in the child's env. The hook applies
 * the state's `bashDeny` / `bashAllow` regexes (from the machine JSON) to every
 * Bash command — a second wall behind --allowedTools that also catches chained
 * commands (`a && b`), pipes, and `sh -c` wrappers that prefix-matching misses.
 * Exit 2 + stderr = deny and show the message to the model (same contract as
 * block-project-artifacts.mjs).
 */
import { readFileSync } from "node:fs";

const state = process.env.FSM_STATE ?? "";
const machinePath = process.env.FSM_MACHINE ?? "";
if (!state || !machinePath) process.exit(0); // not running under the FSM

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(await readStdin());
} catch {
  process.exit(0); // never break the tool call on a parse hiccup
}
if ((payload.tool_name ?? "") !== "Bash") process.exit(0);

let def;
try {
  def = JSON.parse(readFileSync(machinePath, "utf8")).states?.[state] ?? {};
} catch {
  process.exit(0); // unreadable machine file — fall back to --allowedTools alone
}

const command = payload.tool_input?.command ?? "";
const deny = (def.bashDeny ?? []).map((r) => new RegExp(r));
const allow = (def.bashAllow ?? []).map((r) => new RegExp(r));

// Split on shell separators so `allowed-cmd && sneaky-cmd` is judged per
// segment — but NOT inside quotes, or `sh -c 'a && b'` would split its payload
// and false-block legit container commands. Each segment is trimmed and
// stripped of leading env assignments (FOO=bar cmd).
function segments(cmd) {
  const segs = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === ";" || ch === "\n") {
      segs.push(cur);
      cur = "";
    } else if (ch === "&" && cmd[i + 1] === "&") {
      segs.push(cur);
      cur = "";
      i++;
    } else if (ch === "|") {
      if (cmd[i + 1] === "|") i++;
      segs.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  segs.push(cur);
  return segs.map((s) => s.trim().replace(/^(?:\w+=[^\s]*\s+)+/, "")).filter(Boolean);
}

// Command substitution smuggles execution past the anchored segment checks
// (`^git push` can't match inside `git commit -m "$(git push)"`), so extract
// $(…)/backtick bodies and judge their contents too.
function substitutionBodies(cmd) {
  const bodies = [];
  const dollar = /\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g; // tolerates one nesting level
  let m;
  while ((m = dollar.exec(cmd)) !== null) bodies.push(m[1]);
  for (const tick of cmd.matchAll(/`([^`]*)`/g)) bodies.push(tick[1]);
  return bodies;
}

const segs = segments(command);
const denyTargets = [...segs, ...substitutionBodies(command).flatMap((b) => segments(b))];
for (const seg of denyTargets) {
  const hit = deny.find((r) => r.test(seg));
  if (hit) {
    block(
      `Blocked by autodev state '${state}': command segment '${seg}' matches denied pattern ${hit}.\n` +
        "This action is reserved for a later state of the pipeline — finish this state's goal and emit your transition instead.",
    );
  }
}
for (const seg of allow.length > 0 ? segs : []) {
  // Allowlist states are read-only probes — no legitimate use for substitution,
  // so block it outright rather than trying to allowlist its contents.
  if (/\$\(|`/.test(seg)) {
    block(
      `Blocked by autodev state '${state}': command substitution ($(…) or backticks) is not allowed in this state.\n` +
        "Run the inner command directly as its own tool call instead.",
    );
  }
  if (!/^cd\b/.test(seg) && !allow.some((r) => r.test(seg))) {
    block(
      `Blocked by autodev state '${state}': command segment '${seg}' is outside this state's allowlist.\n` +
        `Allowed patterns: ${(def.bashAllow ?? []).join("  ")}\n` +
        "Stay on this state's goal; anything else belongs to another state.",
    );
  }
}

process.exit(0);
