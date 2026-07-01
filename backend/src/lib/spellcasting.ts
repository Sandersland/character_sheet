/**
 * Spellcasting transaction handler — the spellcasting counterpart to
 * lib/inventory.ts and lib/hitpoints.ts.
 *
 * The per-character mutable spell state lives in a single JSON column
 * (Character.spellcasting) rather than relational rows — see the plan note
 * in CLAUDE.md. This keeps revert/undo identical to the HP/XP undo pattern
 * (restore `before.spellcasting` from a CharacterEvent) and avoids a new
 * `CharacterSpell` table.
 *
 * What is persisted: slot `used` counts and the learned `spells[]` array.
 * What is derived at read time (in routes/characters.ts serializeCharacter):
 *   - slot totals (from srd.ts FULL_CASTER_SLOTS + class + level)
 *   - spellSaveDC / spellAttackBonus / ability (from srd.ts deriveSpellcasting)
 */

import { randomUUID } from "node:crypto";


import { Prisma } from "../generated/prisma/client.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { logEvent } from "./events.js";
import { applyHealInTx, applyDamageInTx } from "./hitpoints.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";
import { deriveSpellcasting } from "./srd.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidSpellcastingOperationError extends Error {}

// ── Canonical mutable state shape ─────────────────────────────────────────────
// Stored in Character.spellcasting JSON column.
// `slotsUsed`: slot level (as string key, JSON requirement) → used count.
// `spells`: the character's known/prepared spell list (snapshotted from catalog
//   or custom). Each entry has a locally-generated `id` (the entryId used by
//   operations) independent of the catalog Spell.id (stored as `spellId`).

export interface SpellEntry {
  id: string;             // per-character entry UUID (operation target)
  spellId?: string;       // catalog Spell.id provenance — null for custom spells
  name: string;
  level: number;          // 0 = cantrip
  school: string;         // SpellSchool value, lowercase
  prepared: boolean;      // cantrips are always treated as prepared at cast time
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  // Spell components ({ verbal, somatic, material, materialDescription? }) and
  // save-on-damage behavior, snapshotted from the catalog at learn time.
  components?: SpellComponents | null;
  saveEffect?: string | null;    // "half" | "none" | null
  // Structured roll effect (snapshotted from catalog at learn time):
  effectKind?: string | null;    // "damage" | "heal" | null (utility)
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null; // flat bonus added to dice total
  damageType?: string | null;
  attackType?: string | null;    // "attack" | "save" | null
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
}

/** Spell verbal/somatic/material component flags + optional material text. */
export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription?: string;
}

/**
 * The single concentration spell a character is currently maintaining, or null.
 * 5e: a character can concentrate on only one spell at a time — casting a new
 * concentration spell drops any prior one (see castSpell). `entryId` is the
 * per-character SpellEntry id; `spellName` is denormalized for display/log text.
 */
export interface ConcentrationState {
  entryId: string;
  spellName: string;
}

export interface SpellcastingMutableState {
  // JSON object keys must be strings; slot level is stored as e.g. "1", "2".
  slotsUsed: Record<string, number>;
  // Warlock Mystic Arcanum charges spent this long rest, keyed by spell level
  // (e.g. "6"). Each level has exactly one charge; 0/absent means available.
  arcanumUsed: Record<string, number>;
  spells: SpellEntry[];
  // The active concentration spell, or null when not concentrating.
  concentratingOn: ConcentrationState | null;
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Handles both the new compact format AND the legacy blob shape seeded before
// this migration (which had `ability`, `spellSaveDC`, `spellAttackBonus`,
// `slots: [{level, total, used}]`, `spells`). The legacy fields are ignored
// since they're now derived; only `used` counts and `spells` are extracted.

export function normalizeSpellcastingMutable(json: Prisma.JsonValue): SpellcastingMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null };
  }
  const obj = json as Record<string, unknown>;

  // New compact format: { slotsUsed: {...}, arcanumUsed: {...}, spells: [...] }
  if ("slotsUsed" in obj) {
    return {
      slotsUsed: (obj.slotsUsed as Record<string, number>) ?? {},
      arcanumUsed: (obj.arcanumUsed as Record<string, number>) ?? {},
      spells: (obj.spells as SpellEntry[]) ?? [],
      concentratingOn: normalizeConcentration(obj.concentratingOn),
    };
  }

  // Legacy format: { ability, spellSaveDC, ..., slots: [{level, total, used}], spells: [...] }
  const oldSlots = (obj.slots as Array<{ level: number; total: number; used: number }>) ?? [];
  const slotsUsed: Record<string, number> = {};
  for (const s of oldSlots) {
    if (s.used > 0) slotsUsed[String(s.level)] = s.used;
  }
  return {
    slotsUsed,
    arcanumUsed: {},
    spells: (obj.spells as SpellEntry[]) ?? [],
    concentratingOn: normalizeConcentration(obj.concentratingOn),
  };
}

