import type { SeedEdition } from "./edition.js";

// Builds a `deleteMany`/`findMany` where-clause matching every catalog row
// whose (name, edition) pair isn't in the currently-seeded set (#1306): a bare
// `notIn` on name alone can't distinguish a same-named row under a DIFFERENT
// edition from a genuinely-retired one, so it would drop or keep both
// together. Partitions by edition first rather than testing `{name, edition}`
// pairs in one NOT/OR: `edition = 'x'` is UNKNOWN (not FALSE) for a row whose
// OWN edition is NULL, which silently poisons a mixed-edition NOT/OR — the
// exact NULL-comparison trap NULLS NOT DISTINCT exists to guard against.
//
// `extraWhere` (e.g. `{ source: "shadowArts" }`) is ANDed in as a value, never
// spread — the same clobber the caller could hit spreading a bare `{OR:...}`
// fragment (see withEditionOrShared) applies here too, so this composes the
// caller's filter in rather than exposing one.
//
// Model-agnostic by shape (any table with `name`/`edition` columns), so
// seedFeats and seedShadowArts's GrantedAbility prune share this one function
// rather than two copies. Both are now genuinely partitioned: #1415 widened
// GrantedAbility to @@unique([name, edition]), so a divergent row CAN exist
// there and the partitioning stopped being a no-op.
//
// A caller passing only `edition: null` entries gives the 2014/2024 partitions
// an empty `notIn: []`, which matches EVERY row in them — correct for a source
// that authors no forked content, fatal for one that does. So a source gaining
// forked rows must thread their editions into `seeded` in the same change.
export function staleCatalogRowsWhere(
  seeded: { name: string; edition: SeedEdition | null }[],
  extraWhere: object = {},
) {
  const editions: (SeedEdition | null)[] = [null, "EDITION_2014", "EDITION_2024"];
  return {
    AND: [
      extraWhere,
      {
        OR: editions.map((edition) => ({
          edition,
          name: { notIn: seeded.filter((f) => f.edition === edition).map((f) => f.name) },
        })),
      },
    ],
  };
}
