/**
 * Channel Divinity cast handler (Cleric + Paladin, #419) — the CD counterpart to
 * lib/shadow-arts.ts. Each CD option is a GrantedAbility row with source
 * "channelDivinity"; using one spends 1 Channel Divinity charge via the shared
 * payAbilityCostInTx pool path and routes through castAbilityInTx.
 *
 * The 5e rules that live here: the class/subclass/level gate per option, the
 * per-option "kind" (announce / buff / advantage / invisible / reminder), the
 * cleric-vs-paladin save DC ability, and the derived numbers (Preserve Life HP
 * pool, Sacred Weapon Charisma bonus). Description + cost + save ability come
 * from the catalog row.
 */

import { castAbilityInTx } from "../ability-cast.js";
import { readAbilityCost, type PayCostContext } from "../ability-cost.js";
import { appendActiveBuffInTx } from "../active-effects.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { applyConditionInTx } from "../conditions.js";
import type { EffectSpec } from "../effects.js";
import { logEvent } from "../events.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { normalizeSpellcastingMutable } from "../spell-state.js";
import { abilityModifier } from "@/lib/srd/srd.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidChannelDivinityOperationError extends Error {}

// ── Operation types ───────────────────────────────────────────────────────────

/** Use a Channel Divinity option. `abilityId` is the catalog GrantedAbility.id. */
export interface CastChannelDivinityOperation {
  type: "castChannelDivinity";
  abilityId: string;
}

export type ChannelDivinityOperation = CastChannelDivinityOperation;

// ── 5e rules: option gate + kind ──────────────────────────────────────────────

// How a CD option expresses through the declarative core:
//   announce  — spend CD, surface the save DC; the condition is reminder text.
//   buff      — apply a real durable modifier (Sacred Weapon → attackRoll).
//   advantage — grant advantage on attacks vs one creature (roll-mode reminder).
//   invisible — self-apply the invisible condition (Cloak of Shadows).
//   reminder  — pure reminder text, with derived numbers where possible.
export type ChannelDivinityKind = "announce" | "buff" | "advantage" | "invisible" | "reminder";

interface ChannelDivinityGate {
  className: "cleric" | "paladin";
  subclass?: string; // lowercase; absent = any subclass of that class
  minLevel: number;  // class level at which the option is granted
  kind: ChannelDivinityKind;
}

// Gate + kind per option, keyed by the catalog row name. Rows themselves carry
// description/cost/save ability; this table owns the class/subclass/level gate.
export const CHANNEL_DIVINITY_OPTIONS: Record<string, ChannelDivinityGate> = {
  "Channel Divinity: Turn Undead": { className: "cleric", minLevel: 2, kind: "announce" },
  "Channel Divinity: Preserve Life": { className: "cleric", subclass: "life domain", minLevel: 2, kind: "reminder" },
  "Channel Divinity: Invoke Duplicity": { className: "cleric", subclass: "trickery domain", minLevel: 2, kind: "reminder" },
  "Channel Divinity: Cloak of Shadows": { className: "cleric", subclass: "trickery domain", minLevel: 6, kind: "invisible" },
  "Channel Divinity: Sacred Weapon": { className: "paladin", subclass: "oath of devotion", minLevel: 3, kind: "buff" },
  "Channel Divinity: Turn the Unholy": { className: "paladin", subclass: "oath of devotion", minLevel: 3, kind: "announce" },
  "Channel Divinity: Nature's Wrath": { className: "paladin", subclass: "oath of the ancients", minLevel: 3, kind: "announce" },
  "Channel Divinity: Turn the Faithless": { className: "paladin", subclass: "oath of the ancients", minLevel: 3, kind: "announce" },
  "Channel Divinity: Abjure Enemy": { className: "paladin", subclass: "oath of vengeance", minLevel: 3, kind: "announce" },
  "Channel Divinity: Vow of Enmity": { className: "paladin", subclass: "oath of vengeance", minLevel: 3, kind: "advantage" },
};