/** Coerce a stored concentration value into a valid ConcentrationState or null. */
function normalizeConcentration(value: unknown): ConcentrationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.entryId !== "string" || c.entryId.length === 0) return null;
  return { entryId: c.entryId, spellName: typeof c.spellName === "string" ? c.spellName : "" };
}

// ── Custom spell input shape ──────────────────────────────────────────────────
export interface CustomSpellInput {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  components?: SpellComponents;
  saveEffect?: string;
  effectKind?: string;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: string;
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling?: boolean;
}

// ── Operation types ───────────────────────────────────────────────────────────

/**
 * Cast a spell. For leveled spells, `slotLevel` must be >= spell.level and a
 * slot of that level must be available. Cantrips (spell.level === 0) skip slot
 * expenditure. `roll` is the client-computed effect total (0 for utility spells
 * with no dice); the server validates and logs it but does not recompute.
 */
export interface CastSpellOperation {
  type: "castSpell";
  entryId: string;
  slotLevel?: number; // required for leveled spells, omit/ignore for cantrips
  roll: number;       // client-rolled total (0 for utility)
  /**
   * Optionally apply the rolled effect to the caster's own HP in the same atomic
   * batch — used when the player targets themselves. Omitted when targeting
   * others (no enemy entities exist; the player relays damage to the DM).
   */
  apply?: { target: "self"; kind: "heal" | "damage"; amount: number };
}

/** Expend one slot of a given level without associating it with a specific spell. */
export interface ExpendSlotOperation {
  type: "expendSlot";
  level: number;
}

/** Restore one previously-expended slot (undo mis-click; not Arcane Recovery). */
export interface RestoreSlotOperation {
  type: "restoreSlot";
  level: number;
}

/** Learn a spell from the catalog (spellId) or add a custom one. Exactly one of spellId/custom. */
export interface LearnSpellOperation {
  type: "learnSpell";
  spellId?: string;
  custom?: CustomSpellInput;
}

/** Remove a learned spell by its per-character entry id. */
export interface ForgetSpellOperation {
  type: "forgetSpell";
  entryId: string;
}

/** Mark a non-cantrip spell as prepared. */
export interface PrepareSpellOperation {
  type: "prepareSpell";
  entryId: string;
}

/** Mark a non-cantrip spell as unprepared. */
export interface UnprepareSpellOperation {
  type: "unprepareSpell";
  entryId: string;
}

/** End the active concentration spell manually (player ends it / it was countered). */
export interface DropConcentrationOperation {
  type: "dropConcentration";
}

export type SpellcastingOperation =
  | CastSpellOperation
  | ExpendSlotOperation
  | RestoreSlotOperation
  | LearnSpellOperation
  | ForgetSpellOperation
  | PrepareSpellOperation
  | UnprepareSpellOperation
  | DropConcentrationOperation;

// ── Per-op helper context + outcome ───────────────────────────────────────────
// Each helper mutates ctx.state in place and returns an OpOutcome, or null for a
// no-op (which skips both the state write-back and the logEvent in the dispatcher).

interface SpellOpContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
  state: SpellcastingMutableState;
  slotTotals: Record<number, number>;
  arcanaTotals: Record<number, number>;
}

