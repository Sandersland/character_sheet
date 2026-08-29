// Kept out of applyManeuverOperations' module deliberately — that pulls in Prisma/castAbilityInTx, which the synchronous serializer (buildResourcesPayload) must not drag in.
import { readEffectSpec, type ClassDieResolver, type EffectRow } from "@/lib/combat/effects.js";

import { resolveClassDie } from "./registry.js";
import type { DerivedClassInfo } from "./types.js";

// SRD 5.2 p.76 / SRD 5.1 p.74 (edition-invariant): a maneuver spends and rolls exactly ONE superiority die, no scaling.
// Hand-encoded here rather than read off the catalog row: every seeded maneuver sets effectDieSource but leaves effectKind/effectDiceCount null, so readEffectSpec(catalogRow) alone would resolve dice: undefined.
// Distinct from maneuverEffectSpec — the CAST path's dice-less announce-only spec; this is the SERIALIZED view.
const MANEUVER_ROW: EffectRow = {
  level: 0,
  effectKind: "utility",
  effectDiceCount: 1,
  effectDieSource: "superiorityDice",
};

export function deriveManeuverEffect(derived: DerivedClassInfo) {
  const resolve: ClassDieResolver = (source) => resolveClassDie(source, derived);
  return readEffectSpec(MANEUVER_ROW, resolve);
}
