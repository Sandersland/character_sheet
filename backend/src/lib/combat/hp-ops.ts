import {
  activeResistedDamageTypes,
  normalizeActiveEffectsMutable,
} from "./active-effects.js";
import { itemImmuneDamageTypes, itemResistedDamageTypes } from "@/lib/inventory/capabilities.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { hitDieFace, multiclassPrerequisitesMet } from "@/lib/srd/srd.js";
import {
  InvalidHitPointOperationError,
  applyDeathSaveRoll,
  levelUpHpGain,
  resolveDamageAmount,
} from "./hp-core.js";
import type {
  DamageOperation,
  DeathSaveOperation,
  HealOperation,
  LevelUpOperation,
  SetTempOperation,
} from "./hp-operations.js";
import type { HpOpContext, HpOpResult } from "./hp-context.js";

export function applyDamageOp(ctx: HpOpContext, op: DamageOperation): HpOpResult {
  const { hp, row } = ctx;
  if (op.amount <= 0) {
    throw new InvalidHitPointOperationError("damage amount must be positive");
  }
  // Auto-halve against active resistances (#456) / zero against item immunities
  // (#529) unless the player declined: cast-buff resistances (Rage) unioned with
  // item-granted resistances; item immunities zero the matching type.
  const resisted = activeResistedDamageTypes(normalizeActiveEffectsMutable(row.activeEffects));
  // Map the paper-doll placement to the boolean "worn" flag the grant helpers expect (#565).
  const itemsForGrants = (row.inventoryItems ?? []).map((i) => ({ ...i, equipped: i.equippedSlot != null }));
  for (const t of itemResistedDamageTypes(itemsForGrants)) resisted.add(t);
  const immune = itemImmuneDamageTypes(itemsForGrants);
  const { applied, resisted: wasResisted, immune: wasImmune } = resolveDamageAmount(
    op.amount,
    op.damageType,
    resisted,
    op.applyResistance !== false,
    immune,
  );

  const beforeCurrent = hp.current;
  // Temp HP absorbs first, then current. Both floor at 0.
  const absorbed = Math.min(hp.temp, applied);
  hp.temp -= absorbed;
  hp.current = Math.max(0, hp.current - (applied - absorbed));

  const typeLabel = op.damageType ? ` ${op.damageType}` : "";
  const resistNote = wasImmune ? ` (immune, from ${op.amount})` : wasResisted ? ` (resisted from ${op.amount})` : "";
  // The 5e concentration save uses the damage actually taken (post-resistance).
  return {
    summary: `Took ${applied}${typeLabel} damage${resistNote} (${beforeCurrent} → ${hp.current} HP)`,
    eventData: {
      amount: applied,
      rawAmount: op.amount,
      damageType: op.damageType ?? null,
      resisted: wasResisted,
      immune: wasImmune,
    },
    damageForConcentration: applied,
  };
}

export function applyHealOp(ctx: HpOpContext, op: HealOperation): HpOpResult {
  const { hp, effMax } = ctx;
  if (op.amount <= 0) {
    throw new InvalidHitPointOperationError("heal amount must be positive");
  }
  const beforeCurrent = hp.current;
  // Regaining any HP while at 0 (dying) wakes the character and clears death saves.
  if (hp.current === 0) {
    hp.deathSaves = { successes: 0, failures: 0 };
  }
  hp.current = Math.min(effMax, hp.current + op.amount);
  return {
    summary: `Healed ${op.amount} HP (${beforeCurrent} → ${hp.current} HP)`,
    eventData: { amount: op.amount },
  };
}

export function applySetTempOp(ctx: HpOpContext, op: SetTempOperation): HpOpResult {
  const { hp } = ctx;
  if (op.amount < 0) {
    throw new InvalidHitPointOperationError("setTemp amount must be non-negative");
  }
  // 5e: temp HP doesn't stack — take the higher value.
  hp.temp = Math.max(hp.temp, op.amount);
  return {
    summary: `Set temporary HP to ${op.amount}`,
    eventData: { amount: op.amount },
  };
}

