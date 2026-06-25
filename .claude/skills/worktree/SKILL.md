---
name: worktree
description: Spin up an isolated, fully-dockerized dev stack for a git worktree so several features can be built and tested in parallel without port or database collisions. Each worktree gets its own Compose project (own Postgres volume, isolated migrations) and its own port block, with port math owned by scripts/worktree.sh. Use when the user wants to work on multiple branches/issues at once, or asks to "spin up a worktree for X".
---

# worktree

Spin up an isolated, fully-dockerized dev stack for a git worktree so several features can be built and tested in parallel without port or database collisions. Each worktree gets its own Compose project (own Postgres volume → migrations are isolated) and its own port block. Port math is owned by `scripts/worktree.sh` — never assign ports by hand.

Use this when the user wants to work on multiple branches/issues at once, or asks to "spin up a worktree for X".

## Steps

### 1. Create the worktree

Run from the **main checkout** root:

```bash
./scripts/worktree.sh create <branch> --up
```

This creates the worktree under `.claude/worktrees/<branch>` (new branch from HEAD, or attaches an existing branch), assigns the lowest free slot (1–9), writes a gitignored `.env` with the slot's ports + `COMPOSE_PROJECT_NAME`, and (with `--up`) builds and starts `db + backend + frontend` detached. Drop `--up` to set up without starting; start later with `up <branch>`.

> First boot builds images and runs `prisma migrate deploy && prisma db seed` against the worktree's private DB — give it a moment before the URLs respond.

### 2. Report the assigned URLs

The script prints the slot and ports. Relay them to the user as clickable URLs, e.g.:

```
Worktree 'spell-upcasting' (slot 1) is up:
  Frontend  http://localhost:5183
  Backend   http://localhost:4010/api
  Postgres  localhost:5442
```

### 3. Manage and review

- **See everything at once:** `./scripts/worktree.sh ls` → table of branch / slot / frontend URL / backend URL / running status.
- **Tail one stack's logs:** `docker compose -p cs-<sanitized-branch> logs -f`.
- **Stop (keep DB):** `./scripts/worktree.sh down <branch>` · restart: `up <branch>`.
- **Tear down completely (drops the isolated DB volume + removes the worktree):** `./scripts/worktree.sh rm <branch>`.

### 4. Work inside a worktree

Each worktree is a normal checkout on its own branch and ports. To drive development there, `cd .claude/worktrees/<branch>` and run commands (or open a separate `claude` session in that directory). Prisma commands target that worktree's DB via its port, e.g. slot 1:

```bash
DATABASE_URL=postgresql://character_sheet:character_sheet@localhost:5442/character_sheet npx prisma migrate dev --name <change>
```

## Notes

- Slot 0 is the main checkout (default ports 4000/5173/5432/5050). Worktrees use slots 1–9.
- pgAdmin is gated behind the `tools` Compose profile, so worktrees stay lean. To inspect a DB visually, run `docker compose --profile tools up pgadmin` in that directory (its pgAdmin lands on `5050 + slot*10`).
- The slot registry lives at `.claude/worktrees/registry.json` (gitignored). If a worktree is abandoned without `rm`, its slot stays reserved until you `rm` it.
