// Seed-time content validation (#1277). Malformed catalog content fails the
// seed with a row-indexed message instead of writing a broken row that only
// 500s later at read time (the #1247/#1370 failure class this closes for the
// families registered here). Composes zod schemas that live co-located with
// their content (subclasses.ts's subclassSeedSchema, subclass-granted-
// spells.ts's twin) rather than one central schema file, so a family's schema
// changes in the same diff as its content shape.
//
// SEED_FAMILIES is a registry, not a hardcoded list of calls — adding a
// family is one entry here, demonstrated by the second member (SUBCLASS_
// GRANTED_SPELLS) landing alongside the first, not merely asserted. Deliberately
// in scope for only these two today; the other eleven seed families already
// carry structural coverage via seed-data.test.ts and are a named follow-up.
import { z } from "zod";

import { SUBCLASSES, subclassSeedSchema } from "./subclasses.js";
import { SUBCLASS_GRANTED_SPELLS, subclassGrantedSpellSeedSchema } from "./subclass-granted-spells.js";

interface SeedFamily {
  schema: z.ZodTypeAny;
  rows: readonly unknown[];
}

const SEED_FAMILIES: Record<string, SeedFamily> = {
  SUBCLASSES: { schema: subclassSeedSchema, rows: SUBCLASSES },
  SUBCLASS_GRANTED_SPELLS: { schema: subclassGrantedSpellSeedSchema, rows: SUBCLASS_GRANTED_SPELLS },
};

export interface SeedValidationSummary {
  familiesChecked: number;
  rowsChecked: number;
}

/**
 * Validates every registered family's rows against its schema, throwing on the
 * FIRST invalid row with its family/index/path so the failure names the
 * offender. Also enforces the one cross-row invariant no per-row schema can
 * express: two SUBCLASSES rows must never share a slug (M2, #1277) — a
 * duplicate would silently collapse two subclasses' seeded content onto one
 * DB row under the new slug_edition unique index.
 *
 * Returns a summary so a permanent test can assert this function actually
 * visited real content (families/rows counts) rather than reporting "valid"
 * vacuously — the #1370 lesson: a validator that short-circuits, has an empty
 * registry, or is `.optional()` all the way down must fail that test.
 */
export function assertSeedContentValid(): SeedValidationSummary {
  let rowsChecked = 0;
  for (const [familyName, { schema, rows }] of Object.entries(SEED_FAMILIES)) {
    rows.forEach((row, index) => {
      const result = schema.safeParse(row);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.join(".");
        throw new Error(
          `Seed content invalid — ${familyName}[${index}]${path ? `.${path}` : ""}: ${issue.message}`,
        );
      }
      rowsChecked += 1;
    });
  }

  const rowsBySlug = new Map<string, number>();
  SUBCLASSES.forEach((sub, index) => {
    const seenAt = rowsBySlug.get(sub.slug);
    if (seenAt !== undefined) {
      throw new Error(`Seed error: duplicate subclass slug "${sub.slug}" (rows ${seenAt} and ${index})`);
    }
    rowsBySlug.set(sub.slug, index);
  });

  return { familiesChecked: Object.keys(SEED_FAMILIES).length, rowsChecked };
}
