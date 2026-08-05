import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionRow } from "@/lib/rules/catalog-edition.js";
import { RULES_EDITION_LABELS } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

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
 * /api/spells (#1712) — same "shared until proven otherwise" posture, applied
 * to WHICH rows are offered rather than which submitted id is admitted.
 *
 * Groups candidates by name and prefers, in order: the exact-edition row, the
 * shared (edition: null) row, and — the one place this diverges from
 * resolveEditionCatalog (catalog-edition.ts) — the group's remaining row when
 * neither exists. That divergence is deliberate: resolveEditionCatalog's
 * plain exact-then-NULL rule is correct for Feat/Subclass/Background, whose
 * catalogs already have full coverage on both editions, so "no match" always
 * means a genuine edition-exclusive row. The spell catalog does NOT have that
 * coverage yet (epic #1517 mid-migration) — today's ~109 rows are ALL tagged
 * EDITION_2024 with no 2014 counterpart, so treating a bare tag mismatch as
 * "not in this edition's catalog" would empty the creation/level-up picker
 * for every 2014 caster and block character creation outright (caught by
 * creation.spec.ts's 2014 Warlock e2e test, which documents "level1SpellPicks
 * is edition-invariant, so a 2014 Warlock still walks it exactly like the
 * 2024 case" as existing, deliberate product behavior).
 *
 * This is inert once a genuine fork lands: a name with BOTH a 2014 and a
 * 2024 row still resolves to exactly the requesting edition's own row (the
 * exact-match branch wins before the fallback ever runs) — proven by
 * spells.test.ts's fork-disjointness suite. Only a name with a SINGLE,
 * single-edition-tagged row (today's whole real catalog) falls through to
 * the graceful branch and is served to both editions until #1713-#1721 give
 * it a real 2014 sibling.
 */
export function resolveSpellCatalogForEdition<T extends { name: string; edition: RulesEdition | null }>(
  rows: T[],
  edition: RulesEdition,
): T[] {
  const byName = new Map<string, T[]>();
  for (const row of rows) {
    const group = byName.get(row.name);
    if (group) group.push(row);
    else byName.set(row.name, [row]);
  }
  const resolved: T[] = [];
  for (const group of byName.values()) {
    const exact = group.find((row) => row.edition === edition);
    const shared = group.find((row) => row.edition === null);
    resolved.push(exact ?? shared ?? group[0]);
  }
  return resolved;
}
