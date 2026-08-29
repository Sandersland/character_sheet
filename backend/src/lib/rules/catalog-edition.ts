import type { RulesEdition } from "@character-sheet/shared-types";

import { RULES_EDITION_LABELS } from "./edition.js";

export interface EditionTagged {
  edition: RulesEdition | null;
}

// The single place exact-then-NULL fallback ordering is expressed; no route, serializer, or seed module may re-derive it. Mirrors subclassGateLevel's one-function-per-rule pattern for content rows.
// Returns undefined when neither an exact nor a NULL row is present — callers treat that the same as an unknown name.
export function resolveEditionRow<T extends EditionTagged>(
  candidates: T[],
  edition: RulesEdition,
): T | undefined {
  return candidates.find((row) => row.edition === edition) ?? candidates.find((row) => row.edition === null);
}

// Message-returning rather than throwing, mirroring multiclassPrerequisitesMet — keeps this a rules leaf with zero HTTP/domain-error knowledge; a throwing helper would need a registered error class per call site.
export function crossEditionRejection(row: EditionTagged, what: string, edition: RulesEdition): string | null {
  if (row.edition === null || row.edition === edition) return null;
  return `${what} is ${RULES_EDITION_LABELS[row.edition]} content, not usable by a ${RULES_EDITION_LABELS[edition]} character`;
}

// Nests the caller's `where` inside an outer AND rather than spreading it — a spread `{ ...where, ...fragment }` silently clobbers a sibling OR or AND key at the call site.
// A nullable-enum `{ in: [edition, null] }` looks simpler but Prisma rejects a literal `null` inside `in`.
export function withEditionOrShared<Where extends object>(
  where: Where,
  edition: RulesEdition,
): { AND: [Where, { OR: [{ edition: RulesEdition }, { edition: null }] }] } {
  return { AND: [where, { OR: [{ edition }, { edition: null }] }] };
}

// `keyOf` is required rather than defaulting to `row.name` — Subclass's business key is `(classId, name)`, and a name default would silently collapse two same-named subclasses under different classes.
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

// Prisma's compound-unique shorthand (`where: { name_edition: {...} }`) lowers to `edition = $1`, which never matches the shared `edition: null` row under SQL's three-valued logic even though NULLS NOT DISTINCT makes that row unique at the constraint level; `findFirst` has no such restriction, so this does find-then-write instead.
// Seed- and test-fixture-only — do NOT call from a request path: the find-then-write isn't transactional (safe here since seed.ts is single-threaded and each vitest worker owns its own database), and a concurrent request handler could lose the race between findFirst and create.
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
