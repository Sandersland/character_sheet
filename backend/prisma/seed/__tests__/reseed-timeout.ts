// Timeout for any test that calls seedClassFeatures — vitest's 5s default is
// no longer enough and the margin shrinks with every class wave 2 lands.
//
// seedClassFeatures rewrites the WHOLE ClassFeature table, and that table only
// grows: it was ~522 rows when #1523 shipped, and #1231/#1233/#1234 added
// Rogue's, Warlock's and Wizard's real 2024 content on top. The idempotency and
// prune suites both timed out at 5s in CI on 2026-08-01 — twice, on different
// PRs, while passing locally and on re-run, which is exactly the signature of a
// duration sitting on top of the limit rather than a genuine hang. Six classes
// of #1134 are still to come, so the honest fix is a timeout with real headroom
// instead of a re-run each time.
//
// This is NOT a workaround for a slow query to investigate later: the reseed is
// a full-table upsert doing exactly the work it claims to. If it ever exceeds
// THIS bound, that is a real regression worth reading — do not raise it again
// without measuring first.
export const RESEED_TIMEOUT_MS = 60_000;
