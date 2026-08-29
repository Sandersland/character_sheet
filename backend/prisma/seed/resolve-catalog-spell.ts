import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { resolveEditionRow } from "../../src/lib/rules/catalog-edition.js";
import type { SeedEdition } from "./edition.js";

interface CatalogSpellRow {
  id: string;
  edition: SeedEdition | null;
}

// A grant/expansion row's own edition describes the subclass variant, not a guarantee the spell it names has forked too.
function soleCandidate(candidates: CatalogSpellRow[]): CatalogSpellRow | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

// spellId is a concrete FK snapshotted here at seed time, not re-resolved per-character (#1710: Spell.name is no longer globally unique).
export async function resolveCatalogSpellId(
  prisma: PrismaClient,
  spellName: string,
  rowEdition: SeedEdition | null,
  family: string,
): Promise<string> {
  const candidates: CatalogSpellRow[] = (await prisma.spell.findMany({ where: { name: spellName }, select: { id: true, edition: true } })).map(
    (c) => ({ id: c.id, edition: c.edition as SeedEdition | null }),
  );
  const spell = resolveEditionRow(candidates, rowEdition ?? "EDITION_2024") ?? soleCandidate(candidates);
  if (!spell) throw new Error(`Seed error: ${family} spell "${spellName}" not in the Spell catalog`);
  return spell.id;
}