interface OpOutcome {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
}

function applyExpendSlotOp(ctx: SpellOpContext, op: ExpendSlotOperation): OpOutcome {
  const { state, slotTotals } = ctx;
  const total = slotTotals[op.level] ?? 0;
  const used = state.slotsUsed[String(op.level)] ?? 0;
  if (total === 0) {
    throw new InvalidSpellcastingOperationError(`No level-${op.level} slots exist`);
  }
  if (used >= total) {
    throw new InvalidSpellcastingOperationError(`No level-${op.level} spell slots remaining`);
  }
  state.slotsUsed[String(op.level)] = used + 1;
  return {
    eventType: "expendSlot",
    summary: `Expended 1 level-${op.level} spell slot`,
    eventData: { level: op.level },
  };
}

function applyRestoreSlotOp(ctx: SpellOpContext, op: RestoreSlotOperation): OpOutcome {
  const { state } = ctx;
  const slotUsed = state.slotsUsed[String(op.level)] ?? 0;
  const arcanumUsed = state.arcanumUsed[String(op.level)] ?? 0;
  let summary: string;
  if (slotUsed > 0) {
    state.slotsUsed[String(op.level)] = slotUsed - 1;
    summary = `Restored 1 level-${op.level} spell slot`;
  } else if (arcanumUsed > 0) {
    // No expended slot at this level, but a Mystic Arcanum charge was spent — undo that.
    state.arcanumUsed[String(op.level)] = arcanumUsed - 1;
    summary = `Restored level-${op.level} Mystic Arcanum`;
  } else {
    throw new InvalidSpellcastingOperationError(
      `No expended level-${op.level} slots to restore`
    );
  }
  return { eventType: "restoreSlot", summary, eventData: { level: op.level } };
}

async function applyLearnSpellOp(ctx: SpellOpContext, op: LearnSpellOperation): Promise<OpOutcome> {
  const { tx, state } = ctx;
  if (Boolean(op.spellId) === Boolean(op.custom)) {
    throw new InvalidSpellcastingOperationError(
      "learnSpell: provide exactly one of spellId or custom"
    );
  }

  let newEntry: SpellEntry;

  if (op.spellId) {
    // Check for duplicate before DB lookup.
    if (state.spells.some((s) => s.spellId === op.spellId)) {
      throw new InvalidSpellcastingOperationError(
        `Spell already in spellbook (spellId: ${op.spellId})`
      );
    }
    const catalogSpell = await tx.spell.findUnique({ where: { id: op.spellId } });
    if (!catalogSpell) {
      throw new InvalidSpellcastingOperationError(`Spell not found in catalog: ${op.spellId}`);
    }
    newEntry = {
      id: randomUUID(),
      spellId: catalogSpell.id,
      name: catalogSpell.name,
      level: catalogSpell.level,
      school: catalogSpell.school as string,
      prepared: false,
      castingTime: catalogSpell.castingTime,
      range: catalogSpell.range,
      duration: catalogSpell.duration,
      description: catalogSpell.description,
      concentration: catalogSpell.concentration,
      ritual: catalogSpell.ritual,
      components: (catalogSpell.components as SpellComponents | null) ?? undefined,
      saveEffect: catalogSpell.saveEffect ?? undefined,
      effectKind: catalogSpell.effectKind ?? undefined,
      effectDiceCount: catalogSpell.effectDiceCount ?? undefined,
      effectDiceFaces: catalogSpell.effectDiceFaces ?? undefined,
      effectModifier: catalogSpell.effectModifier ?? undefined,
      damageType: catalogSpell.damageType ?? undefined,
      attackType: catalogSpell.attackType ?? undefined,
      saveAbility: catalogSpell.saveAbility ?? undefined,
      upcastDicePerLevel: catalogSpell.upcastDicePerLevel ?? undefined,
      cantripScaling: catalogSpell.cantripScaling,
    };
  } else {
    // Custom spell.
    const custom = op.custom!;
    newEntry = {
      id: randomUUID(),
      name: custom.name,
      level: custom.level,
      school: custom.school,
      prepared: false,
      castingTime: custom.castingTime,
      range: custom.range,
      duration: custom.duration,
      description: custom.description,
      concentration: custom.concentration,
      ritual: custom.ritual,
      components: custom.components,
      saveEffect: custom.saveEffect,
      effectKind: custom.effectKind,
      effectDiceCount: custom.effectDiceCount,
      effectDiceFaces: custom.effectDiceFaces,
      effectModifier: custom.effectModifier,
      damageType: custom.damageType,
      attackType: custom.attackType,
      saveAbility: custom.saveAbility,
      upcastDicePerLevel: custom.upcastDicePerLevel,
      cantripScaling: custom.cantripScaling,
    };
  }

  state.spells.push(newEntry);
  return {
    eventType: "learnSpell",
    summary: `Learned ${newEntry.name}`,
    eventData: { entryId: newEntry.id, spellName: newEntry.name, spellId: newEntry.spellId ?? null },
  };
}

