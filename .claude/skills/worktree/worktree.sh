#!/usr/bin/env bash
#
# worktree.sh — spin up isolated, parallel dev stacks, one per git worktree.
#
# Each worktree gets a port "slot" (1-9). Every port + the Compose project name
# is derived from the slot, so two worktrees never collide and each one gets its
# OWN Postgres volume (migrations in one are invisible to the others). Slot 0 is
# reserved for the main checkout on default ports.
#
#   ./.claude/skills/worktree/worktree.sh create <branch> [--up]   create worktree, assign slot, .env, npm ci
#   ./.claude/skills/worktree/worktree.sh up <branch>              docker compose up -d (build)
#   ./.claude/skills/worktree/worktree.sh down <branch>            docker compose down (keep volumes)
#   ./.claude/skills/worktree/worktree.sh ls                       table of worktrees, slots, URLs, status
#   ./.claude/skills/worktree/worktree.sh rm <branch>              down -v + remove worktree + free slot
#   ./.claude/skills/worktree/worktree.sh prune [--yes]            report/remove artifacts of worktrees already gone
#   ./.claude/skills/worktree/worktree.sh dir                      print where worktrees are placed
#
set -euo pipefail

# Repo root = three levels up from this script's dir
# (.claude/skills/worktree/). Resolve symlinks for safety.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Worktrees live BESIDE the repo, never inside it (#1457). Node resolves
# node_modules by walking UP, so a worktree nested in the checkout silently
# borrows the main tree's install and tsc/eslint/prisma then report green for a
# tree they never read; a sibling makes a missing install fail loudly instead.
# It also keeps rg/git grep/fallow in the main checkout from walking N copies of
# the codebase. Override for a different disk or layout.
WT_DIR="${CS_WORKTREE_DIR:-$(dirname "$ROOT")/.character-sheet-worktrees}"
# The registry travels WITH the trees it describes rather than staying in-repo:
# slots, the mkdir mutex and the trees are one unit of state, and leaving it
# behind would keep the repo needing the very ignore rule this move retires.
REGISTRY="$WT_DIR/registry.json"

# Worktrees created before #1457 still sit in-repo and still hold their slots, so
# reads union both registries while writes only ever land in the new one — a
# forgotten legacy entry that stopped reserving its slot would hand a create the
# ports of a running stack.
LEGACY_WT_DIR="$ROOT/.claude/worktrees"
LEGACY_REGISTRY="$LEGACY_WT_DIR/registry.json"

MAX_SLOT=9

die() { echo "error: $*" >&2; exit 1; }

# Compose project name: lowercase, non-alnum -> '-', collapse repeats, trim.
# The trailing newline is load-bearing: `live_projects` feeds a line reader, and
# without it every registered project ran together into one unterminated line
# that `read` discarded at EOF — so `live_artifacts` came out empty and `prune`
# saw every LIVE worktree's volumes as orphans.
project_name() {
  local b="$1"
  b="$(printf '%s' "$b" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  printf 'cs-%s\n' "$b"
}

ensure_registry() {
  mkdir -p "$WT_DIR"
  [ -f "$REGISTRY" ] || echo '{}' > "$REGISTRY"
}

# Both registries as one object, current entries winning over legacy ones.
registry_all() {
  ensure_registry
  node -e '
    const fs=require("fs");
    const read=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"));}catch{return {};}};
    process.stdout.write(JSON.stringify({...read(process.argv[2]), ...read(process.argv[1])}));
  ' "$REGISTRY" "$LEGACY_REGISTRY"
}

registry_branches() {
  node -e 'console.log(Object.keys(JSON.parse(process.argv[1])).join("\n"))' "$(registry_all)"
}

# Read the slot assigned to a branch, or empty string.
slot_of() {
  node -e 'process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]]??""))' "$(registry_all)" "$1"
}

# Lowest free slot in 1..MAX_SLOT not present in either registry.
next_free_slot() {
  node -e '
    const r=JSON.parse(process.argv[1]); const max=+process.argv[2];
    const used=new Set(Object.values(r).map(Number));
    for (let i=1;i<=max;i++) if(!used.has(i)){console.log(i);process.exit(0);}
    process.exit(1);
  ' "$(registry_all)" "$MAX_SLOT" || die "no free slots (max $MAX_SLOT worktrees). Run 'rm' on an unused one."
}

