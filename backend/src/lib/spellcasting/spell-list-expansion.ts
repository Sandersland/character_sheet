// Read path for #1631's SubclassSpellListExpansion — spells a subclass adds
// to the CHOOSABLE class spell list (not a free grant, see granted-spells.ts's
// deriveGrantedSpells for that sibling mechanism). Loaded by whichever caller
// already resolved a character/creation-draft's subclassId (character-create.ts,
// level-up-transaction.ts's resolveLevelUpContext, the GET /api/spells picker
// route) and unioned into that caller's own choosable-pool check — this module
// never decides eligibility itself, only resolves the admitted spellId set.
import { prisma } from "@/lib/core/prisma.js";
import type { RulesEdition } from "@character-sheet/shared-types";

/**
 * The spellIds a subclass's list-expansion admits for a character's edition —
 * edition-or-NULL admission (#1625's convention), filtered in SQL directly
 * (unlike admittedGrants in granted-spells.ts, which filters an already-loaded
 * relation in memory because characterInclude is a module-level const with no
 * access to the character's edition — this is a standalone query, so the
 * WHERE clause IS the one filter site). `null`/absent subclassId (no subclass
 * chosen, or a homebrew subclass with no catalog row) admits nothing.
 */
export async function loadSubclassSpellListExpansionIds(
  subclassId: string | null | undefined,
  edition: RulesEdition,
): Promise<string[]> {
  if (!subclassId) return [];
  const rows = await prisma.subclassSpellListExpansion.findMany({
    where: { subclassId, OR: [{ edition: null }, { edition }] },
    select: { spellId: true },
  });
  return rows.map((r) => r.spellId);
}
