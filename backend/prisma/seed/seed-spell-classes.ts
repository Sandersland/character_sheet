// Authors SpellClass rows for the Spell↔class join (#1711, F2 of epic #1517).
// Split out of seedSpells so that loop stays a single upsert-then-attach
// pass — same shape as seed-species-granted-spells.ts's split from
// seed-species.ts.
import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * Upsert one SpellClass row per class in `classNames`, then delete any
 * membership row for this spell whose class ISN'T in that list — the same
 * two-step (write current, prune the rest) every other catalog seeder in
 * this file uses, scoped here to one spellId's own rows so it can never
 * touch a sibling spell's membership. Cascade (onDelete: Cascade on
 * SpellClass.spell) already handles the case where the whole Spell row is
 * pruned — this function only runs for spells seedSpells keeps.
 */
export async function seedSpellClassesFor(
  prisma: PrismaClient,
  spellId: string,
  classNames: string[],
): Promise<void> {
  for (const className of classNames) {
    await prisma.spellClass.upsert({
      where: { spellId_className: { spellId, className } },
      create: { spellId, className },
      update: {},
    });
  }
  await prisma.spellClass.deleteMany({
    where: { spellId, className: { notIn: classNames } },
  });
}
