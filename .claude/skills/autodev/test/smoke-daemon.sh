#!/usr/bin/env bash
# Structural smoke test for batch-core.mjs / batch.mjs / autodevd.mjs.
# Zero Claude spend, zero repo side effects: stub fsm (test/stub-fsm.mjs),
# stub gh/worktree binaries, isolated runs/runtime/state dirs under a temp dir.
#
#   bash .claude/skills/autodev/test/smoke-daemon.sh
#
# Scenarios:
#   A  one-shot batch.mjs semantics unchanged (success / exit-75 park+resume / crash+resume→failed)
#   B  daemon: detached child survives kill -9 of the daemon; relaunch adopts it (no dup run)
#   C  second daemon launch while one is live is refused
#   D  stop --park: child SIGTERMed, entry parked as retry_wait (+ run.json
#      stamped retry-scheduled so the janitor treats it as parked), pidfile removed
#   E  idle daemon: batch completes → DONE+idle; plain stop drains immediately
#   F  janitor reconcile: reaps dead runs, frees terminal/stale slots, never
#      touches live, parked, or manual (no-run) worktrees
#   G  control channel: ping/status/pause/add/resume/stop/retry/shutdown over
#      the Unix socket; daemon-down ping exits 2 with relaunch hint; a stale
#      socket left by SIGKILL is reclaimed on relaunch
#   H  report rollup: per-issue outcome/cost/cycles both over the socket and
#      via --state-dir with no daemon (post-mortem mode)
#   I  review-blocked PR → responder launched (pr-response machine), pushes,
#      review greens, PR merges, dependent launches — zero-touch convergence;
#      classifyPrBlock base-scoped (open lookup only matches when --base is passed)
#   J  merge-lagging PR (all green, unmerged) classifies unknown → WAIT-MERGE log,
#      never a responder launch
#   K  non-converging review-block: responder runs exactly RESPOND_MAX (2) cycles,
#      then NEEDS-HUMAN flags the PR; entry stays waiting_merge, dependent stays
#      pending (never skipped), no FAIL
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"
echo "smoke: temp dir $T"

fail() { echo "SMOKE FAIL: $1" >&2; exit 1; }
pass() { echo "  ok: $1"; }

cleanup() {
  # Kill anything we started (daemons + stub children), ignore errors.
  [ -f "$T/runtime/autodevd.pid" ] && kill -9 "$(cat "$T/runtime/autodevd.pid")" 2>/dev/null || true
  pkill -f "stub-fsm.mjs" 2>/dev/null || true
  rm -rf "$T"
}
trap cleanup EXIT

mkdir -p "$T/bin" "$T/runs" "$T/runtime" "$T/worktrees"
echo '{}' > "$T/worktrees/registry.json"   # isolated slot registry — daemon-tick janitor must never see the real one