# True while the branch is still registered under the pre-#1457 in-repo path.
is_legacy_branch() {
  if [ -d "$LEGACY_WT_DIR/$1" ]; then return 0; fi
  if [ ! -f "$LEGACY_REGISTRY" ]; then return 1; fi
  node -e '
    const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    process.exit(process.argv[2] in r ? 0 : 1);
  ' "$LEGACY_REGISTRY" "$1"
}

registry_set() {
  ensure_registry
  node -e '
    const fs=require("fs"); const f=process.argv[1];
    const r=require(f); r[process.argv[2]]=Number(process.argv[3]);
    fs.writeFileSync(f, JSON.stringify(r,null,2)+"\n");
  ' "$REGISTRY" "$1" "$2"
}

registry_del() {
  ensure_registry
  node -e '
    const fs=require("fs");
    for (const f of process.argv.slice(2)) {
      if (!fs.existsSync(f)) continue;
      const r=JSON.parse(fs.readFileSync(f,"utf8"));
      if (!(process.argv[1] in r)) continue;
      delete r[process.argv[1]];
      fs.writeFileSync(f, JSON.stringify(r,null,2)+"\n");
    }
  ' "$1" "$REGISTRY" "$LEGACY_REGISTRY"
  # Once the last pre-#1457 worktree is gone the in-repo state is dead; drop it
  # so nothing here recreates a reason to ignore that directory.
  if [ -f "$LEGACY_REGISTRY" ] \
    && [ "$(node -e 'console.log(Object.keys(require(process.argv[1])).length)' "$LEGACY_REGISTRY")" = 0 ]; then
    rm -f "$LEGACY_REGISTRY"
    rmdir "$LEGACY_WT_DIR" 2>/dev/null || true
  fi
}

# Slot assignment is read-registry -> pick-lowest-free -> write-registry; two
# concurrent creates (e.g. parallel autodev runs) would race that window and
# collide on a slot. mkdir is atomic, so it serves as the mutex — no flock on
# stock macOS.
SLOT_LOCK=""
lock_slots() {
  ensure_registry
  SLOT_LOCK="$WT_DIR/.slot.lock"
  local waited=0
  until mkdir "$SLOT_LOCK" 2>/dev/null; do
    [ "$waited" -ge 30 ] && die "slot lock held for ${waited}s ($SLOT_LOCK); remove it if no create is running"
    sleep 1; waited=$((waited + 1))
  done
  trap 'unlock_slots' EXIT
}
unlock_slots() {
  [ -n "$SLOT_LOCK" ] && rmdir "$SLOT_LOCK" 2>/dev/null
  SLOT_LOCK=""
}

# Echo the port for (slot, base): base + slot*10.
port_for() { echo $(( $2 + $1 * 10 )); }

worktree_path() { echo "$WT_DIR/$1"; }

# A branch name carries directories ("fix/issue-1"), and their empty husks
# survive `rm` — enough of them to keep the retired in-repo root from ever
# becoming removable. Stops at (and never removes) the root itself.
prune_empty_parents() {
  local dir="$1" root="$2"
  while [ "$dir" != "$root" ] && [ "${dir#"$root"/}" != "$dir" ]; do
    rmdir "$dir" 2>/dev/null || break
    dir="$(dirname "$dir")"
  done
}

# Where a branch's tree actually IS: pre-#1457 worktrees still sit in-repo, and
# up/down/rm have to keep finding them or their slot leaks with no way to free it.
existing_worktree_path() {
  if [ ! -d "$WT_DIR/$1" ] && [ -d "$LEGACY_WT_DIR/$1" ]; then
    echo "$LEGACY_WT_DIR/$1"
  else
    echo "$WT_DIR/$1"
  fi
}

write_env() {
  local branch="$1" slot="$2" path="$3"
  local proj backend frontend pg pgadmin
  proj="$(project_name "$branch")"
  backend="$(port_for "$slot" 4000)"
  frontend="$(port_for "$slot" 5173)"
  pg="$(port_for "$slot" 5432)"
  pgadmin="$(port_for "$slot" 5050)"
  cat > "$path/.env" <<EOF
# Generated by .claude/skills/worktree/worktree.sh — worktree '$branch', slot $slot.
# Gitignored. Regenerate with: ./.claude/skills/worktree/worktree.sh create $branch
COMPOSE_PROJECT_NAME=$proj
BACKEND_PORT=$backend
FRONTEND_PORT=$frontend
POSTGRES_PORT=$pg
PGADMIN_PORT=$pgadmin
VITE_API_URL=http://localhost:$backend/api
# This worktree's .git is a FILE pointing into the main checkout's .git, so the
# containers need that directory mounted at its own absolute path or git — and
# with it \`fallow --base\` — reports "not a git repository" (#1450).
MAIN_GIT_SRC=$ROOT/.git
MAIN_GIT_DST=$ROOT/.git
EOF
}

