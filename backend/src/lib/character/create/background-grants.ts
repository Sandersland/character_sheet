import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/core/prisma.js";
import {
  applyAbilitySpread,
  backgroundGrantsAbilitySpread,
  backgroundGrantsOriginFeat,
  floatingSpreadShapeValid,
} from "@/lib/rules/background-grants.js";
import { resolveEditionRow, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { type AdvancementEntry, type FeatImprovement } from "@/lib/classes/resources.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import { abilityCapOverflowError, type BackgroundGrants, type Fail, type PhaseResult, type ResolvedBackground } from "./shared.js";

const MAGIC_INITIATE_CLASS_BY_BACKGROUND: Record<string, string> = {
  Acolyte: "Cleric",
  Sage: "Wizard",
};

// Ability scores are capped at 20 (SRD 5.2).
// floatingSpreadShapeValid is the SAME shared shape check validateSpeciesFloating uses — not a copy.
function validateBackgroundSpread(
  spread: Record<string, number>,
  choices: string[],
  base: Record<string, number>,
): Fail | null {
  const entries = Object.entries(spread);
  const invalid = entries.filter(([ability]) => !choices.includes(ability)).map(([a]) => a);
  if (invalid.length > 0) {
    return { ok: false, status: 400, error: `backgroundAbilities: ${invalid.join(", ")} not in this background's choices (${choices.join(", ")})` };
  }
  if (!floatingSpreadShapeValid(entries.map(([, amount]) => amount))) {
    return { ok: false, status: 400, error: "backgroundAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)" };
  }
  return abilityCapOverflowError(entries, base, "backgroundAbilities");
}

// Origin feats are a PHB'24-only mechanic (#1504).
// Re-resolves the feat by NAME against this character's edition rather than trusting the seed-baked FK, with no fallback on a miss — grant nothing rather than risk snapshotting the wrong edition's mechanics.
async function buildOriginEntry(background: ResolvedBackground, edition: RulesEdition): Promise<AdvancementEntry | null> {
  if (!backgroundGrantsOriginFeat(edition)) return null;
  if (!background?.originFeat) return null;
  const baked = background.originFeat;
  const candidates = await prisma.feat.findMany({ where: withEditionOrShared({ name: baked.name }, edition) });
  const feat = resolveEditionRow(candidates, edition);
  if (!feat) return null;
  const flavor = feat.name === "Magic Initiate" ? MAGIC_INITIATE_CLASS_BY_BACKGROUND[background.name] : undefined;
  const featDescription = flavor ? `${feat.description}\n\nBackground grant: ${flavor} spell list.` : feat.description;
  return {
    id: randomUUID(),
    level: 1,
    kind: "feat",
    origin: true,
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    featId: feat.id,
    featName: feat.name,
    featDescription,
    improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
  };
}

// The background ability spread is a PHB'24-only mechanic (#1572).
export async function resolveBackgroundGrants(
  input: CreateCharacterBody,
  background: ResolvedBackground,
  edition: RulesEdition,
): Promise<PhaseResult<BackgroundGrants>> {
  const spread = input.backgroundAbilities;
  const choices = background?.abilityChoices ?? [];

  if (spread) {
    if (!backgroundGrantsAbilitySpread(edition)) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: background ability scores are a 2024 rule" };
    }
    if (choices.length === 0) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: this background has no ability spread" };
    }
    const shapeError = validateBackgroundSpread(spread, choices, input.abilityScores);
    if (shapeError) return shapeError;
  }

  return {
    ok: true,
    effectiveScores: applyAbilitySpread(input.abilityScores, spread),
    originEntry: await buildOriginEntry(background, edition),
  };
}