# gh stub: `pr list --search "(#N) in:title"` → merged iff a run of issue N has
# produced a PR (run.json with prUrl) — merged-only-after-PR mirrors reality and
# keeps loadOrInit's pre-merged detection from short-circuiting fresh issues.
cat > "$T/bin/gh" <<EOF
#!/usr/bin/env bash
n=""; state=""; base=""; prev=""
for a in "\$@"; do
  if [[ "\$a" =~ \(#([0-9]+)\) ]]; then n="\${BASH_REMATCH[1]}"; fi
  if [ "\$prev" = "--state" ]; then state="\$a"; fi
  if [ "\$prev" = "--base" ]; then base="\$a"; fi
  prev="\$a"
done
if [ -n "\$n" ] && [ "\$n" = "\${GH_STUB_REVIEW_BLOCKED:-}" ]; then
  # Designated review-blocked issue: mergeable open PR whose claude-review check
  # is FAILURE (classifyPrBlock reads the open search; isMerged the merged one).
  # The open lookup is base-scoped on purpose: classifyPrBlock must pass --base
  # like isMerged, else it won't match here — guards the --base finding.
  # Once the responder stub has dropped its marker, the merged search succeeds
  # (the pushed fix greened the review and auto-merge fired).
  if [ "\$state" = "open" ] && [ "\$base" = "staging" ]; then
    echo "[{\"number\":\$n,\"headRefName\":\"feat/issue-\$n-stub\",\"title\":\"stub pr (#\$n)\",\"mergeable\":\"MERGEABLE\",\"statusCheckRollup\":[{\"name\":\"claude-review\",\"status\":\"COMPLETED\",\"conclusion\":\"FAILURE\"},{\"name\":\"test\",\"status\":\"COMPLETED\",\"conclusion\":\"SUCCESS\"}]}]"
  elif [ "\$state" = "merged" ] && [ -f "$T/runs/responded-\$n" ]; then
    echo "[{\"title\":\"stub pr (#\$n)\"}]"
  else
    echo "[]"
  fi
elif [ -n "\$n" ] && [ "\$n" = "\${GH_STUB_MERGE_LAGGING:-}" ]; then
  # Designated merge-lagging issue: mergeable open PR, all checks green, never
  # merged → classifyPrBlock returns "unknown" (green + auto-merge just lagging).
  if [ "\$state" = "open" ]; then
    echo "[{\"title\":\"stub pr (#\$n)\",\"mergeable\":\"MERGEABLE\",\"statusCheckRollup\":[{\"name\":\"claude-review\",\"status\":\"COMPLETED\",\"conclusion\":\"SUCCESS\"},{\"name\":\"test\",\"status\":\"COMPLETED\",\"conclusion\":\"SUCCESS\"}]}]"
  else
    echo "[]"
  fi
elif [ -n "\$n" ] && grep -ql prUrl "$T/runs"/*-issue-"\$n"/run.json 2>/dev/null; then
  echo "[{\"title\":\"stub pr (#\$n)\"}]"
else
  echo "[]"
fi
EOF
# worktree stub: record invocations, always succeed.
cat > "$T/bin/worktree" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$T/worktree-calls.txt"
EOF
chmod +x "$T/bin/gh" "$T/bin/worktree"

export AUTODEV_FSM_BIN="$SKILL_DIR/test/stub-fsm.mjs"
export AUTODEV_RUNS_DIR="$T/runs"
export AUTODEV_RUNTIME_DIR="$T/runtime"
export AUTODEV_WORKTREES_DIR="$T/worktrees"
export AUTODEV_GH_BIN="$T/bin/gh"
export AUTODEV_WORKTREE_BIN="$T/bin/worktree"
export AUTODEV_SKIP_GIT_SYNC=1

# jq-free JSON assert: status <batch.json> <issue> <expected> (false while the file doesn't exist yet)
status_is() {
  node -e "try { process.exit(JSON.parse(require('fs').readFileSync('$1','utf8')).issues['$2'].status === '$3' ? 0 : 1) } catch { process.exit(1) }"
}
wait_for() { # wait_for <seconds> <desc> <cmd...>
  local deadline=$((SECONDS + $1)); shift
  local desc="$1"; shift
  until "$@"; do
    [ $SECONDS -ge $deadline ] && fail "timeout waiting for: $desc"
    sleep 0.5
  done
}

# ---------- A: one-shot batch.mjs semantics ----------
echo "A: one-shot batch semantics"
A="$T/state-a"
node "$SKILL_DIR/batch.mjs" 9900 9901 9902 --poll 1 --grace 30 --state-dir "$A" > "$T/a.out" 2>&1
status_is "$A/batch.json" 9900 merged || fail "A: 9900 should be merged"
status_is "$A/batch.json" 9901 merged || fail "A: 9901 should be merged after exit-75 park + resume"
status_is "$A/batch.json" 9902 failed || fail "A: 9902 should be failed after crash + one resume"
grep -q "RETRY-WAIT #9901" "$A/orchestrator.log" || fail "A: missing exit-75 RETRY-WAIT log"
grep -q "CRASH #9902" "$A/orchestrator.log" || fail "A: missing one-resume CRASH log"
grep -q "stub/issue-9900" "$T/worktree-calls.txt" || fail "A: 9900 worktree teardown not recorded"
pass "one-shot lifecycle (merged / exit-75 resume / crash→failed)"

# ---------- B: daemon detach + adopt ----------
echo "B: daemon detach + kill -9 + relaunch adoption"
B="$T/state-b"
node "$SKILL_DIR/autodevd.mjs" 9903 --poll 1 --grace 30 --state-dir "$B" > "$T/b1.out" 2>&1 &
disown
wait_for 15 "9903 running" status_is "$B/batch.json" 9903 running
DPID="$(cat "$T/runtime/autodevd.pid")"
SPID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$B/batch.json','utf8')).issues['9903'].pid)")"
kill -9 "$DPID"
sleep 1
kill -0 "$SPID" 2>/dev/null || fail "B: stub child died with the daemon (not detached)"
pass "detached child survived daemon kill -9"

RUNDIRS_BEFORE="$(ls -d "$T/runs"/*-issue-9903 | wc -l | tr -d ' ')"
node "$SKILL_DIR/autodevd.mjs" --poll 1 --state-dir "$B" > "$T/b2.out" 2>&1 &
disown
wait_for 15 "relaunch adopts 9903" grep -qs "RECONCILE #9903 still running (pid $SPID alive) — adopting" "$B/orchestrator.log"
status_is "$B/batch.json" 9903 running || fail "B: 9903 should still be running after relaunch"
RUNDIRS_AFTER="$(ls -d "$T/runs"/*-issue-9903 | wc -l | tr -d ' ')"
[ "$RUNDIRS_BEFORE" = "$RUNDIRS_AFTER" ] || fail "B: relaunch spawned a duplicate run"
kill -0 "$SPID" 2>/dev/null || fail "B: adopted child was killed by relaunch"
pass "relaunch adopted the surviving child (same pid, no duplicate run)"

# ---------- C: second launch refused ----------
echo "C: second daemon refused"
if node "$SKILL_DIR/autodevd.mjs" 9903 --state-dir "$B" > "$T/c.out" 2>&1; then
  fail "C: second daemon launch should exit nonzero"
fi
grep -q "already running" "$T/c.out" || fail "C: refusal message missing"
pass "second launch refused with live-pid message"

# ---------- D: stop --park ----------
echo "D: stop --park parks the child and cleans up"
node "$SKILL_DIR/autodevd.mjs" stop --park > "$T/d.out" 2>&1
[ -f "$T/runtime/autodevd.pid" ] && fail "D: pidfile still present after stop"
kill -0 "$SPID" 2>/dev/null && fail "D: stub child still alive after park"
status_is "$B/batch.json" 9903 retry_wait || fail "D: 9903 should be parked as retry_wait"
node -e "
  const fs = require('fs');
  const b = JSON.parse(fs.readFileSync('$B/batch.json','utf8'));
  const run = JSON.parse(fs.readFileSync(b.issues['9903'].rundir + '/run.json','utf8'));
  process.exit(run.status === 'retry-scheduled' ? 0 : 1);
" || fail "D: parked run.json should be stamped retry-scheduled (janitor protection)"
pass "park: child SIGTERMed, entry retry_wait (run.json stamped parked), pidfile removed"

# ---------- E: idle daemon + plain stop ----------
echo "E: completed batch idles; plain stop drains immediately"
E="$T/state-e"
node "$SKILL_DIR/autodevd.mjs" 9900 --poll 1 --grace 30 --state-dir "$E" > "$T/e.out" 2>&1 &
disown
wait_for 20 "batch E completes" grep -qs "DONE all issues reached a terminal state" "$E/orchestrator.log"
status_is "$E/batch.json" 9900 merged || fail "E: 9900 should be merged"
[ -f "$T/runtime/autodevd.pid" ] || fail "E: daemon should still be resident (idle) after DONE"
node -e "process.exit(JSON.parse(require('fs').readFileSync('$E/batch.json','utf8')).completedAt ? 0 : 1)" || fail "E: completedAt not set"
node "$SKILL_DIR/autodevd.mjs" stop > "$T/e-stop.out" 2>&1
[ -f "$T/runtime/autodevd.pid" ] && fail "E: pidfile still present after stop"
pass "idle daemon stayed resident and stopped cleanly"

# ---------- F: janitor reconcile (unit, direct call) ----------
echo "F: janitor reconcile — reap dead, free stale/terminal, protect live/parked/manual"
FR="$T/janitor-runs"; FW="$T/janitor-worktrees"
mkdir -p "$FR" "$FW"
: > "$T/worktree-calls.txt"
sleep 300 & LIVE_PID=$!   # stands in for a live fsm child
disown

mkrun() { # mkrun <name> <branch> <status> <pid> <hbAgeMs>
  local d="$FR/2026-01-01T00-00-0$RANDOM-issue-$1"
  mkdir -p "$d"
  node -e "
    const [dir, branch, status, pid, hbAge] = process.argv.slice(1);
    require('fs').writeFileSync(dir + '/run.json', JSON.stringify({
      id: dir.split('/').pop(), status, costUsd: 1.23, currentState: 'Worker',
      ctx: { issue: 1, branch },
      ...(pid !== 'none' ? { pid: Number(pid), lastHeartbeat: Date.now() - Number(hbAge) } : {}),
    }, null, 2));
  " "$d" "$2" "$3" "$4" "${5:-0}"
  echo "$d"
}

RA=$(mkrun 8801 stub/bA running none)               # legacy frozen (no pid/hb) → reap + free slot
RB=$(mkrun 8802 stub/bB running "$LIVE_PID")        # live (pid alive, fresh hb) → untouched
RC=$(mkrun 8803 stub/bC retry-scheduled none)       # parked → untouched
RD=$(mkrun 8804 stub/bD completed none)             # terminal → slot freed, no reap
RG=$(mkrun 8805 stub/bG running "$LIVE_PID" 999999999)  # pid ALIVE but heartbeat ancient (> stale bound) → reap (zombie guard)
mkdir -p "$FW/stub/bA" "$FW/stub/bB" "$FW/stub/bC" "$FW/stub/bD" "$FW/stub/bF" "$FW/stub/bG"
node -e "require('fs').writeFileSync('$FW/registry.json', JSON.stringify({
  'stub/bA': 1, 'stub/bB': 2, 'stub/bC': 3, 'stub/bD': 4, 'stub/bE': 5, 'stub/bF': 6, 'stub/bG': 7,
}))"   # bE: no dir (stale reservation) → freed; bF: dir but no run (manual) → untouched

AUTODEV_RUNS_DIR="$FR" AUTODEV_WORKTREES_DIR="$FW" node -e "
  import('$SKILL_DIR/janitor.mjs').then(async (j) => {
    const res = j.reconcile({ log: console.error });
    console.log(JSON.stringify(res));
  });
" > "$T/f-result.json"

node -e "
  const fs = require('fs');
  const res = JSON.parse(fs.readFileSync('$T/f-result.json','utf8'));
  const calls = fs.readFileSync('$T/worktree-calls.txt','utf8');
  const runA = JSON.parse(fs.readFileSync('$RA/run.json','utf8'));
  const runB = JSON.parse(fs.readFileSync('$RB/run.json','utf8'));
  const runC = JSON.parse(fs.readFileSync('$RC/run.json','utf8'));
  const runG = JSON.parse(fs.readFileSync('$RG/run.json','utf8'));
  const assert = (c, m) => { if (!c) { console.error('F assert failed: ' + m); process.exit(1); } };
  assert(runA.status === 'failed' && runA.ctx.failure.includes('reaped'), 'dead run A finalized failed');
  assert(fs.readFileSync('$RA/steps.jsonl','utf8').includes('reaped'), 'run A steps.jsonl reap line');
  assert(runB.status === 'running', 'live run B untouched');
  assert(runC.status === 'retry-scheduled', 'parked run C untouched');
  assert(runG.status === 'failed', 'stale-heartbeat run G reaped despite live pid');
  for (const b of ['stub/bA','stub/bD','stub/bE','stub/bG']) assert(calls.includes('rm ' + b), b + ' slot freed');
  for (const b of ['stub/bB','stub/bC','stub/bF']) assert(!calls.includes('rm ' + b), b + ' NOT touched');
  assert(res.reapedRuns.length === 2 && res.freedSlots.length === 4, 'result counts (2 reaped, 4 freed)');
" || fail "F: janitor assertions failed (see above)"
kill "$LIVE_PID" 2>/dev/null || true
pass "janitor: reaped dead+stale-heartbeat runs, freed stale+terminal slots, protected live/parked/manual"

# ---------- G: control channel ----------
echo "G: control channel over the Unix socket"
G="$T/state-g"
CTL="$SKILL_DIR/autodevctl.mjs"
node "$SKILL_DIR/autodevd.mjs" 9903 --poll 1 --grace 30 --state-dir "$G" > "$T/g.out" 2>&1 &
disown
wait_for 15 "9903 running (G)" status_is "$G/batch.json" 9903 running

node "$CTL" ping > "$T/g-ping.out" || fail "G: ping should succeed against live daemon"
grep -q "pong pid=" "$T/g-ping.out" || fail "G: ping output malformed"
node "$CTL" status --json | node -e "
  let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
    const d=JSON.parse(s);
    process.exit(d.issues['9903'].status==='running' && d.daemon.pid>0 ? 0 : 1);
  });" || fail "G: status should show 9903 running"
pass "ping + status over the socket"

node "$CTL" pause > /dev/null
node -e "process.exit(JSON.parse(require('fs').readFileSync('$G/batch.json','utf8')).paused===true?0:1)" || fail "G: pause flag not set"
node "$CTL" add 9902 > /dev/null
status_is "$G/batch.json" 9902 pending || fail "G: added 9902 should be pending"
sleep 2.5   # >2 ticks: a paused batch must NOT launch the new issue
status_is "$G/batch.json" 9902 pending || fail "G: paused batch launched 9902 anyway"
node "$CTL" resume > /dev/null
wait_for 20 "9902 runs then fails after resume" status_is "$G/batch.json" 9902 failed
pass "pause gates launches; add enqueues; resume releases"

node "$CTL" stop 9903 > /dev/null
wait_for 10 "9903 stopped" status_is "$G/batch.json" 9903 failed
node -e "process.exit(JSON.parse(require('fs').readFileSync('$G/batch.json','utf8')).issues['9903'].stoppedBy==='ctl'?0:1)" || fail "G: 9903 should be stoppedBy ctl"
grep -q "rm stub/issue-9903" "$T/worktree-calls.txt" || fail "G: stop should tear down 9903's worktree"
pass "stop killed the child, marked failed (stoppedBy=ctl), tore down worktree"

node "$CTL" pause > /dev/null   # freeze launches so retry_wait is observable
node "$CTL" retry 9902 > /dev/null
status_is "$G/batch.json" 9902 retry_wait || fail "G: retry should park 9902 as retry_wait"
node "$CTL" reconcile > /dev/null || fail "G: reconcile verb should succeed"
node "$CTL" shutdown > /dev/null
wait_for 10 "daemon shut down via socket" bash -c "! [ -f '$T/runtime/autodevd.pid' ]"
[ -S "$T/runtime/autodevd.sock" ] && fail "G: socket file should be removed on graceful shutdown"
pass "retry + reconcile verbs; shutdown removed pidfile and socket"

rc=0
node "$CTL" ping > "$T/g-down.out" 2>&1 || rc=$?
[ "$rc" -eq 2 ] || fail "G: daemon-down ping should exit 2 (got $rc)"
grep -q "relaunch with" "$T/g-down.out" || fail "G: daemon-down ping should print relaunch hint"
pass "daemon-down ping exits 2 with relaunch hint"

# Stale socket reclaim: SIGKILL leaves the sock file behind; relaunch reclaims it.
node "$SKILL_DIR/autodevd.mjs" --poll 1 --state-dir "$G" > "$T/g2.out" 2>&1 &
disown
wait_for 15 "daemon G2 up" bash -c "[ -f '$T/runtime/autodevd.pid' ]"
kill -9 "$(cat "$T/runtime/autodevd.pid")"
sleep 0.5
[ -S "$T/runtime/autodevd.sock" ] || fail "G: SIGKILL should leave a stale socket for this test"
node "$SKILL_DIR/autodevd.mjs" --poll 1 --state-dir "$G" > "$T/g3.out" 2>&1 &
disown
wait_for 15 "stale socket reclaimed" grep -qs "CONTROL reclaimed stale socket" "$G/orchestrator.log"
node "$CTL" ping > /dev/null || fail "G: ping should work after stale-socket reclaim"
node "$CTL" shutdown --park > /dev/null
wait_for 10 "daemon G3 stopped" bash -c "! [ -f '$T/runtime/autodevd.pid' ]"
pass "stale socket reclaimed on relaunch; ping works; park-shutdown clean"

# ---------- H: report rollup ----------
echo "H: report rollup (socket + post-mortem --state-dir)"
# Post-mortem: no daemon is running; read scenario A's finished ledger directly.
node "$CTL" report --state-dir "$A" --json > "$T/h-report.json" || fail "H: report --state-dir should work with no daemon"
node -e "
  const r = JSON.parse(require('fs').readFileSync('$T/h-report.json','utf8'));
  const by = Object.fromEntries(r.rows.map((x) => [x.issue, x]));
  const assert = (c, m) => { if (!c) { console.error('H assert failed: ' + m); process.exit(1); } };
  assert(r.rows.length === 3, '3 rows');
  assert(by[9900].outcome === 'pr' && by[9900].detail.includes('example.test'), '9900 outcome pr + url');
  assert(by[9901].outcome === 'pr' && by[9901].rateRetries === 1, '9901 pr after 1 rate retry');
  assert(by[9902].outcome === 'failed', '9902 failed');
  assert(r.totalCostUsd > 0, 'total cost accumulated');
" || fail "H: post-mortem report assertions failed"
# Live: idle daemon on the same state dir serves the same rollup over the socket.
node "$SKILL_DIR/autodevd.mjs" --poll 1 --state-dir "$A" > "$T/h.out" 2>&1 &
disown
wait_for 15 "daemon H up" bash -c "[ -S '$T/runtime/autodevd.sock' ]"
node "$CTL" report > "$T/h-live.out" || fail "H: report verb over the socket failed"
{ grep -q "#9900" "$T/h-live.out" && grep -qF 'total: $' "$T/h-live.out"; } || fail "H: live report table malformed"
node "$CTL" shutdown > /dev/null
wait_for 10 "daemon H stopped" bash -c "! [ -f '$T/runtime/autodevd.pid' ]"
pass "report: correct rollup post-mortem and over the socket"

# ---------- I: review-blocked PR → responder → green → merge → dependent launches ----------
echo "I: review-block spawns responder; push greens review; merge unblocks dependent"
I="$T/state-i"
export GH_STUB_REVIEW_BLOCKED=9910
node "$SKILL_DIR/autodevd.mjs" 9910 9911:9910 --poll 1 --grace 2 --state-dir "$I" > "$T/i.out" 2>&1 &
disown
wait_for 25 "I: responder launched" grep -qs "RESPOND #9910 blocked on claude-review (all CI green) — launching responder (cycle 1/2) on PR #9910" "$I/orchestrator.log"
wait_for 25 "I: responder pushed" grep -qs "RESPOND-OK #9910 fixes pushed (cycle 1/2)" "$I/orchestrator.log"
wait_for 25 "I: 9910 merged after responder" status_is "$I/batch.json" 9910 merged
wait_for 25 "I: dependent 9911 merged" status_is "$I/batch.json" 9911 merged
grep -qs "FAIL #9910" "$I/orchestrator.log" && fail "I: review-blocked PR must not be marked FAIL"
grep -qs "NEEDS-HUMAN #9910" "$I/orchestrator.log" && fail "I: converged responder must not flag for a human"
node -e "
  const b = JSON.parse(require('fs').readFileSync('$I/batch.json','utf8'));
  process.exit(b.issues['9910'].respondCycles === 1 && !b.issues['9910'].responder ? 0 : 1);
" || fail "I: 9910 should record exactly 1 responder cycle and clear the responder flag"
node "$SKILL_DIR/autodevd.mjs" stop > "$T/i-stop.out" 2>&1
wait_for 10 "I: daemon stopped" bash -c "! [ -f '$T/runtime/autodevd.pid' ]"
unset GH_STUB_REVIEW_BLOCKED
pass "responder converged: RESPOND → push → merged → dependent launched and merged"

# ---------- J: merge-lagging PR (all green, not merged) → unknown → WAIT-MERGE, never a responder ----------
echo "J: green-but-lagging merge classifies unknown → WAIT-MERGE, no false responder launch"
J="$T/state-j"
export GH_STUB_MERGE_LAGGING=9920
node "$SKILL_DIR/autodevd.mjs" 9920 --poll 1 --grace 2 --state-dir "$J" > "$T/j.out" 2>&1 &
disown
# Key off the post-grace "merge status unclear" text (distinct from the on-entry
# "WAIT-MERGE #N (...) polling" line) so the negative check below can't race the
# grace window — classifyPrBlock has demonstrably run once this matches.
wait_for 25 "J: unclear-merge logged" grep -qs "#9920 merge status unclear (unknown)" "$J/orchestrator.log"
status_is "$J/batch.json" 9920 waiting_merge || fail "J: 9920 should stay waiting_merge while merge lags"
grep -qs "RESPOND #9920" "$J/orchestrator.log" && fail "J: unknown/lagging merge must NOT launch a responder"
node "$SKILL_DIR/autodevd.mjs" stop > "$T/j-stop.out" 2>&1
wait_for 10 "J: daemon stopped" bash -c "! [ -f '$T/runtime/autodevd.pid' ]"
unset GH_STUB_MERGE_LAGGING
pass "green-but-lagging merge kept waiting as WAIT-MERGE, no responder launch"

# ---------- K: non-converging responder → 2 cycles → NEEDS-HUMAN, dependent kept ----------
echo "K: stuck review-block burns both responder cycles then flags for a human"
K="$T/state-k"
export GH_STUB_REVIEW_BLOCKED=9930
export GH_STUB_REVIEW_STUCK=9930
node "$SKILL_DIR/autodevd.mjs" 9930 9931:9930 --poll 1 --grace 2 --state-dir "$K" > "$T/k.out" 2>&1 &
disown
wait_for 25 "K: responder cycle 1" grep -qs "launching responder (cycle 1/2) on PR #9930" "$K/orchestrator.log"
wait_for 25 "K: responder cycle 2" grep -qs "launching responder (cycle 2/2) on PR #9930" "$K/orchestrator.log"
wait_for 25 "K: NEEDS-HUMAN flagged" grep -qs "NEEDS-HUMAN #9930 responder cycles exhausted (2)" "$K/orchestrator.log"
sleep 3   # > one more grace window: cycles must NOT keep spawning past the cap
[ "$(grep -c "launching responder" "$K/orchestrator.log")" = "2" ] || fail "K: responder must run exactly 2 cycles, no more"
status_is "$K/batch.json" 9930 waiting_merge || fail "K: 9930 should stay waiting_merge after NEEDS-HUMAN (a manual fix can still merge)"
status_is "$K/batch.json" 9931 pending || fail "K: dependent 9931 must NOT be skipped on a review block"
grep -qs "FAIL #9930" "$K/orchestrator.log" && fail "K: review-blocked PR must never FAIL"
node -e "
  const b = JSON.parse(require('fs').readFileSync('$K/batch.json','utf8'));
  const e = b.issues['9930'];
  process.exit(e.respondCycles === 2 && e.humanFlagged === true && !e.responder ? 0 : 1);
" || fail "K: 9930 should record 2 cycles + humanFlagged"
node "$SKILL_DIR/autodevd.mjs" stop > "$T/k-stop.out" 2>&1
wait_for 10 "K: daemon stopped" bash -c "! [ -f '$T/runtime/autodevd.pid' ]"
unset GH_STUB_REVIEW_BLOCKED GH_STUB_REVIEW_STUCK
pass "stuck responder bounded at 2 cycles, PR flagged NEEDS-HUMAN, dependent kept pending, no FAIL"

echo "SMOKE PASS (all scenarios)"
