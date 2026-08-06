// Shared spell-name -> Spell.id resolution, the SAME shape seed-granted-
// spells.ts and seed-spell-list-expansions.ts each resolve their own rows'
// spellId against (fallow flagged the query+resolve pair as a clone;
// extracted once rather than kept as two near-identical copies, mirroring
// species-seed-lookup.ts's own role for its two callers).
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { resolveEditionRow } from "../../src/lib/rules/catalog-edition.js";
import type { SeedEdition } from "./edition.js";

interface CatalogSpellRow {
  id: string;
  edition: SeedEdition | null;
}

// Falls back to the sole candidate when resolveEditionRow finds neither an
// exact-edition nor a shared/NULL row — e.g. a row tagged EDITION_2014 naming
// a spell that (today) has only an EDITION_2024 row. A grant/expansion row's
// own edition describes when the SUBCLASS variant applies, not a guarantee
// the spell it names has forked too.
function soleCandidate(candidates: CatalogSpellRow[]): CatalogSpellRow | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

// Resolve the catalog Spell a grant/expansion row points at (#1710: Spell.name
// stopped being globally unique). spellId is a concrete FK snapshotted here at
// seed time, not re-resolved per-character: a row tagged with its own edition
// prefers THAT edition's spell row when one exists (resolveEditionRow's usual
// exact-then-shared fallback), an untagged (shared) row is pinned to
// EDITION_2024 (the same "no live character to resolve against yet" default
// resolveOriginFeatId uses), and either falls back to the sole candidate above
// when neither matches. `family` names the caller's own row kind (e.g.
// "granted"/"list-expansion") in the not-found error only.
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