print_ports() {
  local branch="$1" slot="$2"
  echo "  slot:     $slot"
  echo "  project:  $(project_name "$branch")"
  echo "  frontend: http://localhost:$(port_for "$slot" 5173)"
  echo "  backend:  http://localhost:$(port_for "$slot" 4000)/api"
  echo "  postgres: localhost:$(port_for "$slot" 5432)"
}

# `git worktree add` checks out tracked files only, and node_modules is
# gitignored — so a fresh worktree has none, and every tool there is dead until
# this runs. Installing per worktree is the standard fix (#1452); symlinking the
# main tree's copy is not, because it stops matching the lockfile the moment
# package.json diverges. Since #1457 a missing install is at least LOUD: the
# worktree is a sibling of the repo, so Node has no main checkout to walk up
# into and silently type-check instead.
#
install_deps() {
  local path="$1"
  [ -d "$path/node_modules" ] && return 0

  echo "Installing dependencies (this is what keeps host tsc/eslint/fallow honest)…"
  ( cd "$path" && npm ci ) || die "npm ci failed in $path"

  # npm ci runs the root `prepare` → `lefthook install`, which bakes an absolute
  # path into `.git/hooks` — a directory every worktree SHARES. Left alone, the
  # shim points into THIS worktree, so deleting it makes the shim fall through
  # to a silent `exit 0` and disables every hook everywhere, including the main
  # checkout (upstream lefthook #1398, open; the baked path is deliberate since
  # 2.0.6). Re-installing from the main checkout points it at a tree that
  # outlives every worktree. LEFTHOOK=0 does NOT prevent this — it gates hook
  # execution, not `lefthook install` (measured).
  ( cd "$ROOT" && npx lefthook install >/dev/null 2>&1 ) || die "could not restore the shared lefthook shim"
  # The Prisma client is gitignored too, so without this the worktree's own tsc
  # can't resolve @/generated/prisma. generate never connects; prisma.config.ts
  # only validates that DATABASE_URL parses.
  ( cd "$path/backend" && DATABASE_URL="postgresql://unused:unused@localhost:5432/unused" npx prisma generate >/dev/null ) \
    || die "prisma generate failed in $path/backend"
}

cmd_create() {
  local branch="${1:-}"; shift || true
  [ -n "$branch" ] || die "usage: worktree.sh create <branch> [base] [--up]"
  # Optional positional base ref to fork from (e.g. "staging") plus the --up flag,
  # in any order. Empty base → fork from the main checkout's HEAD (legacy behavior).
  local base="" do_up=0
  for arg in "$@"; do
    if [ "$arg" = "--up" ]; then do_up=1; else base="$arg"; fi
  done

  local path; path="$(worktree_path "$branch")"
  local slot; slot="$(slot_of "$branch")"

  # Never silently re-create around a pre-#1457 entry: the old tree would keep
  # its slot with nothing left pointing at it, and `rm` is the one command that
  # still reaches it.
  if is_legacy_branch "$branch"; then
    die "worktree '$branch' predates #1457 and is registered under $LEGACY_WT_DIR.
  Tear it down first, then re-create it outside the repo:
    ./.claude/skills/worktree/worktree.sh rm $branch
    ./.claude/skills/worktree/worktree.sh create $branch"
  fi

  if [ -d "$path" ]; then
    [ -n "$slot" ] || die "worktree dir exists but no slot recorded; remove $path manually"
    echo "Worktree '$branch' already exists (slot $slot); refreshing .env."
  else
    lock_slots
    slot="$(next_free_slot)"
    # Reuse the branch if it already exists, otherwise create it. A new branch
    # forks from a FRESHLY-FETCHED origin/<base> when a base is given, so a slice
    # never forks off a stale local ref — that stale fork was the cause of the
    # cross-slice merge conflicts in the lib-reorg batch. With no base, fall back
    # to the main checkout's HEAD.
    if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
      git -C "$ROOT" worktree add "$path" "$branch"
    elif [ -n "$base" ]; then
      git -C "$ROOT" fetch --quiet origin "$base"
      git -C "$ROOT" worktree add "$path" -b "$branch" "origin/$base"
    else
      git -C "$ROOT" worktree add "$path" -b "$branch"
    fi
    registry_set "$branch" "$slot"
    unlock_slots
  fi

  write_env "$branch" "$slot" "$path"
  install_deps "$path"
  echo "Worktree '$branch' ready:"
  echo "  path:     $path"
  print_ports "$branch" "$slot"

  if [ "$do_up" = 1 ]; then
    cmd_up "$branch"
  else
    echo "  start it: ./.claude/skills/worktree/worktree.sh up $branch"
  fi
}

