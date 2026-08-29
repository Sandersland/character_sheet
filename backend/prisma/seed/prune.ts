import type { SeedEdition } from "./edition.js";
import { ALL_RULES_EDITIONS } from "../../src/lib/rules/edition.js";

// Partitions by edition first, not a single {identity,edition} NOT/OR: `edition = 'x'` is UNKNOWN (not FALSE) for a NULL-edition row, which would silently poison a mixed-edition OR (#1306).
// `identityColumn` is required and first, not a defaulted param (#1430): Action has both `name` and `key`, so a default would silently build a valid but wrong `notIn` on the wrong column instead of throwing.
// `extraWhere` is ANDed in as a value, never spread — spreading risks the same OR-clobber withEditionOrShared guards against.
// Shared by seedFeats, seedShadowArts, seedActions, and seedSubclasses: each model has its own per-edition unique constraint, so the edition partitioning is not a no-op for any of them.
// A caller that only ever passes `edition: null` entries leaves every non-null partition matching every row in it; a source gaining forked content must thread real editions into `seeded` in the same change.
export function staleCatalogRowsWhere(
  identityColumn: "name" | "key" | "slug",
  seeded: readonly { identity: string; edition: SeedEdition | null }[],
  extraWhere: object = {},
) {
  // Reads ALL_RULES_EDITIONS rather than a hardcoded literal (#1527): a third edition added there is automatically partitioned and pruned here too.
  const editions: (SeedEdition | null)[] = [null, ...ALL_RULES_EDITIONS];
  // Three explicit branches, not a computed key: Prisma's WhereInput rejects an index signature.
  // The `never` exhaustiveness check makes widening `identityColumn` without a new branch a compile error, not a silent fall-through (#1527's principle).
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
