import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionRow } from "@/lib/rules/catalog-edition.js";
import { RULES_EDITION_LABELS } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Accepts either the shared client or prisma/seed.ts's own PrismaClient
// instance (a different adapter-bound instance, never the src/ singleton) —
// same reasoning as lib/auth/access.ts's `Db` alias.
type SpellClassDb = PrismaClient | Prisma.TransactionClient;

/**
 * Shared read-side shape for the Spell↔SpellClass join (#1711, F2 of epic
 * #1517's 2014 catalog fork). Every membership READ composes
 * SPELL_CLASS_MEMBERSHIP_SELECT into its own `select`/`include` and flattens
 * the result back to `classes: string[]` with `classesOf` — the wire/served
 * shape every caller (route JSON, level-up eligibility, creation picks) still
 * exposes, so the join stays an internal storage detail (CLAUDE.md: the
 * frontend never originates a rule, and never re-derives one).
 */
export const SPELL_CLASS_MEMBERSHIP_SELECT = {
  classMemberships: { select: { className: true } },
} as const;

/** Flattens a row's `classMemberships` relation to the served `classes: string[]` shape. */
export function classesOf(spell: { classMemberships: { className: string }[] }): string[] {
  return spell.classMemberships.map((m) => m.className);
}

/**
 * Reconciles a spell's SpellClass rows to exactly `classNames` (lowercased,
 * deduped) — upsert each, then prune any row not in the list. The single
 * implementation for both write paths: custom-spells.ts's POST/PATCH routes
 * (#1785, epic #1782 2/5) call it directly with the src/ singleton (inside
 * their own $transaction, so the spell row and its SpellClass rows commit or
 * roll back together — `db` is a parameter, never the module's own `prisma`
 * import, specifically so a caller can pass its transaction client here);
 * prisma/seed/seed-spell-classes.ts's seedSpellClassesFor is a thin wrapper
 * passing seed.ts's OWN PrismaClient instance (a separate adapter-bound
 * client the seed script's own lifecycle owns).
 *
 * This is the ONLY place classNames gets lowercased/deduped (both callers
 * pass their raw input straight through) — returns the normalized list so a
 * caller building a response payload never has to re-derive it.
 */
export async function reconcileSpellClasses(
  db: SpellClassDb,
  spellId: string,
  classNames: string[],
): Promise<string[]> {
  const normalized = [...new Set(classNames.map((c) => c.toLowerCase()))];
  for (const className of normalized) {
    await db.spellClass.upsert({
      where: { spellId_className: { spellId, className } },
      create: { spellId, className },
      update: {},
    });
  }
  await db.spellClass.deleteMany({
    where: { spellId, className: { notIn: normalized } },
  });
  return normalized;
}

/**
 * Cross-edition admission check for CLIENT-SUPPLIED spell ids, already
 * resolved to rows by resolveCreationSpells / loadPickCatalogRows (#1712).
 *
 * Deliberately NOT crossEditionRejection's plain "row.edition must be null or
 * match" (catalog-edition.ts): the spell catalog is still mid-migration
 * (epic #1517) — today's ~109 rows are ALL tagged EDITION_2024 with no 2014
 * counterpart yet (the 2014 content slices, #1713-#1721, are what will
 * populate spells-2014/*.ts), so a plain tag-mismatch reject would 400 every
 * leveled spell a 2014 character tries to learn or scribe, regressing
 * #1729's shipped 2014 known-caster level-up. This rejects a row ONLY once a
 * genuine fork exists: when another row shares its name AND
 * resolveEditionRow prefers THAT row for the requesting edition, the
 * submitted row is provably the wrong fork. With no better candidate (the
 * whole catalog today), the single existing row is admitted regardless of
 * its own tag — the same "shared until proven otherwise" posture the route
 * takes when it falls back through the NULL row.
 *
 * Batches every mismatched row's name into ONE extra query rather than one
 * per row. Returns the first rejection message found (message-returning, not
 * throwing — same rationale as crossEditionRejection: callers wrap it in
 * their own domain error shape).
 */
