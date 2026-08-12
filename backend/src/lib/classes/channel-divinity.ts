/**
 * Channel Divinity cast handler (Cleric + Paladin, #419) — the CD counterpart to
 * applyShadowArtsOperations. Each CD option is a GrantedAbility row with source
 * "channelDivinity"; using one spends 1 Channel Divinity charge via the shared
 * payAbilityCostInTx pool path and routes through castAbilityInTx.
 *
 * The 5e rules that live here: the class/subclass/level gate per option, the
 * per-option "kind" (announce / buff / advantage / invisible / reminder), the
 * cleric-vs-paladin save DC ability, and the derived numbers (Preserve Life HP
 * pool, Sacred Weapon Charisma bonus). Description + cost + save ability come
 * from the catalog row.
 */

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
  // The class level at which the option is granted. Most options grant at the
  // same level in both editions and use a plain number. A few grant at
  // different levels per edition (Preserve Life, Invoke Duplicity) and use a
  // Record naming both editions' levels instead — see minLevelFor below.
  minLevel: number | Record<RulesEdition, number>;
  kind: ChannelDivinityKind;
}

// Reads a gate's minLevel for one edition. Most gates set a plain number
// (the same level in both editions); only a gate whose grant level actually
// differs sets the Record form.
function minLevelFor(gate: ChannelDivinityGate, edition: RulesEdition): number {
  return typeof gate.minLevel === "number" ? gate.minLevel : gate.minLevel[edition];
}

