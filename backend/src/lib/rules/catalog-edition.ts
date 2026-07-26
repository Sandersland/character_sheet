import type { RulesEdition } from "@character-sheet/shared-types";

/** Shape shared by every edition-tagged catalog row (Feat, Subclass, GrantedAbility, Action, Background). */
export interface EditionTagged {
  edition: RulesEdition | null;
}

/**
 * Resolve one catalog row for a character's edition from candidates sharing
 * the same business key (e.g. every `Feat` row named "Alert") — prefers an
 * exact-edition row, falls back to the `edition: null` ("valid in both
 * editions") row (#1306). This is the SINGLE place that exact-then-NULL
 * ordering is expressed; no route, serializer, or seed module may re-derive
 * it. Mirrors `subclassGateLevel`'s role as the one-function-per-rule pattern,
 * but for content rows rather than a numeric rule.
 *
 * Returns `undefined` when neither an exact nor a NULL row is present (e.g. a
 * 2014-only row queried for a 2024 character) — callers treat that exactly
 * like "not in the catalog", the same as an unknown name today.
 */
export function resolveEditionRow<T extends EditionTagged>(
  candidates: T[],
  edition: RulesEdition,
): T | undefined {
  return candidates.find((row) => row.edition === edition) ?? candidates.find((row) => row.edition === null);
}

/**
 * Prisma `where` fragment selecting only the rows a character's edition can
 * ever resolve to (its own edition, or the shared NULL row) — narrows a
 * `findMany` before handing the (at most two) candidates to
 * `resolveEditionRow`, rather than fetching every edition's rows.
 */
export function editionOrShared(edition: RulesEdition): { OR: [{ edition: RulesEdition }, { edition: null }] } {
  return { OR: [{ edition }, { edition: null }] };
}

/**
 * Upsert-by-find for a catalog row whose unique key includes `edition`
 * (Feat/Subclass/Background, #1306). Prisma's compound-unique shorthand
 * (`where: { name_edition: {...} }`) lowers to `edition = $1`, which never
 * matches under SQL's three-valued logic when the caller wants the shared
 * `edition: null` row — even though NULLS NOT DISTINCT makes that row
 * genuinely unique at the constraint level — and `upsert`/`findUnique`
 * reject a literal `null` there at runtime for exactly this reason.
 * `findFirst` has no such restriction (a plain filter lowers to `IS NULL`
 * correctly), so both seed.ts and test fixtures upsert find-then-write
 * instead of the compound-key shortcut whenever `edition` may be null.
 */
export async function upsertEditionRow<Where extends object, Create, Update, Row extends { id: string }>(
  model: {
    findFirst(args: { where: Where }): Promise<Row | null>;
    create(args: { data: Create }): Promise<Row>;
    update(args: { where: { id: string }; data: Update }): Promise<Row>;
  },
  where: Where,
  create: Create,
  update: Update,
): Promise<Row> {
  const existing = await model.findFirst({ where });
  return existing ? model.update({ where: { id: existing.id }, data: update }) : model.create({ data: create });
}