export async function rejectCrossEditionSpellForks(
  rows: { id: string; name: string; edition: RulesEdition | null }[],
  edition: RulesEdition,
): Promise<string | null> {
  const mismatched = rows.filter((row) => row.edition !== null && row.edition !== edition);
  if (mismatched.length === 0) return null;

  const names = [...new Set(mismatched.map((row) => row.name))];
  const candidates = await prisma.spell.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, edition: true },
  });
  const candidatesByName = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const group = candidatesByName.get(candidate.name);
    if (group) group.push(candidate);
    else candidatesByName.set(candidate.name, [candidate]);
  }

  for (const row of mismatched) {
    const resolved = resolveEditionRow(candidatesByName.get(row.name) ?? [], edition);
    if (resolved && resolved.id !== row.id) {
      return `${row.name} is ${RULES_EDITION_LABELS[row.edition!]} content, not usable by a ${RULES_EDITION_LABELS[edition]} character`;
    }
  }
  return null;
}

/**
 * List-serving counterpart to rejectCrossEditionSpellForks, for GET
 * /api/spells (#1712) — resolves each distinct spell NAME to at most one row
 * per requesting edition: the exact-edition row, else the shared
 * (edition: null) row, else the name is not served to this edition at all.
 * Same exact-then-shared rule resolveEditionCatalog (catalog-edition.ts)
 * already applies to Feat/Subclass/Background.
 *
 * #1712 originally added a THIRD fallback here — the group's one remaining
 * row, regardless of ITS edition, when neither of the above existed —
 * because the spell catalog was then mid-migration (epic #1517): every row
 * was tagged EDITION_2024 with no 2014 counterpart yet, so a bare tag
 * mismatch would have emptied the 2014 creation/level-up picker outright.
 * #1713-#1721 finished that migration (2014 is now its own ~350-row PHB'14
 * breadth against 2024's curated ~116, prisma/seed/spells.ts's own header),
 * so the grace is retired (#1372/#1753): it had started leaking BOTH ways —
 * a lone EDITION_2014 row (the bulk of that breadth) was also being served
 * to a 2024 request, defeating the curated 2024 list entirely (every
 * distinct name resolved for both editions). A handful of spells still
 * missing their 2014 counterpart (#1742/#1746) are now genuinely absent from
 * a 2014 request rather than silently borrowed from 2024 — tracked as
 * content debt on those issues, not papered over here.
 *
 * A genuine fork (name present under both editions) is unaffected either
 * way: the exact-match branch always wins — proven by spells.test.ts's
 * fork-disjointness suite.
 *
 * Grouping key is `(name, ownerId)`, not bare `name` (#1786, epic #1782 3/5):
 * a user's homebrew spell (non-null ownerId) can legally share a NAME with a
 * seeded spell (null ownerId) — they're distinct rows, both tagged
 * EDITION_2014, and neither should shadow the other the way a genuine 2014/
 * 2024 fork's two rows are MEANT to collapse to one. Widening the key to
 * include ownerId puts every homebrew row in its own singleton group (the
 * `(name, edition, ownerId)` unique constraint guarantees at most one), so it
 * always survives resolution and is served ALONGSIDE the seeded row of the
 * same name rather than replacing it — same "must not drop one for the
 * other" outcome resolveEditionCatalog's own `keyOf` widening documents for
 * Subclass's compound key.
 */
export function resolveSpellCatalogForEdition<T extends { name: string; edition: RulesEdition | null; ownerId: string | null }>(
  rows: T[],
  edition: RulesEdition,
): T[] {
  const byName = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.name}::${row.ownerId ?? ""}`;
    const group = byName.get(key);
    if (group) group.push(row);
    else byName.set(key, [row]);
  }
  const resolved: T[] = [];
  for (const group of byName.values()) {
    const exact = group.find((row) => row.edition === edition);
    const shared = group.find((row) => row.edition === null);
    const picked = exact ?? shared;
    if (picked) resolved.push(picked);
  }
  return resolved;
}