// Gate + kind per option, keyed by the catalog row name. Rows themselves carry
// description/cost/save ability; this table owns the class/subclass/level gate.
//
// #1229: "Turn the Unholy"/"Turn the Faithless"/"Abjure Enemy" gates STAY —
// the issue's own instruction to delete them outright would break a 2014
// Paladin. Their catalog rows retag to EDITION_2014 instead (channel-
// divinity.ts, the seed) — a 2024 character never sees them because
// resolveEditionCatalog (routes/character/channel-divinity.ts) already
// narrows the candidate list to that character's edition before this gate is
// ever consulted, so the (now dead-for-2024, live-for-2014) gate entry is
// correct as-is. "Divine Sense" and "Abjure Foes" are NEW base-class options
// (no `subclass` — every 2024 Paladin regardless of oath), added below.
export const CHANNEL_DIVINITY_OPTIONS: Record<string, ChannelDivinityGate> = {
  "Channel Divinity: Turn Undead": { className: "cleric", minLevel: 2, kind: "announce" },
  // #1590: the domain Channel Divinity options grant at DIFFERENT levels per
  // edition — PHB'14 p.59/p.63 grants both at level 2, alongside Channel
  // Divinity itself; SRD 5.2 p.40 shifts both to level 3, alongside the
  // subclass grant (#1128 only recorded the 2024 level, which wrongly held a
  // 2014 Cleric to level 3 too).
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
  // #1590: this option is only in PHB'14 p.63. SRD 5.2 drops it and replaces
  // it with Trickster's Transposition (cleric-features.ts). The catalog row
  // is now tagged EDITION_2014 (prisma/seed/channel-divinity.ts), so a 2024
  // character's list query already excludes it before this gate is ever
  // read — the same pattern as Turn the Unholy/Turn the Faithless/Abjure
  // Enemy above.
  "Channel Divinity: Cloak of Shadows": { className: "cleric", subclass: "trickery domain", minLevel: 6, kind: "invisible" },
  "Channel Divinity: Sacred Weapon": { className: "paladin", subclass: "oath of devotion", minLevel: 3, kind: "buff" },
  "Channel Divinity: Turn the Unholy": { className: "paladin", subclass: "oath of devotion", minLevel: 3, kind: "announce" },
  "Channel Divinity: Nature's Wrath": { className: "paladin", subclass: "oath of the ancients", minLevel: 3, kind: "announce" },
  "Channel Divinity: Turn the Faithless": { className: "paladin", subclass: "oath of the ancients", minLevel: 3, kind: "announce" },
  "Channel Divinity: Abjure Enemy": { className: "paladin", subclass: "oath of vengeance", minLevel: 3, kind: "announce" },
  "Channel Divinity: Vow of Enmity": { className: "paladin", subclass: "oath of vengeance", minLevel: 3, kind: "advantage" },
  // SRD 5.2, #1229: Divine Sense is the base Channel Divinity option every
  // Paladin starts with (no subclass), gated at L3 (the level Channel
  // Divinity itself is granted at in 2024, not L1 as in 2014).
  "Channel Divinity: Divine Sense": { className: "paladin", minLevel: 3, kind: "reminder" },
  // SRD 5.2, #1229: Abjure Foes is a base Channel Divinity option (no
  // subclass) granted at L9. The DC is Charisma-derived (channelDivinitySaveDC
  // below); the save ABILITY the target rolls is Wisdom (the catalog row's
  // own saveAbility column, prisma/seed/channel-divinity.ts).
  "Abjure Foes": { className: "paladin", minLevel: 9, kind: "announce" },
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
export function isEntitled(gate: ChannelDivinityGate, entries: GateEntry[], characterLevel: number, edition: RulesEdition): boolean {
  if (characterLevel < minLevelFor(gate, edition)) return false;
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

// Descriptor (shared by GET + cast summary).
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
  edition: RulesEdition;
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
    // #1590: PHB'14 p.63 keeps Invoke Duplicity as an Action that requires
    // Concentration. PHB'24 pp.75-76 (mirror-sourced, cleric-features.ts)
    // changes it to a Bonus Action, drops Concentration entirely, and lets
    // you move the duplicate with a Bonus Action.
    case "Channel Divinity: Invoke Duplicity":
      switch (ctx.edition) {
        case "EDITION_2014":
          reminder = "Illusory duplicate for 1 minute (concentration); advantage vs creatures within 5 ft of it.";
          break;
        case "EDITION_2024":
          reminder =
            "Illusory duplicate for 1 minute (no concentration); use a bonus action to move it up to 30 ft; advantage vs creatures within 5 ft of it.";
          break;
        default: {
          const exhaustive: never = ctx.edition;
          throw new Error(`describeChannelDivinity: unhandled edition ${String(exhaustive)}`);
        }
      }
      break;
    // #1590: PHB'14 p.57 turns undead into a fleeing "turned" state. SRD 5.2
    // p.37 (cleric-features.ts) instead gives Frightened and Incapacitated,
    // with its own early-end clause on damage.
    case "Channel Divinity: Turn Undead":
      switch (ctx.edition) {
        case "EDITION_2014":
          reminder = `Targets make a ${row.saveAbility} save (DC ${saveDc}) or are turned for 1 minute.`;
          break;
        case "EDITION_2024":
          reminder = `Targets make a ${row.saveAbility} save (DC ${saveDc}) or gain the Frightened and Incapacitated conditions for 1 minute (ends early if they take damage, you have the Incapacitated condition, or you die).`;
          break;
        default: {
          const exhaustive: never = ctx.edition;
          throw new Error(`describeChannelDivinity: unhandled edition ${String(exhaustive)}`);
        }
      }
      break;
    // #1229 follow-on 2: without its own arm, this reminder-kind row (no
    // saveAbility) would fall to the default branch's `saveDc !== null &&
    // row.saveAbility` check and yield "" — a silent empty reminder.
    case "Channel Divinity: Divine Sense":
      reminder = "Sense celestials, fiends, and undead within 60 ft for 10 minutes or until Incapacitated; also reveals consecrated/desecrated places (as Hallow).";
      break;
    // #1229: Abjure Foes' default-branch reminder ("or are turned/affected")
    // is generic; this arm states the real effect (Frightened) and the
    // Charisma-modifier target count instead.
    //
    // This case label is the row's name VERBATIM, and Abjure Foes is the only
    // CHANNEL_DIVINITIES row without the "Channel Divinity: " prefix. If you
    // ever normalise that name, change this label in the same edit — otherwise
    // this arm silently falls through to `default:` and the reminder loses the
    // target count. (Display is unaffected either way: the picker strips the
    // prefix with an anchored regex, so a bare name passes through unchanged.)
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

// Charisma modifier, floored at 1 — Sacred Weapon's attack-roll bonus AND
// Abjure Foes' target count share this exact SRD formula ("minimum +1" /
// "minimum of one creature"), so one function serves both call sites (#1229).
function chaModifierFloor1(abilityScores: Record<string, number>): number {
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

/**
 * Applies a batch of Channel Divinity operations atomically. Mirrors
 * applyShadowArtsOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Per use: the pool payer logs its own spendResource event (refunds the
 * CD charge on revert); a buff/condition side-effect logs under its own category
 * (restored on revert); the resources-category castChannelDivinity event records
 * the use with its DC / reminder / derived numbers.
 */
// Validate the requested Channel Divinity option against the catalog + gating +
// cost rules, returning the resolved catalog row, gate, (pool) cost and derived
// descriptor. Throws the same InvalidChannelDivinityOperationError messages as
// before — extracted so applyOp reads as resolve → cast → side-effect → log.
async function resolveChannelDivinityCast(
  tx: Prisma.TransactionClient,
  abilityId: string,
  ctx: { entries: GateEntry[]; level: number; abilityScores: Record<string, number>; profBonus: number; edition: RulesEdition },
) {
  const catalog = await tx.grantedAbility.findUnique({ where: { id: abilityId } });
  if (!catalog || catalog.source !== "channelDivinity") {
    throw new InvalidChannelDivinityOperationError(`Channel Divinity option not found in catalog: ${abilityId}`);
  }

  // Before the option-name gate lookup below, so a wrong-edition row (whose
  // name may not even be one of CHANNEL_DIVINITY_OPTIONS' keys) reports its
  // edition mismatch, never "Unknown Channel Divinity option" (#1345, found
  // by this plan's audit). Transient cast, not a permanent snapshot — still
  // a wrong-edition rule applied to one cast and recorded in the audit event.
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

  // Effective level of the granting class (for Preserve Life's HP pool).
  const descriptor = describeChannelDivinity(catalog, gate, {
    abilityScores: ctx.abilityScores,
    profBonus: ctx.profBonus,
    classLevel: ctx.level,
    edition: ctx.edition,
  });

  return { catalog, gate, cost, descriptor };
}

// Per-kind real side effects (buff appends an active buff, invisible applies the
// condition), sharing batchId for revert symmetry. No-op for the other kinds.
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
