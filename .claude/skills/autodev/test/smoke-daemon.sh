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
n=""
for a in "\$@"; do
  if [[ "\$a" =~ \(#([0-9]+)\) ]]; then n="\${BASH_REMATCH[1]}"; fi
done
if [ -n "\$n" ] && grep -ql prUrl "$T/runs"/*-issue-"\$n"/run.json 2>/dev/null; then
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
mkdir -p "$FW/stub/bA" "$FW/stub/bB" "$FW/stub/bC" "$FW/stub/bD" "$FW/stub/bF"
node -e "require('fs').writeFileSync('$FW/registry.json', JSON.stringify({
  'stub/bA': 1, 'stub/bB': 2, 'stub/bC': 3, 'stub/bD': 4, 'stub/bE': 5, 'stub/bF': 6,
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
  const assert = (c, m) => { if (!c) { console.error('F assert failed: ' + m); process.exit(1); } };
  assert(runA.status === 'failed' && runA.ctx.failure.includes('reaped'), 'dead run A finalized failed');
  assert(fs.readFileSync('$RA/steps.jsonl','utf8').includes('reaped'), 'run A steps.jsonl reap line');
  assert(runB.status === 'running', 'live run B untouched');
  assert(runC.status === 'retry-scheduled', 'parked run C untouched');
  for (const b of ['stub/bA','stub/bD','stub/bE']) assert(calls.includes('rm ' + b), b + ' slot freed');
  for (const b of ['stub/bB','stub/bC','stub/bF']) assert(!calls.includes('rm ' + b), b + ' NOT touched');
  assert(res.reapedRuns.length === 1 && res.freedSlots.length === 3, 'result counts (1 reaped, 3 freed)');
" || fail "F: janitor assertions failed (see above)"
kill "$LIVE_PID" 2>/dev/null || true
pass "janitor: reaped dead run, freed stale+terminal slots, protected live/parked/manual"

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

echo "SMOKE PASS (all scenarios)"
