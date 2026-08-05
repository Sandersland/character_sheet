/**
 * Way of the Four Elements discipline cast handler (2014-only, PHB'14 pp.
 * 78, 80-81 — not in SRD 5.1, #1503) — the Ki-fuelled analog to
 * shadow-arts.ts's Focus-fuelled Darkness cast, mirroring its shared
 * focus-cast scaffolding (focus-cast.ts). A discipline is a
 * ki-fuelled activated ability catalogued in GrantedAbility (source
 * "discipline"); casting one spends ki via the shared payAbilityCostInTx
 * pool path and rolls its EffectSpec.
 *
 * The 5e rules that live here: the per-cast ki cap (PHB'14 p.80's Elemental
 * Disciplines table), which disciplines require concentration (the spell
 * each one casts), and the ki-scaled EffectSpec build (scaling.mode
 * "poolStep", effects.ts).
 *
 * Unlike maneuvers.ts (a single server-rolled die), a discipline's damage
 * roll follows castSpell/castElementalBurst's convention: the effect is the
 * monk's own supernatural power, so the CLIENT rolls it and the server only
 * validates positivity (ability-cast.ts's own comment, #406) — a discipline
 * can deal many scaled dice (up to 8d6 for Flames of the Phoenix), unlike a
 * maneuver's fixed single die.
 */

import { Prisma } from "@/generated/prisma/client.js";
import type { CastDisciplineOperation } from "@character-sheet/contracts";

import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type AbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { deriveEntryScopedActions } from "./actions.js";
import { catalogEffectSpec, resolveEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeResourcesMutable, type ChoiceEntry } from "./resources.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents } from "./focus-cast.js";

export class InvalidDisciplineOperationError extends Error {}

/** Max ki spendable on ONE discipline cast, by monk level (PHB'14 p.80's Elemental Disciplines table). */
export function maxKiPerDiscipline(monkLevel: number): number {
  return Math.min(6, 2 + Math.floor((monkLevel - 1) / 4));
}

// The 7 disciplines that cast a concentration spell (PHB'14 p.81); the other
// 9 cast an instantaneous effect or (Fangs of the Fire Snake) carry no spell
// at all — see disciplines.ts (seed) for the per-discipline citation.
const CONCENTRATION_DISCIPLINES = new Set<string>([
  "Rush of the Gale Spirits", // gust of wind
  "Clench of the North Wind", // hold person
  "Mist Stance", // gaseous form
  "Ride the Wind", // fly
  "Eternal Mountain Defense", // stoneskin
  "River of Hungry Flame", // wall of fire
  "Wave of Rolling Earth", // wall of stone
]);

// Catalog columns needed to build a discipline's ki-scaled EffectSpec.
export interface DisciplineEffectRow {
  name: string;
  costPerStep?: number | null;
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
}

/**
 * Build a discipline's EffectSpec via the shared catalogEffectSpec builder:
 * disciplines scale by ki spent above the base cost, so scaling is always
 * mode "poolStep" with dicePerStep = costPerStep (0 for a discipline whose
 * text allows no overspend), and concentration is the name-set check above.
 */
export function disciplineEffectSpec(row: DisciplineEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "poolStep", dicePerStep: row.costPerStep ?? 0 },
    concentrates: (name) => CONCENTRATION_DISCIPLINES.has(name),
  });
}

/** One selectable ki amount for a discipline's cast picker, and the roll the
 *  client rolls at that amount (#1505's GET /api/disciplines catalog). */
export interface DisciplineCastStep {
  ki: number;
  roll: { count: number; faces: number; modifier: number };
}

/**
 * Every ki amount a discipline's cast picker can offer, base cost through the
 * PHB'14 Elemental Disciplines table's global ceiling (`maxKiPerDiscipline`'s
 * own asymptote at monk L17+), each paired with its resolved roll — mirrors
 * decorateSpellEffects' `effectRolls[]` (serialize/spellcasting.ts): the
 * client picks a ki amount and reads the matching roll verbatim, it never
 * computes `base + step * dicePerStep` itself. Character-agnostic on purpose
 * (this route has no character in scope): the true PER-CHARACTER cap by monk
 * level is still enforced server-side at cast time
 * (assertDisciplineKiSpend below) — a picker offering more steps than a
 * given monk can currently afford is exactly the "refused by the server,
 * not silently clamped client-side" behavior #1505 calls for. Empty for a
 * non-pool-cost row (Elemental Attunement has no discipline catalog row at
 * all, but a future no-cost row would land here) or a row with no dice
 * (a pure-utility discipline like Shape the Flowing River). A single step
 * at the base cost for a NON-scalable pool-cost row (no `costPerStep` — PHB'14
 * only allows overspend when the discipline's own text says so): offering
 * more would invite a cast assertDisciplineKiSpend now correctly refuses.
 */
