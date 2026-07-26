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
 * Composes a Prisma `where` with the edition-or-shared constraint (narrows a
 * `findMany` before handing the at-most-two candidates to `resolveEditionRow`,
 * rather than fetching every edition's rows). Takes the caller's `where` as
 * an argument and nests it inside an outer `AND` — a spreadable fragment
 * (`{ ...where, ...editionOrShared(edition) }`) was tried first and rejected:
 * whichever top-level key the fragment used (`OR` or `AND`), spreading it
 * silently clobbered a sibling use of THAT SAME key at the call site — proven
 * empirically for both shapes, not assumed. Passing `where` in as a value
 * (never spread) makes clobbering structurally impossible regardless of what
 * keys the caller's own filter uses.
 *
 * (A nullable-enum `{ in: [edition, null] }` looks like an even simpler
 * alternative but Prisma rejects `null` inside `in` outright — verified
 * directly against this schema, not assumed.)
 */
export function withEditionOrShared<Where extends object>(
  where: Where,
  edition: RulesEdition,
): { AND: [Where, { OR: [{ edition: RulesEdition }, { edition: null }] }] } {
  return { AND: [where, { OR: [{ edition }, { edition: null }] }] };
}

/**
 * Resolve a full catalog LIST for a character's edition — groups candidates
 * by `keyOf` (their business key) and applies `resolveEditionRow` per group,
 * so a caller serving a picker (e.g. `GET /api/feats`) returns exactly one
 * row per key instead of every edition's rows. `keyOf` is required rather
 * than defaulting to `row.name`: Feat/GrantedAbility/Action/Background key on
 * name alone, but Subclass's business key is `(classId, name)` — a bare
 * name-default would silently collapse two same-named subclasses under
 * different classes. Order of the input is preserved for each group's first
 * occurrence.
 */
export function resolveEditionCatalog<T extends EditionTagged>(
  rows: T[],
  edition: RulesEdition,
  keyOf: (row: T) => string,
): T[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }
  const resolved: T[] = [];
  for (const group of byKey.values()) {
    const row = resolveEditionRow(group, edition);
    if (row) resolved.push(row);
  }
  return resolved;
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
 *
 * Seed- and test-fixture-only — do NOT call this from a request path. The
 * find-then-write isn't transactional: it's safe here because seed.ts runs
 * single-threaded and each vitest worker owns its own database (#1269), but a
 * concurrent request handler racing two callers could still lose to a
 * genuine duplicate between the `findFirst` and the `create` (which would
 * then fail loudly against NULLS NOT DISTINCT, not corrupt data — but that's
 * still the wrong shape for a transaction handler).
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
