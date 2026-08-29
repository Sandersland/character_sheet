import type { ChannelDivinityOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { appendActiveBuffInTx } from "@/lib/combat/active-effects.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { applyConditionInTx } from "@/lib/combat/conditions.js";
import type { EffectSpec } from "@/lib/combat/effects.js";
import { logEvent } from "@/lib/activity/events.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { abilityModifier } from "@/lib/srd/srd.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

export class InvalidChannelDivinityOperationError extends Error {}

export type ChannelDivinityKind = "announce" | "buff" | "advantage" | "invisible" | "reminder";

interface ChannelDivinityGate {
  className: "cleric" | "paladin";
  subclass?: string; // lowercase; absent = any subclass of that class
  // A plain number when both editions grant at the same level; a Record<RulesEdition, number> only when they differ (see minLevelFor).
  minLevel: number | Record<RulesEdition, number>;
  kind: ChannelDivinityKind;
}

function minLevelFor(gate: ChannelDivinityGate, edition: RulesEdition): number {
  return typeof gate.minLevel === "number" ? gate.minLevel : gate.minLevel[edition];
}

// Turn the Unholy/Turn the Faithless/Abjure Enemy gates stay: their catalog rows are retagged EDITION_2014, and resolveEditionCatalog already excludes them for 2024 characters before this gate runs — dead-for-2024 is correct, not a bug.
export const CHANNEL_DIVINITY_OPTIONS: Record<string, ChannelDivinityGate> = {
  "Channel Divinity: Turn Undead": { className: "cleric", minLevel: 2, kind: "announce" },
  // PHB'14 p.59/p.63 grants at level 2; SRD 5.2 p.40 shifts to level 3.
  "Channel Divinity: Preserve Life": {
    className: "cleric",
    subclass: "life domain",
    minLevel: { EDITION_2014: 2, EDITION_2024: 3 },
    kind: "reminder",
  },
  "Channel Divinity: Invoke Duplicity": {
    className: "cleric",
    subclass: "trickery domain",
    minLevel: { EDITION_2014: 2, EDITION_2024: 3 },
    kind: "reminder",
  },
  // PHB'14 p.63 only; SRD 5.2 drops it (replaced by Trickster's Transposition) — same dead-for-2024 pattern as above.
  "Channel Divinity: Cloak of Shadows": { className: "cleric", subclass: "trickery domain", minLevel: 6, kind: "invisible" },
  "Channel Divinity: Sacred Weapon": { className: "paladin", subclass: "oath of devotion", minLevel: 3, kind: "buff" },
  "Channel Divinity: Turn the Unholy": { className: "paladin", subclass: "oath of devotion", minLevel: 3, kind: "announce" },
  "Channel Divinity: Nature's Wrath": { className: "paladin", subclass: "oath of the ancients", minLevel: 3, kind: "announce" },
  "Channel Divinity: Turn the Faithless": { className: "paladin", subclass: "oath of the ancients", minLevel: 3, kind: "announce" },
  "Channel Divinity: Abjure Enemy": { className: "paladin", subclass: "oath of vengeance", minLevel: 3, kind: "announce" },
  "Channel Divinity: Vow of Enmity": { className: "paladin", subclass: "oath of vengeance", minLevel: 3, kind: "advantage" },
  // SRD 5.2 — base option every Paladin gets (no subclass), gated at L3 (2024's Channel Divinity grant level, not L1 as in 2014).
  "Channel Divinity: Divine Sense": { className: "paladin", minLevel: 3, kind: "reminder" },
  // SRD 5.2 — base option (no subclass) at L9; DC is Charisma-derived, but the target's save ability is Wisdom (catalog row's saveAbility).
  "Abjure Foes": { className: "paladin", minLevel: 9, kind: "announce" },
};

export interface GateEntry {
  name: string;
  subclass?: string | null;
  level?: number | null;
}

// characterLevel is XP-derived total level — persisted classEntry.level is a multiclass hint, not trusted here (mirrors deriveResources).
export function isEntitled(gate: ChannelDivinityGate, entries: GateEntry[], characterLevel: number, edition: RulesEdition): boolean {
  if (characterLevel < minLevelFor(gate, edition)) return false;
  return entries.some((e) => {
    if (e.name.toLowerCase() !== gate.className) return false;
    return !gate.subclass || (e.subclass ?? "").toLowerCase() === gate.subclass;
  });
}

function channelDivinitySaveDC(
  className: "cleric" | "paladin",
  abilityScores: Record<string, number>,
  profBonus: number,
): number {
  const ability = className === "cleric" ? "wisdom" : "charisma";
  return 8 + profBonus + abilityModifier(abilityScores[ability] ?? 10);
}

function preserveLifeHpPool(clericLevel: number): number {
  return clericLevel * 5;
}

// PHB'14 p.63: Action + Concentration. PHB'24 pp.75-76: Bonus Action, no Concentration, movable by bonus action.
function invokeDuplicityReminder(edition: RulesEdition): string {
  switch (edition) {
    case "EDITION_2014":
      return "Illusory duplicate for 1 minute (concentration); advantage vs creatures within 5 ft of it.";
    case "EDITION_2024":
      return "Illusory duplicate for 1 minute (no concentration); use a bonus action to move it up to 30 ft; advantage vs creatures within 5 ft of it.";
    default: {
      const exhaustive: never = edition;
      throw new Error(`invokeDuplicityReminder: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// PHB'14 p.57: turned (flees). SRD 5.2 p.37: Frightened + Incapacitated, ends early on damage.
// saveDc is always real for this "announce" kind, but stays nullable in the type, so this falls back to "?" rather than printing "null".
function turnUndeadReminder(saveAbility: string | null | undefined, saveDc: number | null, edition: RulesEdition): string {
  const dc = saveDc ?? "?";
  switch (edition) {
    case "EDITION_2014":
      return `Targets make a ${saveAbility} save (DC ${dc}) or are turned for 1 minute.`;
    case "EDITION_2024":
      return `Targets make a ${saveAbility} save (DC ${dc}) or gain the Frightened and Incapacitated conditions for 1 minute (ends early if they take damage, you have the Incapacitated condition, or you die).`;
    default: {
      const exhaustive: never = edition;
      throw new Error(`turnUndeadReminder: unhandled edition ${String(exhaustive)}`);
    }
  }
}

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
  classLevel: number;
  edition: RulesEdition;
}

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
      const bonus = chaModifierFloor1(ctx.abilityScores);
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
      reminder = invokeDuplicityReminder(ctx.edition);
      break;
    case "Channel Divinity: Turn Undead":
      reminder = turnUndeadReminder(row.saveAbility, saveDc, ctx.edition);
      break;
    // Without this arm, the default branch's `saveDc !== null && row.saveAbility` check yields "" for this row (no saveAbility) — a silent empty reminder.
    case "Channel Divinity: Divine Sense":
      reminder = "Sense celestials, fiends, and undead within 60 ft for 10 minutes or until Incapacitated; also reveals consecrated/desecrated places (as Hallow).";
      break;
    // Abjure Foes is the only row without a "Channel Divinity: " prefix — if you ever normalize that name, update this case label too, or this arm falls through to default and loses the target count.
    case "Abjure Foes":
      reminder = `Up to ${chaModifierFloor1(ctx.abilityScores)} creature(s) within 60 ft make a ${row.saveAbility} save (DC ${saveDc}) or are Frightened for 1 minute or until damaged.`;
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

function chaModifierFloor1(abilityScores: Record<string, number>): number {
  return Math.max(1, abilityModifier(abilityScores.charisma ?? 10));
}

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

// One batchId, LIFO-undoable events (mirrors applyShadowArtsOperations): the pool payer's spendResource event refunds CD on revert; buff/condition side effects revert under their own category.
async function resolveChannelDivinityCast(
  tx: Prisma.TransactionClient,
  abilityId: string,
  ctx: { entries: GateEntry[]; level: number; abilityScores: Record<string, number>; profBonus: number; edition: RulesEdition },
) {
  const catalog = await tx.grantedAbility.findUnique({ where: { id: abilityId } });
  if (!catalog || catalog.source !== "channelDivinity") {
    throw new InvalidChannelDivinityOperationError(`Channel Divinity option not found in catalog: ${abilityId}`);
  }

  // Must run before the gate lookup below: a wrong-edition row may not even be a CHANNEL_DIVINITY_OPTIONS key, and should report edition mismatch, not "Unknown Channel Divinity option" (#1345).
  const mismatch = crossEditionRejection(catalog, `Channel Divinity option "${catalog.name}"`, ctx.edition);
  if (mismatch) throw new InvalidChannelDivinityOperationError(mismatch);

  const gate = CHANNEL_DIVINITY_OPTIONS[catalog.name];
  if (!gate) {
    throw new InvalidChannelDivinityOperationError(`Unknown Channel Divinity option: ${catalog.name}`);
  }
  if (!isEntitled(gate, ctx.entries, ctx.level, ctx.edition)) {
    throw new InvalidChannelDivinityOperationError(
      `Not entitled to ${catalog.name} (requires ${gate.className}${gate.subclass ? ` — ${gate.subclass}` : ""} level ${minLevelFor(gate, ctx.edition)})`,
    );
  }

  const cost = readAbilityCost(catalog);
  if (cost.kind !== "pool") {
    throw new InvalidChannelDivinityOperationError(`${catalog.name} has no Channel Divinity cost`);
  }

  const descriptor = describeChannelDivinity(catalog, gate, {
    abilityScores: ctx.abilityScores,
    profBonus: ctx.profBonus,
    classLevel: ctx.level,
    edition: ctx.edition,
  });

  return { catalog, gate, cost, descriptor };
}

async function applyChannelDivinitySideEffect(
  tx: Prisma.TransactionClient,
  characterId: string,
  gate: ChannelDivinityGate,
  catalog: { id: string; name: string; buffTarget: string | null },
  abilityScores: Record<string, number>,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  if (gate.kind === "buff") {
    await appendActiveBuffInTx(
      tx,
      characterId,
      {
        key: catalog.id,
        target: catalog.buffTarget ?? "attackRoll",
        modifier: chaModifierFloor1(abilityScores),
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
}

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
      rulesEdition: true,
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

      const { catalog, gate, cost, descriptor } = await resolveChannelDivinityCast(tx, op.abilityId, {
        entries: row.classEntries,
        level,
        abilityScores,
        profBonus,
        edition: editionOf(row),
      });

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

      await applyChannelDivinitySideEffect(tx, characterId, gate, catalog, abilityScores, batchId, sessionId);

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
