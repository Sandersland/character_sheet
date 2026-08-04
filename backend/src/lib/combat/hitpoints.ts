// Domain façade for the hit-points cluster. Concerns live in sibling modules
// (hp-core / hp-context / hp-ops / advancing-hit-die / rest / concentration /
// hp-in-tx / hp-transaction); this file re-exports the public surface so
// import sites outside lib/combat/ never reference the internal split. New
// same-domain code imports the concern module directly. The op shapes are NOT
// here and no longer have a backend declaration at all: they are z.infer of the
// route schemas in @character-sheet/contracts (#1390). Concentration result
// types live in concentration.js.

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
// Part of the public surface; current external callers infer this return type.
// fallow-ignore-next-line unused-type -- public-surface re-export; external callers infer this return type
export type { ConcentrationCheckResult } from "./concentration.js";