/** One class entry as needed for gating (name + subclass + optional explicit level). */
export interface GateEntry {
  name: string;
  subclass?: string | null;
  level?: number | null;
}

// True when the character (via some class entry) is entitled to the option. The
// gate level is the character's total level from XP — the same single-class-
// primary assumption deriveResources uses (persisted classEntry.level is a
// multiclass hint, not maintained from XP, so it isn't trusted here).
export function isEntitled(gate: ChannelDivinityGate, entries: GateEntry[], characterLevel: number): boolean {
  if (characterLevel < gate.minLevel) return false;
  return entries.some((e) => {
    if (e.name.toLowerCase() !== gate.className) return false;
    return !gate.subclass || (e.subclass ?? "").toLowerCase() === gate.subclass;
  });
}

// The Channel Divinity save DC for the granting class: cleric keys off Wisdom,
// paladin off Charisma (its spell save DC). Both are 8 + prof + ability mod.
function channelDivinitySaveDC(
  className: "cleric" | "paladin",
  abilityScores: Record<string, number>,
  profBonus: number,
): number {
  const ability = className === "cleric" ? "wisdom" : "charisma";
  return 8 + profBonus + abilityModifier(abilityScores[ability] ?? 10);
}

/** Preserve Life healing pool: 5× cleric level. */
function preserveLifeHpPool(clericLevel: number): number {
  return clericLevel * 5;
}

// ── Descriptor (shared by GET + cast summary) ─────────────────────────────────

export interface ChannelDivinityDescriptor {
  id: string;
  name: string;
  description: string;
  kind: ChannelDivinityKind;
  saveDc: number | null;
  saveAbility: string | null;
  reminder: string;
}

interface DescribeContext {
  abilityScores: Record<string, number>;
  profBonus: number;
  classLevel: number; // level of the granting class (for derived numbers)
}

// Build the human descriptor for an option: the save DC (announce), the derived
// numbers (Preserve Life pool, Sacred Weapon bonus), and the reminder line.
export function describeChannelDivinity(
  row: { id: string; name: string; description: string; saveAbility?: string | null; buffModifier?: number | null },
  gate: ChannelDivinityGate,
  ctx: DescribeContext,
): ChannelDivinityDescriptor {
  const saveDc = gate.kind === "announce" ? channelDivinitySaveDC(gate.className, ctx.abilityScores, ctx.profBonus) : null;
  let reminder: string;
  switch (row.name) {
    case "Channel Divinity: Preserve Life":
      reminder = `Restores ${preserveLifeHpPool(ctx.classLevel)} HP total among creatures within 30 ft (max half HP each).`;
      break;
    case "Channel Divinity: Sacred Weapon": {
      const bonus = sacredWeaponBonus(ctx.abilityScores);
      reminder = `+${bonus} to attack rolls with one weapon for 1 minute; sheds bright light.`;
      break;
    }
    case "Channel Divinity: Vow of Enmity":
      reminder = "Advantage on attack rolls vs one creature for 1 minute.";
      break;
    case "Channel Divinity: Cloak of Shadows":
      reminder = "Invisible until the end of your next turn.";
      break;
    case "Channel Divinity: Invoke Duplicity":
      reminder = "Illusory duplicate for 1 minute (concentration); advantage vs creatures within 5 ft of it.";
      break;
    default:
      reminder = saveDc !== null && row.saveAbility
        ? `Targets make a ${row.saveAbility} save (DC ${saveDc}) or are turned/affected for 1 minute.`
        : "";
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: gate.kind,
    saveDc,
    saveAbility: row.saveAbility ?? null,
    reminder,
  };
}

// Sacred Weapon adds Charisma modifier (minimum +1) to attack rolls.
function sacredWeaponBonus(abilityScores: Record<string, number>): number {
  return Math.max(1, abilityModifier(abilityScores.charisma ?? 10));
}

