---
name: verify-frontend
description: Run after making frontend changes to gate a PR. Runs frontend unit tests, browser verification, and a design review in parallel, then reports a combined PASS/FAIL verdict. Use when frontend changes need verification before merging, or when another skill (e.g. parallel-issues) needs a UI gate.
---

# verify-frontend

Run this skill after making frontend changes to gate a PR. It runs three lanes in parallel — frontend unit tests, browser verification, and a **design review** — then reports a combined verdict. The design lane is the taste gate: it keeps the UI on-system and catches the "generic AI" tells (off-token colors/spacing, weak hierarchy, inconsistent components) that unit tests and behavioural checks never see.

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

### 1. Launch three lanes in parallel

Kick off the unit tests, browser verification, and design review at the same time using background agents (or by launching them as parallel tool calls):

**Unit tests** — run in the project root:
```bash
npm run test --workspace=frontend
```
Capture the full output (pass/fail count, any failing test names and assertions). This includes the `jest-axe` runtime accessibility assertions in component tests.

**Browser verification** — invoke the `/verify` skill concurrently. It will launch the app and drive the changed UI at the browser surface.

**Design review** — launch the design agent against the changed surfaces (give it the list of changed `features/`, `pages/`, and `components/ui/` files). Use `subagent_type: "frontend-design-architect"` (a registered agent type); if that type isn't available in the current environment, fall back to a `general-purpose` agent briefed with the two design docs below. Its brief: judge the rendered UI against this app's design system, not generic taste. Point it at `.claude/agent-memory/frontend-design-architect/design_system.md` (token names + direction) and `.claude/docs/frontend.md` (conventions), and have it check for:
- **Off-system values** — arbitrary colors/radii/shadows instead of the `parchment`/`garnet`/`arcane`/`gold`/`vitality` tokens, `rounded-card`/`rounded-control`, `shadow-card`/`shadow-raised`; ad-hoc spacing that breaks the rhythm. (These are the top "AI slop" tells.)
- **Visual hierarchy** — is the primary action obvious, is type scale used purposefully, is whitespace deliberate rather than uniform.
- **Component reuse** — reuses `Card`/`Badge`/`MeterBar`/`Tabs`/`Modal` rather than reinventing a one-off; respects the inline-panel-vs-Modal rule.
- **Convention violations** — raw skill/ability keys in the UI, color-only meaning (e.g. a meter with no numeric label), missing focus/hover states.
- **Accessibility** — anything `jsx-a11y` lint and axe can't catch at the markup level (contrast, focus order, hit targets).

For changes that touch a whole page or a new flow, also run the `/ux-review` skill concurrently (when available in the environment) for the page-level Learnability / Heuristics / Visual scores. For a single-component change, the architect agent alone is enough. If you skip `/ux-review` — because the change is component-scoped or the skill isn't installed here — say so in the report rather than silently dropping it.

Have the design lane return **severity-tagged findings** (`blocking` / `advisory`), each naming the file and the specific token/convention at issue, plus a one-line "what good looks like" fix.

> **Screenshot paths:** when calling `browser_take_screenshot`, always use an absolute path under `/tmp/` (e.g. `/tmp/verify-<feature>.png`). Never use a relative filename — it resolves to the project root and pollutes the working tree.

### 2. Wait for all lanes to complete

Do not report until you have results from every lane you launched. Hold each result as it arrives and report only when all are in hand.

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

### Design review
✅/⚠️/❌ frontend-design-architect (+ /ux-review if run; note if skipped and why)
<the severity-tagged findings: each as `[blocking|advisory] file — issue → fix`. If clean, say so.>

### Findings
<anything notable from any lane — test output surprises, browser behaviour, design issues worth flagging>
```

**Verdict rules:**
- **PASS** only if unit tests pass, browser verification passes, AND the design review has **no `blocking` findings**.
- **FAIL** if any lane fails — include which one(s) and why. A design review with one or more `blocking` findings is a FAIL.
- **Design severity:** `blocking` = a design-system or convention violation that's objectively wrong here (off-token color/radius/shadow, raw skill/ability key in the UI, color-only meaning, broken hierarchy that obscures the primary action, an a11y defect). `advisory` = subjective polish (a nicer arrangement, optional spacing tweaks) — list it, but it does not fail the gate. When unsure whether a finding is taste or a real regression, mark it `advisory` and call it out, don't block on it.
- If any lane fails, still report the others (running in parallel means you have them).
- Never skip a lane because another "already covers it" — they are complementary, not substitutes.
