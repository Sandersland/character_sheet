// Domain façade for the hit-points cluster. Concerns live in sibling modules
// (hp-core / hp-operations / hp-context / hp-ops / rest / concentration /
// hp-in-tx / hp-transaction); this file re-exports the public surface so
// import sites outside lib/combat/ never reference the internal split. New
// same-domain code imports the concern module directly; the operation-shape
// and concentration types live in hp-operations.js / concentration.js.

export {
  InvalidHitPointOperationError,
  normalizeHitPoints,
  normalizeHitDice,
  fixedAverageForDie,
  levelUpHpGain,
  hitDieHeal,
  resolveDamageAmount,
  applyDeathSaveRoll,
} from "./hp-core.js";
export type { HitPoints, HitDice } from "./hp-core.js";

export { applyHitPointOperations, applyLevelUpHpInTx } from "./hp-transaction.js";

export { applyHealInTx, applyDamageInTx, applyTempHpInTx } from "./hp-in-tx.js";