// The CD option's EffectSpec: a buff for Sacred Weapon, roll-less utility otherwise.
function channelDivinityEffectSpec(kind: ChannelDivinityKind): EffectSpec {
  return {
    effectType: kind === "buff" ? "buff" : "utility",
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "none" },
    concentration: false,
  };
}

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of Channel Divinity operations atomically. Mirrors
 * applyShadowArtsOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Per use: the pool payer logs its own spendResource event (refunds the
 * CD charge on revert); a buff/condition side-effect logs under its own category
 * (restored on revert); the resources-category castChannelDivinity event records
 * the use with its DC / reminder / derived numbers.
 */
export async function applyChannelDivinityOperations(
  characterId: string,
  operations: ChannelDivinityOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: {
      spellcasting: true,
      resources: true,
      experiencePoints: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, subclass: true, level: true },
      },
    },
    notFound: (id) => new InvalidChannelDivinityOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const abilityScores = row.abilityScores as Record<string, number>;
      const entries: GateEntry[] = row.classEntries;

      const catalog = await tx.grantedAbility.findUnique({ where: { id: op.abilityId } });
      if (!catalog || catalog.source !== "channelDivinity") {
        throw new InvalidChannelDivinityOperationError(`Channel Divinity option not found in catalog: ${op.abilityId}`);
      }

      const gate = CHANNEL_DIVINITY_OPTIONS[catalog.name];
      if (!gate) {
        throw new InvalidChannelDivinityOperationError(`Unknown Channel Divinity option: ${catalog.name}`);
      }
      if (!isEntitled(gate, entries, level)) {
        throw new InvalidChannelDivinityOperationError(
          `Not entitled to ${catalog.name} (requires ${gate.className}${gate.subclass ? ` — ${gate.subclass}` : ""} level ${gate.minLevel})`,
        );
      }

      const cost = readAbilityCost(catalog);
      if (cost.kind !== "pool") {
        throw new InvalidChannelDivinityOperationError(`${catalog.name} has no Channel Divinity cost`);
      }

      // Effective level of the granting class (for Preserve Life's HP pool).
      const descriptor = describeChannelDivinity(catalog, gate, { abilityScores, profBonus, classLevel: level });

      const spellState = normalizeSpellcastingMutable(row.spellcasting);
      const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
      await castAbilityInTx(
        { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
        {
          name: catalog.name,
          entryId: catalog.id,
          cost,
          effect: channelDivinityEffectSpec(gate.kind),
          requested: cost.base, // flat 1 CD charge
          roll: 0,
          eventType: "castChannelDivinity",
          concentrates: false,
        },
      );

      // Per-kind real side effects, sharing batchId for revert symmetry.
      if (gate.kind === "buff") {
        await appendActiveBuffInTx(
          tx,
          characterId,
          {
            key: catalog.id,
            target: catalog.buffTarget ?? "attackRoll",
            modifier: sacredWeaponBonus(abilityScores),
            source: catalog.name,
            sourceEntryId: catalog.id,
            duration: "while-active",
          },
          batchId,
          sessionId,
        );
      } else if (gate.kind === "invisible") {
        await applyConditionInTx(tx, characterId, "invisible", catalog.name, batchId, sessionId);
      }

      // The cast record itself restores nothing (CD refunded by the pool payer's
      // own spendResource event, buff/condition by their own events) — it records
      // the use with the DC / reminder / roll-mode data.
      let summary = `Channeled ${catalog.name.replace(/^Channel Divinity: /, "")}`;
      if (descriptor.saveDc !== null) summary += ` (DC ${descriptor.saveDc})`;
      else if (descriptor.reminder) summary += ` — ${descriptor.reminder}`;

      await logEvent(tx, {
        characterId,
        category: "resources",
        type: "castChannelDivinity",
        summary,
        data: {
          abilityId: catalog.id,
          abilityName: catalog.name,
          kind: gate.kind,
          saveDc: descriptor.saveDc,
          saveAbility: descriptor.saveAbility,
          reminder: descriptor.reminder,
          ...(gate.kind === "advantage" ? { rollMode: "advantage" } : {}),
        },
        batchId,
        sessionId,
      });
    },
  });
}