export function applyDeathSaveOp(ctx: HpOpContext, op: DeathSaveOperation): HpOpResult {
  const { hp } = ctx;
  if (hp.current !== 0) {
    throw new InvalidHitPointOperationError(
      "Can only roll a death save when at 0 HP (unconscious/dying)"
    );
  }
  if (op.roll < 1 || op.roll > 20) {
    throw new InvalidHitPointOperationError(
      "Death save roll must be between 1 and 20"
    );
  }
  const rollResult = applyDeathSaveRoll(hp.deathSaves, hp.current, op.roll);
  hp.deathSaves = rollResult.deathSaves;
  hp.current = rollResult.current;
  const ds = hp.deathSaves;
  const summary = op.roll === 20
    ? `Death save: natural 20 — regained consciousness`
    : `Death save: rolled ${op.roll} (${ds.successes} success${ds.successes !== 1 ? "es" : ""}, ${ds.failures} failure${ds.failures !== 1 ? "s" : ""})`;
  return { summary, eventData: { roll: op.roll } };
}

export function applyStabilizeOp(ctx: HpOpContext): HpOpResult {
  const { hp } = ctx;
  if (hp.current !== 0) {
    throw new InvalidHitPointOperationError(
      "Can only stabilize when at 0 HP (unconscious/dying)"
    );
  }
  hp.deathSaves = { successes: 0, failures: 0 };
  return { summary: "Stabilized", eventData: {} };
}

// applyLevelUpOp dispatches on the op's target: a NEW class (multiclass), an
// EXISTING class entry, or the no-target position-0 self-heal. All three share
// the roll validation + HP/hit-dice bump and the same eventData shape, which
// stores enough to exactly reverse the level-up (Phase 4 undo, and the
// auto-reverse in experience-ops.ts when XP is lowered).

/**
 * Validate the client roll against the CHOSEN class's die (may differ from
 * the position-0 die stored in hd.die once multiclassing is in play).
 */
function requireLevelUpRoll(op: LevelUpOperation, dieFaces: number): void {
  if (op.method === "roll" && (op.roll === undefined || op.roll < 1 || op.roll > dieFaces)) {
    throw new InvalidHitPointOperationError(
      `Roll for level-up must be between 1 and ${dieFaces} (got ${String(op.roll)})`
    );
  }
}

/** Apply the shared HP/hit-dice bump for a given die face count; returns the gain. */
function bumpHpForLevelUp(ctx: HpOpContext, op: LevelUpOperation, dieFaces: number): number {
  const gain = levelUpHpGain(dieFaces, ctx.conMod, op.method, op.roll);
  ctx.hd.total += 1;
  ctx.hp.max += gain;
  ctx.hp.current += gain;
  return gain;
}

/** The reversal-grade eventData every level-up variant shares. */
function levelUpEventData(
  op: LevelUpOperation,
  conMod: number,
  faces: number,
  hpGain: number,
  entry: { primaryEntryId: string | null; prevEntryLevel: number | null; newEntryLevel: number },
): Record<string, unknown> {
  return {
    method: op.method,
    roll: op.roll ?? null,
    conMod,
    faces,
    hpGain,
    ...entry,
  };
}

/** Level up into a NEW class (multiclass): prereq-gated, creates a level-1 entry. */
async function applyNewClassLevelUp(
  ctx: HpOpContext,
  op: LevelUpOperation,
  target: { classId: string },
): Promise<HpOpResult> {
  const { tx, characterId, row, conMod } = ctx;
  const catalog = await tx.characterClass.findUnique({
    where: { id: target.classId },
    select: { id: true, name: true, hitDie: true },
  });
  if (!catalog) {
    throw new InvalidHitPointOperationError(`Class not found: ${target.classId}`);
  }
  if (row.classEntries.some((e) => e.classId === catalog.id)) {
    throw new InvalidHitPointOperationError(
      `Character already has levels in ${catalog.name} — use an existing-class target`
    );
  }
  const abilityScores = row.abilityScores as Record<string, number>;
  const prereq = multiclassPrerequisitesMet(catalog.name, abilityScores);
  if (!prereq.met) {
    throw new InvalidHitPointOperationError(
      `Cannot multiclass into ${catalog.name}: requires ${prereq.description}`
    );
  }
  const newFaces = hitDieFace(catalog.hitDie);
  requireLevelUpRoll(op, newFaces);
  const gain = bumpHpForLevelUp(ctx, op, newFaces);
  const position = row.classEntries.reduce((max, e) => Math.max(max, e.position), -1) + 1;
  const created = await tx.characterClassEntry.create({
    data: { characterId, classId: catalog.id, name: catalog.name, level: 1, position },
  });
  return {
    summary: `Multiclassed into ${catalog.name} (level 1, +${gain} HP)`,
    eventData: {
      ...levelUpEventData(op, conMod, newFaces, gain, {
        primaryEntryId: null,
        prevEntryLevel: null,
        newEntryLevel: 1,
      }),
      createdClassEntryId: created.id,
    },
  };
}

