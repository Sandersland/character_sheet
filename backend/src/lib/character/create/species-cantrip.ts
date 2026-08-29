import { prisma } from "@/lib/core/prisma.js";
import { creationSpellEntry } from "@/lib/spellcasting/spellcasting.js";
import { type SpellEntry } from "@/lib/spellcasting/spell-state.js";
import { classesOf, rejectCrossEditionSpellForks, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { type ChooseCantrip } from "@/lib/srd/species-trait-choices.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type { Fail, PhaseResult } from "./shared.js";
import { creationPickError, type CreationSpellRow } from "./spells.js";

async function speciesCantripListError(
  row: CreationSpellRow | undefined,
  id: string,
  spells: string[],
  edition: RulesEdition,
): Promise<Fail | null> {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (row.level !== 0) return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  if (!spells.includes(row.name)) {
    return { ok: false, status: 400, error: `speciesCantripId: ${row.name} is not one of this species' cantrip options` };
  }
  const forkError = await rejectCrossEditionSpellForks([row], edition);
  return forkError ? { ok: false, status: 400, error: forkError } : null;
}

export async function resolveSpeciesCantripGrant(
  input: CreateCharacterBody,
  spec: ChooseCantrip | null,
  existingEntries: SpellEntry[],
  edition: RulesEdition,
): Promise<PhaseResult<{ entry: SpellEntry | null }>> {
  const { speciesCantripId } = input;
  if (!spec) {
    if (speciesCantripId) {
      return { ok: false, status: 400, error: "speciesCantripId not allowed: this species has no cantrip choice" };
    }
    return { ok: true, entry: null };
  }
  if (!speciesCantripId) {
    return { ok: false, status: 400, error: "speciesCantripId required: this species grants a choice of cantrip" };
  }
  if (existingEntries.some((e) => e.spellId === speciesCantripId)) {
    return { ok: false, status: 400, error: "speciesCantripId duplicates a class-picked spell" };
  }
  const raw = await prisma.spell.findUnique({
    where: { id: speciesCantripId },
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
  });
  const row = raw ? { ...raw, classes: classesOf(raw) } : undefined;
  const error = await speciesCantripPickError(row, speciesCantripId, spec, edition);
  if (error) return error;
  const entry: SpellEntry = { ...creationSpellEntry(row!), source: "species", castingAbility: spec.castingAbility ?? input.castingAbility };
  return { ok: true, entry };
}

async function speciesCantripPickError(
  row: CreationSpellRow | undefined,
  id: string,
  spec: ChooseCantrip,
  edition: RulesEdition,
): Promise<Fail | null> {
  if (spec.spells) return speciesCantripListError(row, id, spec.spells, edition);
  const classDisplay = spec.list!.charAt(0).toUpperCase() + spec.list!.slice(1);
  return creationPickError(row, id, "cantrip", spec.list!, classDisplay, 0);
}
