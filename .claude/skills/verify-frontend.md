# verify-frontend

Run this skill after making frontend changes to gate a PR. It runs frontend unit tests and browser verification in parallel, then reports a combined verdict.

## Steps

### 1. Launch both in parallel

Kick off the unit tests and browser verification at the same time using two background agents (or by launching them as parallel tool calls):

**Unit tests** — run in the project root:
```bash
npm run test --workspace=frontend
```
Capture the full output (pass/fail count, any failing test names and assertions).

**Browser verification** — invoke the `/verify` skill concurrently. It will launch the app and drive the changed UI at the browser surface.

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
