// Authors SpellClass rows for the Spell↔class join (#1711, F2 of epic #1517).
// Split out of seedSpells so that loop stays a single upsert-then-attach
// pass — same shape as seed-species-granted-spells.ts's split from
// seed-species.ts.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { reconcileSpellClasses } from "../../src/lib/spellcasting/spell-classes.js";

/**
 * Upsert one SpellClass row per class in `classNames`, then delete any
 * membership row for this spell whose class ISN'T in that list — the same
 * two-step (write current, prune the rest) every other catalog seeder in
 * this file uses, scoped here to one spellId's own rows so it can never
 * touch a sibling spell's membership. Cascade (onDelete: Cascade on
 * SpellClass.spell) already handles the case where the whole Spell row is
 * pruned — this function only runs for spells seedSpells keeps.
 *
 * Thin wrapper over reconcileSpellClasses (spell-classes.ts, #1785, epic
 * #1782 2/5's write-side reconciler) — kept as its own export because every
 * seed caller already imports it by this name; `prisma` here is seed.ts's
 * OWN PrismaClient instance, never the src/ singleton reconcileSpellClasses'
 * other caller (custom-spells.ts) uses.
 */
export async function seedSpellClassesFor(
  prisma: PrismaClient,
  spellId: string,
  classNames: string[],
): Promise<void> {
  return reconcileSpellClasses(prisma, spellId, classNames);
}
