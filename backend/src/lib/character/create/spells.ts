import { prisma } from "@/lib/core/prisma.js";
import { level1SpellPicksFor, maxSpellLevelForClass } from "@/lib/srd/srd.js";
import { creationSpellEntry } from "@/lib/spellcasting/spellcasting.js";
import { type SpellEntry } from "@/lib/spellcasting/spell-state.js";
import { classesOf, rejectCrossEditionSpellForks, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type { Fail, PhaseResult, ResolvedSelections } from "./shared.js";

export type CreationSpellRow = NonNullable<Awaited<ReturnType<typeof prisma.spell.findFirst>>> & { classes: string[] };

// expandedSpellIds (#1631): a subclass's list expansion (PHB'14 Warlock patrons) widens which spell NAMES are legal, never the level band.
export function creationPickError(
  row: CreationSpellRow | undefined,
  id: string,
  kind: "cantrip" | "spell",
  className: string,
  classDisplay: string,
  maxLevel: number,
  expandedSpellIds: Set<string> = new Set(),
): Fail | null {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (kind === "cantrip" && row.level !== 0) {
    return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  }
  if (kind === "spell" && (row.level < 1 || row.level > maxLevel)) {
    return { ok: false, status: 400, error: `${row.name} is not a spell ${classDisplay} can learn at level 1 (max spell level: ${maxLevel})` };
  }
  if (!row.classes.includes(className) && !expandedSpellIds.has(id)) {
    return { ok: false, status: 400, error: `${row.name} is not on the ${classDisplay} spell list` };
  }
  return null;
}

type CreationSpells = NonNullable<CreateCharacterBody["spells"]>;

// picks comes from level1SpellPicksFor, the same function the served reference count uses, so the two can't drift apart.
function creationSpellCountError(
  spells: CreationSpells,
  className: string,
  classDisplay: string,
  edition: RulesEdition,
): Fail | null {
  const picks = level1SpellPicksFor(className, null, edition);
  if (picks == null) {
    return { ok: false, status: 400, error: `${classDisplay} does not cast spells at level 1` };
  }
  if (spells.cantripIds.length !== picks.cantrips) {
    return { ok: false, status: 400, error: `Expected ${picks.cantrips} cantrip(s), got ${spells.cantripIds.length}` };
  }
  if (spells.spellIds.length !== picks.spells) {
    return { ok: false, status: 400, error: `Expected ${picks.spells} level-1 spell(s), got ${spells.spellIds.length}` };
  }
  const allIds = [...spells.cantripIds, ...spells.spellIds];
  if (new Set(allIds).size !== allIds.length) {
    return { ok: false, status: 400, error: "A spell can be chosen only once" };
  }
  return null;
}

export async function resolveCreationSpells(
  input: CreateCharacterBody,
  selections: ResolvedSelections,
): Promise<PhaseResult<{ spellEntries: SpellEntry[] | null }>> {
  const { spells } = input;
  if (!spells) return { ok: true, spellEntries: null };

  const classDisplay = selections.characterClass.name;
  const className = classDisplay.toLowerCase();
  const { edition } = selections;
  const countError = creationSpellCountError(spells, className, classDisplay, edition);
  if (countError) return countError;

  const allIds = [...spells.cantripIds, ...spells.spellIds];
  const rows = allIds.length
    ? await prisma.spell.findMany({ where: { id: { in: allIds } }, include: SPELL_CLASS_MEMBERSHIP_SELECT })
    : [];
  const forkError = await rejectCrossEditionSpellForks(rows, edition);
  if (forkError) return { ok: false, status: 400, error: forkError };
  const byId = new Map(rows.map((r) => [r.id, { ...r, classes: classesOf(r) }]));
  const maxLevel = maxSpellLevelForClass(className, 1, null, edition);
  const expandedSpellIds = new Set(await loadSubclassSpellListExpansionIds(selections.subclassId, edition));

  const entries: SpellEntry[] = [];
  for (const [ids, kind] of [[spells.cantripIds, "cantrip"], [spells.spellIds, "spell"]] as const) {
    for (const id of ids) {
      const row = byId.get(id);
      const error = creationPickError(row, id, kind, className, classDisplay, maxLevel, expandedSpellIds);
      if (error) return error;
      entries.push(creationSpellEntry(row!));
    }
  }
  return { ok: true, spellEntries: entries };
}