export function disciplineCastSteps(row: DisciplineEffectRow, cost: AbilityCost): DisciplineCastStep[] {
  if (cost.kind !== "pool") return [];
  const effect = disciplineEffectSpec(row);
  if (!effect.dice) return [];
  const base = resolveEffectSpec(effect, 0, { characterLevel: 0 });
  if (!base) return [];
  if (!cost.perStep) return [{ ki: cost.base, roll: base }];
  // maxKiPerDiscipline is monotonic and flattens at monk L17 (min(6, ...)),
  // so any level >= 17 reads its asymptote — 17 is not a rules fact copied
  // in here, just the smallest input that reaches the function's own ceiling.
  const ceiling = maxKiPerDiscipline(17);
  const steps: DisciplineCastStep[] = [{ ki: cost.base, roll: base }];
  for (let ki = cost.base + 1; ki <= ceiling; ki++) {
    const roll = resolveEffectSpec(effect, ki - cost.base, { characterLevel: 0 });
    if (roll) steps.push({ ki, roll });
  }
  return steps;
}

type DisciplineRow = Prisma.CharacterGetPayload<{ select: typeof FOCUS_CAST_CHARACTER_SELECT }>;

function fourElementsMonkEntry(row: DisciplineRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

/**
 * Throws unless "castDiscipline" is granted (DERIVED_ACTIONS, actions.ts —
 * the same gate the wire's availableActions[] uses, #1315); returns the Four
 * Elements monk entry's OWN effective level (not necessarily the total
 * character level — a secondary monk's per-cast ki cap scales to its own
 * level, mirrors deriveEntryScopedActions' own entry-scoping).
 */
function assertFourElementsMonk(row: DisciplineRow): number {
  const monk = fourElementsMonkEntry(row);
  const totalLevel = levelForExperience(row.experiencePoints);
  const edition = editionOf(row);
  const granted = deriveEntryScopedActions(row.classEntries, totalLevel, [], true, edition).some(
    (a) => a.key === "castDiscipline",
  );
  if (!monk || !granted) {
    throw new InvalidDisciplineOperationError("Only a Way of the Four Elements monk (level 3+) can cast elemental disciplines");
  }
  return effectiveEntryLevel(monk.level, row.classEntries.length, totalLevel);
}

// Resolve + validate a known discipline entry (choicesKnown["fourElementsDisciplines"])
// against the op's entryId, and load its catalog row. `entry.optionId` is an
// ALREADY-PERSISTED id (admitted at learn time by resolveChoiceOption's own
// crossEditionRejection guard, resources.ts) — deliberately unguarded here,
// the exact loadManeuver exemption shape (maneuvers.ts's own comment; see
// scripts/check-catalog-id-edition-guard.sh's ALLOWLIST entry for this
// function). A custom (homebrew) discipline entry has no catalog row and no
// defined cost/effect, so it is rejected rather than guessed at.
async function loadKnownDiscipline(
  tx: Prisma.TransactionClient,
  row: DisciplineRow,
  entryId: string,
): Promise<{ entry: ChoiceEntry; catalog: NonNullable<Awaited<ReturnType<typeof tx.grantedAbility.findUnique>>> }> {
  const resources = normalizeResourcesMutable(row.resources);
  const known = resources.choicesKnown.fourElementsDisciplines ?? [];
  const entry = known.find((e) => e.id === entryId);
  if (!entry) {
    throw new InvalidDisciplineOperationError(`Discipline not known: ${entryId}`);
  }
  const catalog = entry.optionId ? await tx.grantedAbility.findUnique({ where: { id: entry.optionId } }) : null;
  if (!catalog) {
    throw new InvalidDisciplineOperationError(`Discipline not found in catalog: ${entry.name}`);
  }
  return { entry, catalog };
}

/**
 * Validate the ki spent on a discipline: within [base, per-cast cap] for a
 * SCALABLE pool-cost row (costPerStep set — PHB'14 p.80: "you can spend
 * additional ki points to increase the effect, when the discipline
 * description says so"), exactly the flat base for a non-scaling one (no
 * such clause — overspending buys nothing and isn't offered by the text at
 * all), 0 for a costless row. #1505: found via the discipline cast UI's own
 * browser verification — without the `!cost.perStep` branch, a flat-cost
 * discipline like Fist of Four Thunders (2 ki, no scaling clause) accepted
 * any ki up to the per-level cap for an identical, unchanged roll.
 */
function assertDisciplineKiSpend(
  disciplineName: string,
  cost: ReturnType<typeof readAbilityCost>,
  kiSpent: number,
  monkLevel: number,
): void {
  if (cost.kind !== "pool") {
    if (kiSpent !== 0) throw new InvalidDisciplineOperationError(`${disciplineName} costs no ki`);
    return;
  }
  if (!cost.perStep) {
    if (kiSpent !== cost.base) {
      throw new InvalidDisciplineOperationError(`${disciplineName} costs a flat ${cost.base} ki (no scaling)`);
    }
    return;
  }
  const maxKi = maxKiPerDiscipline(monkLevel);
  if (kiSpent < cost.base || kiSpent > maxKi) {
    throw new InvalidDisciplineOperationError(
      `${disciplineName} costs ${cost.base}-${maxKi} ki at monk level ${monkLevel} (got ${kiSpent})`,
    );
  }
}

// Resolve and validate a single discipline cast against the character row:
// the Four Elements gate, the known-entry + catalog lookup, the discipline's
// own level prerequisite, the ki-spend bounds, and (for a damage discipline)
// a positive client roll. Throws InvalidDisciplineOperationError on any
// failure; returns the pieces castDiscipline needs on success. Split out of
// castDiscipline so the 5e validation rules read as one unit and the apply
// function stays a thin resolve/cast/log body (keeps both under the
// CRAP/cyclomatic bar — mirrors the pre-retirement engine's own
// resolveDisciplineCast split, 34f5a4cf^:lib/classes/disciplines.ts).
async function resolveDisciplineCast(
  tx: Prisma.TransactionClient,
  row: DisciplineRow,
  op: CastDisciplineOperation,
) {
  const monkLevel = assertFourElementsMonk(row);
  const { entry, catalog } = await loadKnownDiscipline(tx, row, op.entryId);
  if (catalog.minLevel > monkLevel) {
    throw new InvalidDisciplineOperationError(`${catalog.name} requires monk level ${catalog.minLevel}+ (you are level ${monkLevel})`);
  }

  const cost = readAbilityCost(catalog);
  const kiSpent = cost.kind === "pool" ? (op.requestedKi ?? cost.base) : 0;
  assertDisciplineKiSpend(catalog.name, cost, kiSpent, monkLevel);

  const effect = disciplineEffectSpec(catalog);
  const concentrates = effect.concentration ?? false;
  const roll = effect.dice ? (op.roll ?? 0) : 0;
  if (effect.dice && roll <= 0) {
    throw new InvalidDisciplineOperationError(`${catalog.name} requires a positive damage roll`);
  }

  return { entry, catalog, cost, kiSpent, effect, concentrates, roll };
}

async function castDiscipline(
  ctx: CharacterTxContext<DisciplineRow, CastDisciplineOperation>,
): Promise<void> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;
  const { entry, catalog, cost, kiSpent, effect, concentrates, roll } = await resolveDisciplineCast(tx, row, op);

  // fallow-ignore-next-line code-duplication -- the same spellState/beforeSpell/costCtx setup + castAbilityInTx call shape as shadow-arts.ts's applyCastShadowArt (the ".fallowrc.jsonc" clone group this file's own header predicted, #642's original pairing). Not consolidated further here: #1503 is explicitly barred from touching shadow-arts.ts (owned by the parallel #1501/#1502 slices in this epic) — extracting a shared helper would require editing that file too.
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const beforeSpell = snapshotSpellcasting(spellState);

  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: catalog.name,
      entryId: entry.id,
      cost,
      effect,
      requested: cost.kind === "pool" ? kiSpent : undefined,
      roll,
      eventType: "castDiscipline",
      concentrates,
    },
  );

  // Shared focus-cast audit tail (focus-cast.ts): when concentrating, persist
  // the write-back + log the undoable spellcasting event (restores
  // concentratingOn on revert). The resources cast record restores nothing
  // (ki refunded by the pool payer's own spendResource event, concentration
  // by the event above), so it carries only the roll/ki data.
  await emitFocusCastEvents(tx, {
    characterId,
    batchId,
    sessionId,
    eventType: "castDiscipline",
    concentrates,
    spellState,
    beforeSpell,
    concentrationName: catalog.name,
    concentrationData: { entryId: entry.id, disciplineId: catalog.id, disciplineName: catalog.name },
    resourceSummary: outcome.summary,
    resourceData: { entryId: entry.id, disciplineId: catalog.id, kiSpent, roll },
  });
}

/**
 * Applies a batch of discipline cast operations atomically. Mirrors
 * applyShadowArtsOperations: one batchId, LIFO-undoable events, state
 * re-read per op. Each cast: the pool payer logs its own spendResource event
 * (refunds ki on revert); a concentrating discipline logs a spellcasting-
 * category event (restores concentratingOn on revert); the resources-
 * category castDiscipline event records the cast.
 */
export async function applyDisciplineOperations(
  characterId: string,
  operations: CastDisciplineOperation[],
): Promise<void> {
  await runCharacterTransaction<typeof FOCUS_CAST_CHARACTER_SELECT, CastDisciplineOperation>(characterId, operations, {
    select: FOCUS_CAST_CHARACTER_SELECT,
    notFound: (id) => new InvalidDisciplineOperationError(`Character not found: ${id}`),
    applyOp: castDiscipline,
  });
}
