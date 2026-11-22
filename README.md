# Character Sheet

A D&D 5e character sheet that does the bookkeeping a paper sheet makes you do by hand, so a session is spent playing rather than tracking. It supports both the 2014 (SRD 5.1) and 2024 (SRD 5.2) rules, chosen per campaign.

- **Sheet:** HP, XP and level-up choices, inventory, spellcasting, conditions, feats and ASIs, class resources, with derived numbers computed by the server.
- **Live play:** sessions with combat and turn tracking, and an action list of what you can do right now, with costs, dice and DCs already worked out.
- **Campaigns:** a DM side with item awards, a codex, per-character journals, and an audit log with undo.

## Stack

Postgres + Prisma 7 + Express on the backend, Vite + React + TypeScript + Tailwind v4 on the frontend, in an npm workspaces monorepo (`backend/`, `frontend/`, `packages/*`).

## Running it

```bash
npm ci
docker compose up -d db
npm run dev        # backend :4000, frontend :5173
```

First-run setup (env files, migrations, seed, sign-in) is in `docs/development.md`. Other docs:

| Doc | Covers |
|---|---|
| `docs/architecture.md` | Data patterns, audit log, transaction endpoints, auth |
| `docs/testing.md` | Backend, frontend and e2e tests |
| `docs/deployment.md` | The production image, Railway, backups |
| `CLAUDE.md` | Project rules for contributors and coding agents |

## Security

See `SECURITY.md`.