function applyForgetSpellOp(ctx: SpellOpContext, op: ForgetSpellOperation): OpOutcome {
  const { state } = ctx;
  const idx = state.spells.findIndex((s) => s.id === op.entryId);
  if (idx === -1) {
    throw new InvalidSpellcastingOperationError(`Spell entry not found: ${op.entryId}`);
  }
  const forgotten = state.spells[idx];
  state.spells.splice(idx, 1);
  // Forgetting the spell you're concentrating on ends that concentration.
  if (state.concentratingOn?.entryId === op.entryId) {
    state.concentratingOn = null;
  }
  return {
    eventType: "forgetSpell",
    summary: `Removed ${forgotten.name} from spellbook`,
    eventData: { entryId: op.entryId, spellName: forgotten.name },
  };
}

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of spellcasting operations atomically in one Prisma
 * transaction. Mirrors applyInventoryOperations / applyHitPointOperations:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - a CharacterEvent is logged per op (with full before/after spellcasting
 *     snapshot for revert symmetry with the HP/XP undo handler)
 *   - the mutable state is loaded once and written once per op loop iteration
 *     (loading inside the loop ensures each op sees the previous op's result)
 */
export async function applySpellcastingOperations(
  characterId: string,
  operations: SpellcastingOperation[]
): Promise<void> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      // Re-read per-op so a batch of multiple ops sees each previous result.
      const row = await tx.character.findUnique({
        where: { id: characterId },
        select: {
          spellcasting: true,
          experiencePoints: true,
          abilityScores: true,
          classEntries: {
            orderBy: { position: "asc" as const },
            take: 1,
            select: { name: true },
          },
        },
      });
      if (!row) {
        throw new InvalidSpellcastingOperationError(`Character not found: ${characterId}`);
      }

      // Derived stats needed for slot-bounds checks.
      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const className = row.classEntries[0]?.name ?? "";
      const abilityScores = row.abilityScores as Record<string, number>;
      const derived = deriveSpellcasting(className, level, abilityScores, profBonus);

      // Slot totals map: level → total (0 if no entry).
      const slotTotals: Record<number, number> = {};
      // Mystic Arcanum totals map: spell level → charges (Warlock only).
      const arcanaTotals: Record<number, number> = {};
      if (derived) {
        for (const s of derived.slotTotals) slotTotals[s.level] = s.total;
        for (const a of derived.arcana) arcanaTotals[a.level] = a.total;
      } else if (row.spellcasting && typeof row.spellcasting === "object" && !Array.isArray(row.spellcasting)) {
        // Fallback for unsupported caster classes: read stored totals if present.
        const stored = row.spellcasting as Record<string, unknown>;
        const oldSlots = (stored.slots as Array<{ level: number; total: number }>) ?? [];
        for (const s of oldSlots) slotTotals[s.level] = s.total;
      }

      const state = normalizeSpellcastingMutable(row.spellcasting);
      const beforeState = {
        spellcasting: {
          ...state,
          slotsUsed: { ...state.slotsUsed },
          arcanumUsed: { ...state.arcanumUsed },
          spells: [...state.spells],
          concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
        },
      };

      const ctx: SpellOpContext = {
        tx,
        characterId,
        batchId,
        sessionId,
        state,
        slotTotals,
        arcanaTotals,
      };

      let summary = "";
      let eventData: Record<string, unknown> = {};
      let eventType: string;

      switch (op.type) {
        case "castSpell": {
          const entry = state.spells.find((s) => s.id === op.entryId);
          if (!entry) {
            throw new InvalidSpellcastingOperationError(`Spell entry not found: ${op.entryId}`);
          }

          if (entry.level === 0) {
            // Cantrip — no slot needed.
            eventType = "castSpell";
            const roll = op.roll;
            if (entry.effectKind && roll > 0) {
              summary = `Cast ${entry.name}: ${roll}${entry.damageType ? " " + entry.damageType : ""} ${entry.effectKind === "heal" ? "healing" : "damage"}`;
            } else {
              summary = `Cast ${entry.name}`;
            }
            eventData = { entryId: op.entryId, spellName: entry.name, roll: op.roll, slotLevel: null };
          } else {
            // Leveled spell — expend a slot, or a Mystic Arcanum charge.
            const slotLevel = op.slotLevel ?? entry.level;
            if (slotLevel < entry.level) {
              throw new InvalidSpellcastingOperationError(
                `Cannot cast ${entry.name} (L${entry.level}) in a level-${slotLevel} slot`
              );
            }
            const slotTotal = slotTotals[slotLevel] ?? 0;
            const arcanumTotal = arcanaTotals[slotLevel] ?? 0;
            eventType = "castSpell";
            const upcasting = slotLevel > entry.level;

            // Real slots take priority; Mystic Arcanum (Warlock 6th–9th) has no
            // overlapping slot level, so the two paths are mutually exclusive.
            let slotLabel: string;
            if (slotTotal > 0) {
              const used = state.slotsUsed[String(slotLevel)] ?? 0;
              if (used >= slotTotal) {
                throw new InvalidSpellcastingOperationError(
                  `No level-${slotLevel} spell slots remaining`
                );
              }
              state.slotsUsed[String(slotLevel)] = used + 1;
              slotLabel = `L${slotLevel} slot${upcasting ? ` (upcast from L${entry.level})` : ""}`;
            } else if (arcanumTotal > 0) {
              const used = state.arcanumUsed[String(slotLevel)] ?? 0;
              if (used >= arcanumTotal) {
                throw new InvalidSpellcastingOperationError(
                  `Mystic Arcanum (level ${slotLevel}) already used — recharges on a long rest`
                );
              }
              state.arcanumUsed[String(slotLevel)] = used + 1;
              slotLabel = `L${slotLevel} Mystic Arcanum`;
            } else {
              throw new InvalidSpellcastingOperationError(
                `No level-${slotLevel} spell slots remaining`
              );
            }

            if (entry.effectKind && op.roll > 0) {
              summary = `Cast ${entry.name} (${slotLabel}): ${op.roll}${entry.damageType ? " " + entry.damageType : ""} ${entry.effectKind === "heal" ? "healing" : "damage"}`;
            } else {
              summary = `Cast ${entry.name} (${slotLabel})`;
            }
            eventData = { entryId: op.entryId, spellName: entry.name, roll: op.roll, slotLevel };
          }

          // Concentration: a character maintains at most one concentration spell.
          // Casting a new one auto-drops the prior (logged separately so it shows
          // on the timeline and is undoable). Re-casting the same spell refreshes.
          if (entry.concentration) {
            const prior = state.concentratingOn;
            if (prior && prior.entryId !== entry.id) {
              const dropBefore = {
                spellcasting: {
                  slotsUsed: { ...state.slotsUsed },
                  arcanumUsed: { ...state.arcanumUsed },
                  spells: [...state.spells],
                  concentratingOn: { ...prior },
                },
              };
              // No intermediate DB write here: the common write-back below
              // persists the final state (with the newly-cast concentration
              // spell), so writing `concentratingOn: null` first would just be
              // overwritten. Clearing the in-memory flag is enough for this
              // drop event's `before`/`after` payloads.
              state.concentratingOn = null;
              await logEvent(tx, {
                characterId,
                category: "spellcasting",
                type: "concentrationDropped",
                summary: `Concentration on ${prior.spellName} dropped (cast ${entry.name})`,
                before: dropBefore,
                after: {
                  spellcasting: {
                    slotsUsed: { ...state.slotsUsed },
                    arcanumUsed: { ...state.arcanumUsed },
                    spells: [...state.spells],
                    concentratingOn: null,
                  },
                },
                data: { droppedEntryId: prior.entryId, droppedSpellName: prior.spellName, reason: "newCast", castEntryId: entry.id },
                batchId,
                sessionId,
              });
            }
            state.concentratingOn = { entryId: entry.id, spellName: entry.name };
          }

          // Self-targeted effect: apply to the caster's own HP in this same batch
          // so the slot-spend and HP-change revert together as one undo step.
          if (op.apply && op.apply.target === "self" && op.apply.amount > 0) {
            if (op.apply.kind === "heal") {
              await applyHealInTx(tx, characterId, op.apply.amount, batchId, sessionId);
            } else {
              await applyDamageInTx(tx, characterId, op.apply.amount, batchId, sessionId);
            }
          }
          break;
        }

        case "expendSlot": {
          ({ eventType, summary, eventData } = applyExpendSlotOp(ctx, op));
          break;
        }

        case "restoreSlot": {
          ({ eventType, summary, eventData } = applyRestoreSlotOp(ctx, op));
          break;
        }

        case "learnSpell": {
          ({ eventType, summary, eventData } = await applyLearnSpellOp(ctx, op));
          break;
        }

        case "forgetSpell": {
          ({ eventType, summary, eventData } = applyForgetSpellOp(ctx, op));
          break;
        }

        case "prepareSpell":
        case "unprepareSpell": {
          const entry = state.spells.find((s) => s.id === op.entryId);
          if (!entry) {
            throw new InvalidSpellcastingOperationError(`Spell entry not found: ${op.entryId}`);
          }
          if (entry.level === 0) {
            throw new InvalidSpellcastingOperationError(
              "Cantrips are always prepared and cannot be toggled"
            );
          }
          const preparing = op.type === "prepareSpell";
          if (preparing === entry.prepared) {
            // Already in the desired state — no-op (don't throw, just skip logging).
            continue;
          }
          entry.prepared = preparing;
          eventType = op.type;
          summary = preparing ? `Prepared ${entry.name}` : `Unprepared ${entry.name}`;
          eventData = { entryId: op.entryId, spellName: entry.name, prepared: preparing };
          break;
        }

        case "dropConcentration": {
          const prior = state.concentratingOn;
          if (!prior) {
            // Nothing to drop — no-op (don't throw; idempotent), skip logging.
            continue;
          }
          state.concentratingOn = null;
          eventType = "concentrationDropped";
          summary = `Stopped concentrating on ${prior.spellName}`;
          eventData = { droppedEntryId: prior.entryId, droppedSpellName: prior.spellName, reason: "manual" };
          break;
        }
      }

      // Write the updated state back as a compact object.
      await tx.character.update({
        where: { id: characterId },
        data: {
          spellcasting: {
            slotsUsed: state.slotsUsed,
            arcanumUsed: state.arcanumUsed,
            spells: state.spells,
            concentratingOn: state.concentratingOn,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const afterState = {
        spellcasting: {
          slotsUsed: { ...state.slotsUsed },
          arcanumUsed: { ...state.arcanumUsed },
          spells: [...state.spells],
          concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
        },
      };

      await logEvent(tx, {
        characterId,
        category: "spellcasting",
        type: eventType! as Parameters<typeof logEvent>[1]["type"],
        summary: summary!,
        before: beforeState,
        after: afterState,
        data: eventData,
        batchId,
        sessionId,
      });
    }
  });
}
