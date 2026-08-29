// Way of the Four Elements discipline casting — PHB'14 pp.78, 80-81; not in SRD 5.1 (2014-only).
// The client rolls a discipline's damage (mirrors castSpell/castElementalBurst); the server only validates positivity.

import { Prisma } from "@/generated/prisma/client.js";
import type { CastDisciplineOperation } from "@character-sheet/contracts";

import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type AbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { deriveEntryScopedActions } from "./actions.js";
import { featureRowsOf } from "./feature-rows-select.js";
import { catalogEffectSpec, resolveEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeResourcesMutable, type ChoiceEntry } from "./resources.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents } from "./focus-cast.js";

export class InvalidDisciplineOperationError extends Error {}

// PHB'14 p.80's Elemental Disciplines table.
export function maxKiPerDiscipline(monkLevel: number): number {
  return Math.min(6, 2 + Math.floor((monkLevel - 1) / 4));
}

// The 7 disciplines that cast a concentration spell — PHB'14 p.81.
const CONCENTRATION_DISCIPLINES = new Set<string>([
  "Rush of the Gale Spirits",
  "Clench of the North Wind",
  "Mist Stance",
  "Ride the Wind",
  "Eternal Mountain Defense",
  "River of Hungry Flame",
  "Wave of Rolling Earth",
]);

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

export function disciplineEffectSpec(row: DisciplineEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "poolStep", dicePerStep: row.costPerStep ?? 0 },
    concentrates: (name) => CONCENTRATION_DISCIPLINES.has(name),
  });
}

export interface DisciplineCastStep {
  ki: number;
  roll: { count: number; faces: number; modifier: number };
}

// Client reads a roll verbatim, never computes it (mirrors effectRolls[]); the real per-monk cap is enforced at cast time by assertDisciplineKiSpend, not here.
// PHB'14: overspend is allowed only when a discipline's own text says so — a non-scalable row (no costPerStep) yields one step.
export function disciplineCastSteps(row: DisciplineEffectRow, cost: AbilityCost): DisciplineCastStep[] {
  if (cost.kind !== "pool") return [];
  const effect = disciplineEffectSpec(row);
  if (!effect.dice) return [];
  const base = resolveEffectSpec(effect, 0, { characterLevel: 0 });
  if (!base) return [];
  if (!cost.perStep) return [{ ki: cost.base, roll: base }];
  // maxKiPerDiscipline flattens at monk L17 (min(6, …)) — 17 here is just the smallest input reaching that ceiling, not a duplicated rules fact.
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

// Same gate the wire's availableActions[] uses (DERIVED_ACTIONS) — never a separate check.
// Returns the Four Elements entry's OWN effective level, not the total character level — a secondary monk's ki cap scales to its own level (mirrors deriveEntryScopedActions).
function assertFourElementsMonk(row: DisciplineRow): number {
  const monk = fourElementsMonkEntry(row);
  const totalLevel = levelForExperience(row.experiencePoints);
  const edition = editionOf(row);
  const granted = deriveEntryScopedActions(row.classEntries, totalLevel, [], true, edition, featureRowsOf).some(
    (a) => a.key === "castDiscipline",
  );
  if (!monk || !granted) {
    throw new InvalidDisciplineOperationError("Only a Way of the Four Elements monk (level 3+) can cast elemental disciplines");
  }
  return effectiveEntryLevel(monk.level, row.classEntries.length, totalLevel);
}

// entry.optionId is deliberately unguarded here (already validated by resolveChoiceOption's crossEditionRejection at learn time) — same exemption shape as loadManeuver, and allowlisted in the catalog-id edition-guard check.
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

// PHB'14 p.80: ki spent must be [base, per-cast cap] for a scalable row, exactly base for a non-scaling one (e.g. Fist of Four Thunders), 0 for costless.
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

  // fallow-ignore-next-line code-duplication -- the same spellState/beforeSpell/costCtx setup + castAbilityInTx call shape as applyCastShadowArt (the clone group this file's own header predicted, #642's original pairing). Not consolidated further here: #1503 is explicitly barred from touching applyCastShadowArt's module (owned by the parallel #1501/#1502 slices in this epic) — extracting a shared helper would require editing that module too.
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

  // Concentration reverts via the spellcasting event's own restore of concentratingOn; ki reverts via the pool payer's spendResource event — this resources record carries only the roll/ki data.
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
