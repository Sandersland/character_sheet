import type { SeedEdition } from "./edition.js";

// Builds a `deleteMany`/`findMany` where-clause matching every Feat row whose
// (name, edition) pair isn't in the currently-seeded set (#1306's fix for the
// footgun that used to drop the OTHER edition's row too — the 2014 Mobile feat
// was deleted outright, not merely superseded, because a bare `notIn` on name
// treated a 2014-only row sharing a 2024 row's name as stale).
//
// Partitions by edition FIRST rather than testing `{name, edition}` pairs
// directly in one big NOT/OR: SQL's three-valued logic makes `edition = 'x'`
// evaluate to UNKNOWN (neither true nor false) for a row whose OWN edition is
// NULL, which poisons a mixed-edition NOT/OR into never matching that row —
// exactly the NULL-comparison footgun the NULLS NOT DISTINCT constraint
// exists to guard against. Comparing each row against ITS OWN edition
// partition first (`edition IS NULL` / `edition = 'EDITION_2014'` / `edition =
// 'EDITION_2024'`) is a direct, always-true-or-false self-comparison, so the
// per-partition `notIn` on name is reachable for every row.
export function staleFeatWhere(seeded: { name: string; edition: SeedEdition | null }[]) {
  const editions: (SeedEdition | null)[] = [null, "EDITION_2014", "EDITION_2024"];
  return {
    OR: editions.map((edition) => ({
      edition,
      name: { notIn: seeded.filter((f) => f.edition === edition).map((f) => f.name) },
    })),
  };
}
