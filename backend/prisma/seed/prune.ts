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
// Model-agnostic by shape (any table with `name`/`edition` columns), so
// seedFeats and seedShadowArts's GrantedAbility prune share this one function
// rather than two copies — GrantedAbility.name stays plain @unique today (no
// divergent row can exist to disambiguate yet), so this is currently a no-op
// improvement there, ready the day a maneuver/shadow-art forks by edition.
export function staleCatalogRowsWhere(seeded: { name: string; edition: SeedEdition | null }[]) {
  const editions: (SeedEdition | null)[] = [null, "EDITION_2014", "EDITION_2024"];
  return {
    OR: editions.map((edition) => ({
      edition,
      name: { notIn: seeded.filter((f) => f.edition === edition).map((f) => f.name) },
    })),
  };
}
