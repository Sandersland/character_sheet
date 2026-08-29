// Not a free grant — see deriveGrantedSpells for that sibling mechanism.
// This module never decides eligibility itself, only resolves the admitted spellId set; callers union it into their own choosable-pool check.
import { prisma } from "@/lib/core/prisma.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Edition-or-NULL admission (#1625's convention), filtered in SQL directly — unlike admittedGrants, which filters an already-loaded relation in memory; this is a standalone query, so the WHERE clause IS the one filter site.
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