cmd_up() {
  local branch="${1:-}"
  [ -n "$branch" ] || die "usage: worktree.sh up <branch>"
  local path; path="$(existing_worktree_path "$branch")"
  [ -d "$path" ] || die "no worktree '$branch' (run: create $branch)"
  echo "Starting '$branch'…"
  ( cd "$path" && docker compose up --build -d )
  print_ports "$branch" "$(slot_of "$branch")"
}

cmd_down() {
  local branch="${1:-}"
  [ -n "$branch" ] || die "usage: worktree.sh down <branch>"
  local path; path="$(existing_worktree_path "$branch")"
  [ -d "$path" ] || die "no worktree '$branch'"
  ( cd "$path" && docker compose down )
}

cmd_rm() {
  local branch="${1:-}"
  [ -n "$branch" ] || die "usage: worktree.sh rm <branch>"
  local path; path="$(existing_worktree_path "$branch")"
  if [ -d "$path" ]; then
    # --profile e2e: compose will NOT remove volumes owned by a service in an
    # inactive profile, so a plain `down -v` left both e2e_*_node_modules behind
    # on every teardown — 74 of them (~16 GB) had accumulated by #1452.
    # --rmi local: drops the project's own built images (<project>-backend/
    # -frontend) while leaving pulled ones (postgres, playwright) alone.
    ( cd "$path" && docker compose --profile e2e down -v --rmi local ) || true
    # A half-torn-down dir (git worktree metadata already pruned) makes
    # `worktree remove` die with "not a working tree" — fall back to removing
    # the dir + pruning so the slot is still freed (the janitor relies on rm
    # never leaving a registry entry behind).
    git -C "$ROOT" worktree remove "$path" --force || { rm -rf "$path"; git -C "$ROOT" worktree prune; }
    case "$path" in
      "$LEGACY_WT_DIR"/*) prune_empty_parents "$(dirname "$path")" "$LEGACY_WT_DIR" ;;
      *)                  prune_empty_parents "$(dirname "$path")" "$WT_DIR" ;;
    esac
  fi
  registry_del "$branch"
  echo "Removed worktree '$branch' (containers, volumes, images, and slot freed)."
}

# Every volume compose creates for this stack, so an orphan can be mapped back
# to the project that made it. Keep in sync with docker-compose.yml's `volumes:`.
VOLUME_SUFFIXES="backend_node_modules backend_ws_node_modules frontend_node_modules frontend_ws_node_modules e2e_node_modules e2e_ws_node_modules postgres_data pgadmin_data"

# Compose names volumes "<project>_<suffix>" and built images "<project>-<service>",
# and neither is invertible in general — a project name has no delimiter of its own,
# so recovering one by stripping a suffix is a guess. These two only answer "is this
# shaped like one of ours at all", which costs nothing when wrong; liveness is
# decided by `live_artifacts` building the names forward instead.
is_our_volume() {
  local s
  for s in $VOLUME_SUFFIXES; do
    case "$1" in *"_$s") return 0 ;; esac
  done
  return 1
}

is_our_image() {
  case "$1" in *-backend|*-frontend) return 0 ;; *) return 1 ;; esac
}

# Projects still owning a registry entry. Anything else under the cs- prefix is
# an orphan: its worktree is gone, so no `rm` will ever reclaim it.
live_projects() {
  registry_branches | while IFS= read -r b; do [ -n "$b" ] && project_name "$b"; done
  # An empty registry ends the loop on a failed `read`, and under `set -e` that
  # status propagates through the caller's command substitution and kills the
  # script. Return success explicitly.
  return 0
}

# Every artifact name a registered worktree owns, composed FORWARD from the
# project name. Matching a candidate against this exact set is what keeps a
# misparse from ever deleting a live project's Postgres data — the direction
# compose's naming actually supports (#1452).
live_artifacts() {
  local p s
  live_projects | while IFS= read -r p; do
    [ -n "$p" ] || continue
    for s in $VOLUME_SUFFIXES; do printf '%s_%s\n' "$p" "$s"; done
    printf '%s-backend\n%s-frontend\n' "$p" "$p"
  done
  return 0
}

cmd_prune() {
  local apply=0
  for arg in "$@"; do [ "$arg" = "--yes" ] && apply=1; done

  local live; live="$(live_artifacts)"
  is_live() { [ -n "$live" ] && printf '%s\n' "$live" | grep -qxF "$1"; }

  local vols="" imgs="" skipped=0
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    case "$v" in cs-*) ;; *) skipped=$((skipped + 1)); continue ;; esac
    if ! is_our_volume "$v"; then skipped=$((skipped + 1)); continue; fi
    is_live "$v" || vols="$vols$v
"
  done <<< "$(docker volume ls -q 2>/dev/null)"

  while IFS= read -r i; do
    [ -n "$i" ] || continue
    case "$i" in cs-*) ;; *) continue ;; esac
    if ! is_our_image "$i"; then continue; fi
    is_live "$i" || imgs="$imgs$i
"
  done <<< "$(docker images --format '{{.Repository}}' 2>/dev/null | sort -u)"

  local nv ni
  nv="$(printf '%s' "$vols" | grep -c . || true)"
  ni="$(printf '%s' "$imgs" | grep -c . || true)"

  # Every branch below is a full `if`: under `set -e` a bare `[ … ] && cmd` whose
  # test fails returns 1 and aborts the script.
  if [ "$nv" -eq 0 ] && [ "$ni" -eq 0 ]; then
    echo "Nothing to prune."
  else
    echo "Orphaned artifacts (no registry entry): $nv volume(s), $ni image(s)."
    if [ "$nv" -gt 0 ]; then printf '%s' "$vols" | sed 's/^/  volume /'; fi
    if [ "$ni" -gt 0 ]; then printf '%s' "$imgs" | sed 's/^/  image  /'; fi
  fi

  # Only cs-* is provably ours; pre-prefix projects and unrelated stacks are
  # reported, never removed, because the naming can't distinguish them.
  if [ "$skipped" -gt 0 ]; then
    echo "Skipped $skipped volume(s) outside the cs-* naming — inspect and remove by hand if they're yours."
  fi

  if [ "$apply" != 1 ]; then
    if [ "$nv" -gt 0 ] || [ "$ni" -gt 0 ]; then echo "Dry run. Re-run with --yes to remove."; fi
    return 0
  fi

  # A volume still attached to a running container fails to remove; that is the
  # safe outcome, so the failure is reported rather than forced — and reported
  # honestly, because "Pruned." over a failed `rm` is how a leak stays invisible.
  local failed=0
  if [ "$nv" -gt 0 ]; then printf '%s' "$vols" | xargs docker volume rm >/dev/null 2>&1 || failed=1; fi
  if [ "$ni" -gt 0 ]; then printf '%s' "$imgs" | xargs docker image rm >/dev/null 2>&1 || failed=1; fi
  if [ "$failed" -eq 1 ]; then
    echo "Pruned what it could — some artifacts are still in use by a running container. Stop it and re-run."
  else
    echo "Pruned."
  fi
}

cmd_ls() {
  local branches
  branches="$(registry_branches)"
  if [ -z "$branches" ]; then
    echo "No worktrees. Create one: ./.claude/skills/worktree/worktree.sh create <branch>"
    return
  fi
  echo "Worktrees live in $WT_DIR"
  printf '%-28s %-5s %-26s %-26s %s\n' BRANCH SLOT FRONTEND BACKEND STATUS
  while IFS= read -r branch; do
    [ -n "$branch" ] || continue
    local slot proj status
    slot="$(slot_of "$branch")"
    proj="$(project_name "$branch")"
    if docker compose ls --format json 2>/dev/null | grep -q "\"$proj\""; then
      status="running"
    else
      status="stopped"
    fi
    if is_legacy_branch "$branch"; then status="$status, in-repo (pre-#1457)"; fi
    printf '%-28s %-5s %-26s %-26s %s\n' \
      "$branch" "$slot" \
      "http://localhost:$(port_for "$slot" 5173)" \
      "http://localhost:$(port_for "$slot" 4000)/api" \
      "$status"
  done <<< "$branches"
}

main() {
  local sub="${1:-}"; shift || true
  case "$sub" in
    create) cmd_create "$@" ;;
    up)     cmd_up "$@" ;;
    down)   cmd_down "$@" ;;
    rm)     cmd_rm "$@" ;;
    prune)  cmd_prune "$@" ;;
    dir)    echo "$WT_DIR" ;;
    ls|"")  cmd_ls "$@" ;;
    *)      die "unknown command '$sub' (create|up|down|ls|rm|prune|dir)" ;;
  esac
}

main "$@"