/** Level up a CHOSEN existing class entry, rolling that entry's own die. */
async function applyExistingClassLevelUp(
  ctx: HpOpContext,
  op: LevelUpOperation,
  target: { classEntryId: string },
): Promise<HpOpResult> {
  const { tx, row, conMod, faces } = ctx;
  const entry = row.classEntries.find((e) => e.id === target.classEntryId);
  if (!entry) {
    throw new InvalidHitPointOperationError(`Class entry not found: ${target.classEntryId}`);
  }
  const entryFaces = entry.class ? hitDieFace(entry.class.hitDie) : faces;
  requireLevelUpRoll(op, entryFaces);
  const gain = bumpHpForLevelUp(ctx, op, entryFaces);
  const newEntryLevel = entry.level + 1;
  await tx.characterClassEntry.update({
    where: { id: entry.id },
    data: { level: newEntryLevel },
  });
  return {
    summary: `Leveled up ${entry.name} to ${newEntryLevel} (+${gain} HP)`,
    eventData: levelUpEventData(op, conMod, entryFaces, gain, {
      primaryEntryId: entry.id,
      prevEntryLevel: entry.level,
      newEntryLevel,
    }),
  };
}

/**
 * No target — position-0 self-heal (backward-compatible path). Only valid for
 * single-class characters. A multiclass character has no unambiguous
 * position-0 to self-heal: this path would set that entry's level to
 * `hd.total` (the *total* character level), inflating it (#124). Callers with
 * more than one entry must pass an explicit target instead.
 */
async function applySelfHealLevelUp(ctx: HpOpContext, op: LevelUpOperation): Promise<HpOpResult> {
  const { tx, row, hd, conMod, faces, primaryEntry, beforeClassLevel } = ctx;
  if (row.classEntries.length > 1) {
    throw new InvalidHitPointOperationError(
      "Multiclass character requires an explicit level-up target (existing or new class)"
    );
  }
  requireLevelUpRoll(op, faces);
  const gain = bumpHpForLevelUp(ctx, op, faces);

  // Repair the position-0 class entry's `level` to match the newly-applied
  // total. The seed defaults all entries to level 1 even for level-7 chars;
  // this self-heals that on the first real level-up.
  if (primaryEntry) {
    await tx.characterClassEntry.update({
      where: { id: primaryEntry.id },
      data: { level: hd.total },
    });
  }

  return {
    summary: `Leveled up to ${hd.total} (+${gain} HP)`,
    eventData: levelUpEventData(op, conMod, faces, gain, {
      primaryEntryId: primaryEntry?.id ?? null,
      prevEntryLevel: beforeClassLevel,
      newEntryLevel: hd.total,
    }),
  };
}

export async function applyLevelUpOp(ctx: HpOpContext, op: LevelUpOperation): Promise<HpOpResult> {
  const { hd, row } = ctx;
  const derivedLevel = levelForExperience(row.experiencePoints);
  if (hd.total >= derivedLevel) {
    throw new InvalidHitPointOperationError(
      `No pending level-up: already at level ${hd.total} (XP derives level ${derivedLevel})`
    );
  }
  const target = op.target;
  if (target?.kind === "new") return applyNewClassLevelUp(ctx, op, target);
  if (target?.kind === "existing") return applyExistingClassLevelUp(ctx, op, target);
  return applySelfHealLevelUp(ctx, op);
}
