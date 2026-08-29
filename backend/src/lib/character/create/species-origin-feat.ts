import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/core/prisma.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import { type AdvancementEntry, type FeatImprovement } from "@/lib/classes/resources.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type { Fail, PhaseResult } from "./shared.js";

function speciesOriginFeatNotServedResult(speciesOriginFeatId: string | undefined): PhaseResult<{ entry: null }> {
  if (speciesOriginFeatId) {
    return { ok: false, status: 400, error: "speciesOriginFeatId not allowed: this species has no Origin feat choice" };
  }
  return { ok: true, entry: null };
}

type OriginFeatRow = NonNullable<Awaited<ReturnType<typeof prisma.feat.findUnique>>>;

function validateOriginFeatRow(feat: OriginFeatRow, edition: RulesEdition): Fail | null {
  const mismatch = crossEditionRejection(feat, `Feat "${feat.name}"`, edition);
  if (mismatch) return { ok: false, status: 400, error: mismatch };
  if (feat.category !== "origin") {
    return { ok: false, status: 400, error: `speciesOriginFeatId: "${feat.name}" is not an Origin feat` };
  }
  return null;
}

// PHB'24: an Origin feat is normally taken once; taking it twice is legal only when the feat is explicitly repeatable (Magic Initiate, Skilled).
function originFeatDuplicateError(feat: OriginFeatRow, backgroundOriginEntry: AdvancementEntry | null): Fail | null {
  if (backgroundOriginEntry?.featId === feat.id && !feat.repeatable) {
    return {
      ok: false,
      status: 400,
      error: `speciesOriginFeatId: "${feat.name}" duplicates your background's Origin feat and is not repeatable`,
    };
  }
  return null;
}

// Same slot-exempt AdvancementEntry shape as buildOriginEntry — just resolved from a player-chosen feat instead of the background's fixed FK.
function buildSpeciesOriginFeatEntry(feat: OriginFeatRow): AdvancementEntry {
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
    featDescription: feat.description,
    improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
  };
}

export async function resolveSpeciesOriginFeatGrant(
  input: CreateCharacterBody,
  hasSpec: boolean,
  edition: RulesEdition,
  backgroundOriginEntry: AdvancementEntry | null,
): Promise<PhaseResult<{ entry: AdvancementEntry | null }>> {
  const { speciesOriginFeatId } = input;
  if (!hasSpec) return speciesOriginFeatNotServedResult(speciesOriginFeatId);
  if (!speciesOriginFeatId) {
    return { ok: false, status: 400, error: "speciesOriginFeatId required: this species grants a choice of Origin feat" };
  }
  const feat = await prisma.feat.findUnique({ where: { id: speciesOriginFeatId } });
  if (!feat) {
    return { ok: false, status: 400, error: `Unknown feat id: ${speciesOriginFeatId}` };
  }
  const rowError = validateOriginFeatRow(feat, edition);
  if (rowError) return rowError;
  const dupError = originFeatDuplicateError(feat, backgroundOriginEntry);
  if (dupError) return dupError;
  return { ok: true, entry: buildSpeciesOriginFeatEntry(feat) };
}
