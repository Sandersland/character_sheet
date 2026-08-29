// A façade re-exporting the hit-points cluster's public surface so outside callers never reference
// the internal module split; same-domain code imports the concern module directly.
// Op shapes are not declared here; they're z.infer of the route schemas in @character-sheet/contracts.
export {
  InvalidHitPointOperationError,
  normalizeHitPoints,
  normalizeHitDice,
  effectiveMaxHitPoints,
  inCapAdvancementsAt,
  fixedAverageForDie,
  levelUpHpGain,
  hitDieHeal,
  resolveDamageAmount,
  applyDeathSaveRoll,
} from "./hp-core.js";
export type { HitPoints, HitDice } from "./hp-core.js";

export { advancingHitDie } from "./advancing-hit-die.js";

export { applyHitPointOperations, applyLevelUpHpInTx } from "./hp-transaction.js";

export { applyHealInTx, applyDamageInTx, applyTempHpInTx } from "./hp-in-tx.js";
// fallow-ignore-next-line unused-type -- public-surface re-export; external callers infer this return type
export type { ConcentrationCheckResult } from "./concentration.js";
