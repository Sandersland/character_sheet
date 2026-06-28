---
name: verify-frontend
description: Run after making frontend changes to gate a PR. Runs frontend unit tests and browser verification in parallel, then reports a combined PASS/FAIL verdict. Use when frontend changes need verification before merging, or when another skill (e.g. parallel-issues) needs a UI gate.
---

# verify-frontend

Run this skill after making frontend changes to gate a PR. It runs frontend unit tests and browser verification in parallel, then reports a combined verdict.

## Steps

### 0. Ensure a signed-in session (auth is required)

Every `/api` route is behind `requireAuth`, so the browser surface shows the `LoginPage` until a session exists. OAuth can't complete headless, so provision a dev session instead:

1. **Make sure the stack is running** (`docker compose up -d`, or `… worktree.sh up <branch>` for a worktree) and the backend is healthy (`curl -s localhost:4000/api/health`).
2. **Seed a user + representative character** (idempotent — reuses an existing "Verify Dummy"):
   ```bash
   npm run seed:verify
   # worktree slot N: BACKEND_URL=http://localhost:40<N>0 FRONTEND_URL=http://localhost:51<N>3 npm run seed:verify
   ```
   This needs `ALLOW_DEV_LOGIN=true` (the dev compose sets it by default).
3. **Sign in inside Playwright** — `cs_session` is HttpOnly, so don't try to set it from `document.cookie`. Instead `browser_navigate` to the frontend, then run an in-page fetch and reload:
   ```js
   await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
   ```
   The SPA proxies `/api`, so the browser stores the session for the frontend origin. Reload → you land in the app as "Dev User" with the seeded character visible.

### 1. Launch both in parallel

Kick off the unit tests and browser verification at the same time using two background agents (or by launching them as parallel tool calls):

**Unit tests** — run in the project root:
```bash
npm run test --workspace=frontend
```
Capture the full output (pass/fail count, any failing test names and assertions).

**Browser verification** — invoke the `/verify` skill concurrently. It will launch the app and drive the changed UI at the browser surface.

> **Screenshot paths:** when calling `browser_take_screenshot`, always use an absolute path under `/tmp/` (e.g. `/tmp/verify-<feature>.png`). Never use a relative filename — it resolves to the project root and pollutes the working tree.

### 2. Wait for both to complete

Do not report until you have results from both. If the unit tests finish first, hold the result. If `/verify` finishes first, hold the result. Report only when both are in hand.

### 3. Report a combined verdict

Use this format:

```
## Frontend verification: <one-line description of what changed>

**Verdict:** PASS | FAIL

### Unit tests
✅/❌ `npm run test --workspace=frontend`
<paste the full vitest output — pass/fail summary and any failure details>

### Browser verification
<paste the full verdict block from /verify>

### Findings
<anything notable from either surface — test output surprises, browser behaviour, anything worth flagging>
```

**Verdict rules:**
- **PASS** only if both unit tests AND browser verification pass
- **FAIL** if either fails — include which one(s) failed and why
- If tests fail, still report the browser result if available (running both in parallel means you have it)
- Never skip the unit tests because "the verify tool already ran" — these are complementary, not substitutes
