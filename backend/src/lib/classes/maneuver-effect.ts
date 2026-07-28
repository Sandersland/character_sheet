// Kept out of maneuvers.ts deliberately: that module pulls in Prisma and
// castAbilityInTx, which the synchronous serializer (buildResourcesPayload)
// must not drag in.
import { readEffectSpec, type ClassDieResolver, type EffectRow } from "@/lib/combat/effects.js";

import { resolveClassDie } from "./registry.js";
import type { DerivedClassInfo } from "./types.js";

// A maneuver's EffectSpec, synthesized rather than read off the catalog row
// (#1381): every seeded maneuver (prisma/seed.ts) sets effectDieSource but
// leaves effectKind/effectDiceCount null, so readEffectSpec(catalogRow) alone
// would resolve dice: undefined. SRD 5.2 p.76 / SRD 5.1 p.74 (edition-invariant):
// a maneuver spends and rolls exactly ONE superiority die, no scaling — that
// fixed shape is hand-encoded here (effectDiceCount: 1, effectDieSource) rather
// than read. effectKind: "utility" keeps effectType roll-less for summary text
// while readEffectSpec's hasDice check is orthogonal to it, so dice still
// resolve. Distinct from maneuverEffectSpec (maneuvers.ts) — the CAST path's
// deliberately dice-less announce-only spec; this is the SERIALIZED view.
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
