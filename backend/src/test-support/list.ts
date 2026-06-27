// Test-only helper for safely asserting against list endpoints.
//
// Backend tests share one Postgres and run in parallel (see .claude/docs/testing.md),
// so an UNSCOPED list (e.g. GET /api/characters) returns every concurrently-running
// suite's fixtures — a churning set. Never assert on the whole list (its length, or
// the equality of two snapshots); scope to the row your suite created.
//
// `findInList(res.body, FIXTURE.id)` names that safe pattern: it returns this
// suite's own item (or undefined) so the caller asserts only on its shape.
export function findInList<T extends { id: string }>(
  body: unknown,
  id: string
): T | undefined {
  // Guard non-array bodies (null/undefined, or an error object from a non-200
  // response) so the helper honors its `T | undefined` contract instead of
  // throwing a TypeError at `.find`.
  return Array.isArray(body)
    ? (body as T[]).find((row) => row.id === id)
    : undefined;
}
