import {
  CharacterEvent,
  CharacterEventCategory,
  CharacterEventType,
  Prisma,
} from "../generated/prisma/client.js";

// Runtime-checkable set of every valid CharacterEventCategory, derived from the
// Prisma-generated enum so it can never drift from the schema.
const CATEGORY_VALUES = new Set<string>(Object.values(CharacterEventCategory));

function asCategory(value: string | undefined): CharacterEventCategory | undefined {
  return value !== undefined && CATEGORY_VALUES.has(value)
    ? (value as CharacterEventCategory)
    : undefined;
}

// Runtime-checkable set of every valid CharacterEventType, derived from the
// Prisma-generated enum so it can never drift from the schema. Mirrors
// asCategory: an unknown type value is silently ignored (unfiltered), not a 400.
const TYPE_VALUES = new Set<string>(Object.values(CharacterEventType));

function asType(value: string | undefined): CharacterEventType | undefined {
  return value !== undefined && TYPE_VALUES.has(value)
    ? (value as CharacterEventType)
    : undefined;
}

// Pure query-shaping for the activity read path; no DB access.
export function buildActivityQuery(
  characterId: string,
  rawQuery: Record<string, unknown>,
): Prisma.CharacterEventFindManyArgs {
  // Only apply the category filter when the query value is a real enum member;
  // an unknown value is silently ignored (unfiltered), matching prior behavior.
  const category = asCategory(
    typeof rawQuery.category === "string" ? rawQuery.category : undefined,
  );
  // Same validate-or-ignore contract as category: an unknown event type is
  // silently dropped (unfiltered) rather than 400-ing.
  const type = asType(
    typeof rawQuery.type === "string" ? rawQuery.type : undefined,
  );
  const sessionId =
    typeof rawQuery.sessionId === "string" ? rawQuery.sessionId : undefined;
  const entityId =
    typeof rawQuery.entityId === "string" ? rawQuery.entityId : undefined;
  const includeFields = rawQuery.includeFields === "1";
  const revertedFilter = rawQuery.reverted === "0"
    ? false
    : rawQuery.reverted === "1"
    ? true
    : undefined; // undefined = no filter (include all)

  return {
    where: {
      characterId,
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(entityId ? { entityId } : {}),
      ...(revertedFilter !== undefined ? { reverted: revertedFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: includeFields ? { fields: true } : undefined,
  };
}

type ActivityEventRow = CharacterEvent & {
  fields?: Array<{ id: string; path: string; oldValue: unknown; newValue: unknown }>;
};

export function serializeActivityEvent(row: ActivityEventRow) {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    summary: row.summary,
    entityType: row.entityType ?? undefined,
    entityId: row.entityId ?? undefined,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
    data: row.data ?? undefined,
    actor: row.actor,
    reverted: row.reverted,
    batchId: row.batchId ?? undefined,
    createdAt: row.createdAt,
    fields: "fields" in row
      ? (row as typeof row & { fields: Array<{ id: string; path: string; oldValue: unknown; newValue: unknown }> })
          .fields.map((f) => ({
            id: f.id,
            path: f.path,
            oldValue: f.oldValue ?? undefined,
            newValue: f.newValue ?? undefined,
          }))
      : undefined,
  };
}
