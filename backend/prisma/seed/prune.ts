import type { SeedEdition } from "./edition.js";

// Builds a `deleteMany`/`findMany` where-clause matching every catalog row
// whose (identity, edition) pair isn't in the currently-seeded set (#1306): a
// bare `notIn` on the identity column alone can't distinguish a same-identity
// row under a DIFFERENT edition from a genuinely-retired one, so it would drop
// or keep both together. Partitions by edition first rather than testing
// `{identity, edition}` pairs in one NOT/OR: `edition = 'x'` is UNKNOWN (not
// FALSE) for a row whose OWN edition is NULL, which silently poisons a
// mixed-edition NOT/OR — the exact NULL-comparison trap NULLS NOT DISTINCT
// exists to guard against.
//
// `identityColumn` is REQUIRED and first, never a defaulted trailing parameter
// (#1430): Action carries BOTH `name` and `key`, so an omitted or defaulted
// identity field would build a syntactically valid `notIn` on `Action.name`
// and silently delete the wrong rows — it would NOT throw the way it does on a
// model that lacks `name`. Naming the element field `identity` rather than
// `name` forces every caller to state which column it means at the map site.
//
// `extraWhere` (e.g. `{ source: "shadowArts" }`) is ANDed in as a value, never
// spread — the same clobber the caller could hit spreading a bare `{OR:...}`
// fragment (see withEditionOrShared) applies here too, so this composes the
// caller's filter in rather than exposing one.
//
// Model-agnostic by shape (any table with a `name`, `key`, or `slug` column
// plus `edition`), so seedFeats, seedShadowArts's GrantedAbility prune,
// seedActions, and seedSubclasses share this one function rather than four
// copies. All are genuinely partitioned: #1415 widened GrantedAbility to
// @@unique([name, edition]), #1430 widened Action to @@unique([key,
// edition]), and Subclass has carried @@unique([slug, edition]) since
// #1306's own migration, so a divergent row CAN exist in each and the
// partitioning stopped being a no-op.
//
// A caller passing only `edition: null` entries gives the 2014/2024 partitions
// an empty `notIn: []`, which matches EVERY row in them — correct for a source
// that authors no forked content, fatal for one that does. So a source gaining
// forked rows must thread their editions into `seeded` in the same change.
export function staleCatalogRowsWhere(
  identityColumn: "name" | "key" | "slug",
  seeded: readonly { identity: string; edition: SeedEdition | null }[],
  extraWhere: object = {},
) {
  const editions: (SeedEdition | null)[] = [null, "EDITION_2014", "EDITION_2024"];
  // Three explicit branches rather than a computed key: a computed key would
  // give the clause an index signature, which no Prisma WhereInput accepts.
  // Exhaustive by `never` rather than a fall-through `return`: widening the
  // union above without adding a branch here must be a COMPILE error, not rows
  // silently swept under whichever column the fall-through happened to name
  // (#1527's principle, applied to an identity column instead of an edition).
  const identityNotIn = (values: string[]) => {
    if (identityColumn === "name") return { name: { notIn: values } };
    if (identityColumn === "key") return { key: { notIn: values } };
    if (identityColumn === "slug") return { slug: { notIn: values } };
    const unhandled: never = identityColumn;
    throw new Error(`staleCatalogRowsWhere: unhandled identity column ${String(unhandled)}`);
  };
  return {
    AND: [
      extraWhere,
      {
        OR: editions.map((edition) => ({
          edition,
          ...identityNotIn(seeded.filter((r) => r.edition === edition).map((r) => r.identity)),
        })),
      },
    ],
  };
}
