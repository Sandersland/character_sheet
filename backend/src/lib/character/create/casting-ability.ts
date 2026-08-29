import { prisma } from "@/lib/core/prisma.js";
import { chooseCantripNeedsPlayerAbility, type ChooseCantrip } from "@/lib/srd/species-trait-choices.js";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type { PhaseResult, SpeciesSelection } from "./shared.js";

async function speciesGrantsSpells(speciesId: string, variantId: string | null): Promise<boolean> {
  const count = await prisma.speciesGrantedSpell.count({
    where: { speciesId, OR: variantId ? [{ variantId: null }, { variantId }] : [{ variantId: null }] },
  });
  return count > 0;
}

export async function resolveCastingAbility(
  input: CreateCharacterBody,
  speciesSelection: SpeciesSelection,
  chooseCantrip: ChooseCantrip | null,
): Promise<PhaseResult<{ castingAbility: string | null }>> {
  const submitted = input.castingAbility;
  const grantsSpells = await speciesGrantsSpells(speciesSelection.speciesId, speciesSelection.variantId);
  const needsAbility = grantsSpells || chooseCantripNeedsPlayerAbility(chooseCantrip);
  if (!needsAbility) {
    if (submitted) {
      const error = chooseCantrip
        ? "castingAbility not allowed: this species/variant's spellcasting ability is fixed"
        : "castingAbility not allowed: this species/variant grants no spells";
      return { ok: false, status: 400, error };
    }
    return { ok: true, castingAbility: null };
  }
  if (!submitted) {
    return { ok: false, status: 400, error: "castingAbility required: this species/variant grants spells with a chosen casting ability" };
  }
  return { ok: true, castingAbility: submitted };
}
