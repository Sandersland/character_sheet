import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionRow } from "@/lib/rules/catalog-edition.js";
import { RULES_EDITION_LABELS } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Accepts the shared client or seed's own separate adapter-bound PrismaClient instance — mirrors the reasoning behind the Db alias.
type SpellClassDb = PrismaClient | Prisma.TransactionClient;

// Every membership READ composes this into its own select/include, then flattens with classesOf to the served `classes: string[]` shape — the join stays an internal storage detail.
export const SPELL_CLASS_MEMBERSHIP_SELECT = {
  classMemberships: { select: { className: true } },
} as const;

export function classesOf(spell: { classMemberships: { className: string }[] }): string[] {
  return spell.classMemberships.map((m) => m.className);
}

// The single implementation for both write paths — the custom spell POST/PATCH routes and seedSpellClassesFor.
// db is a parameter, never the module's own prisma import, so a caller can pass its transaction client and commit the spell + SpellClass rows together.
// The ONLY place classNames gets lowercased/deduped — returns the normalized list so a caller building a response never has to re-derive it.
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

// Deliberately NOT crossEditionRejection's plain edition-must-match check — this only rejects a row once a genuine fork exists: another row shares its name AND resolveEditionRow prefers that row for the requesting edition. With no better candidate, the existing row is admitted regardless of its own tag.
// Message-returning, not throwing — same rationale as crossEditionRejection: callers wrap it in their own domain error shape.
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

// List-serving counterpart to rejectCrossEditionSpellForks — resolves each distinct spell NAME to the exact-edition row, else the shared (edition: null) row, else it is not served at all; same exact-then-shared rule resolveEditionCatalog applies to Feat/Subclass/Background.
// Grouping key is (name, catalogOwnerUserId), not bare name (#1786) — a homebrew spell can legally share a name with a seeded spell; widening the key keeps each homebrew row in its own singleton group so it's served alongside the seeded row rather than replacing it (same fix resolveEditionCatalog's keyOf applies for Subclass).
// catalogOwnerUserId is the RAW CatalogEntry.ownerUserId (grouping only) — never the wire's leak-safe ownerId field; conflating them would let an ownerId-nulling fix silently merge a row's group with the seeded one of the same name (#1815).
export function resolveSpellCatalogForEdition<
  T extends { name: string; edition: RulesEdition | null; catalogOwnerUserId: string | null },
>(rows: T[], edition: RulesEdition): T[] {
  const byName = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.name}::${row.catalogOwnerUserId ?? ""}`;
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
