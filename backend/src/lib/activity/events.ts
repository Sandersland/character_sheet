import { Prisma } from "@/generated/prisma/client.js";

export type EventCategory =
  | "inventory"
  | "hitPoints"
  | "experience"
  | "currency"
  | "spellcasting"
  | "class"
  | "resources"
  | "advancement"
  | "session"
  | "combat"
  | "conditions"
  | "effects"
  | "roll";

export type EventType =
  | "acquired"
  | "consumed"
  | "sold"
  | "bought"
  | "removed"
  | "awarded"
  | "revoked"
  | "damage"
  | "heal"
  | "setTemp"
  | "shortRest"
  | "longRest"
  | "levelUp"
  | "levelDown"
  | "deathSave"
  | "stabilize"
  | "xpAward"
  | "xpSet"
  | "currencyAdjust"
  | "castSpell"
  | "castAbilitySlot"
  | "expendSlot"
  | "restoreSlot"
  | "learnSpell"
  | "forgetSpell"
  | "prepareSpell"
  | "unprepareSpell"
  | "concentrationDropped"
  | "convertSorceryPoints"
  | "classAdded"
  | "subclassChosen"
  | "subclassRemoved"
  | "fightingStyleChosen"
  | "fightingStyleRemoved"
  | "classLevelsReconciled"
  | "spendResource"
  | "restoreResource"
  | "initiativeRegen"
  | "learnManeuver"
  | "forgetManeuver"
  | "maneuversReconciled"
  | "castManeuver"
  | "castShadowArt"
  | "castChannelDivinity"
  | "castStunningStrike"
  | "imposeOpenHandRider"
  | "setQuiveringPalm"
  | "triggerQuiveringPalm"
  | "dealHandOfHarm"
  | "useHandOfUltimateMercy"
  | "castElementalBurst"
  | "castDiscipline"
  | "elementalStrike"
  | "learnToolProficiency"
  | "forgetToolProficiency"
  | "toolProficienciesReconciled"
  | "learnExpertise"
  | "forgetExpertise"
  | "expertiseReconciled"
  | "learnSubclassChoice"
  | "forgetSubclassChoice"
  | "subclassChoicesReconciled"
  | "abilityScoreImprovement"
  | "featTaken"
  | "advancementRemoved"
  | "advancementsReconciled"
  | "equipped"
  | "unequipped"
  | "attuned"
  | "unattuned"
  | "weaponBonded"
  | "weaponUnbonded"
  | "activated"
  | "deactivated"
  | "activatedRecharged"
  | "sessionStarted"
  | "sessionEnded"
  | "combatStarted"
  | "combatEnded"
  | "combatRoundAdvanced"
  // #1829: resolveAction carries its rolls in `data`; attackRoll/damageRoll/castSpell stay for the standalone roll-log paths until #1832/#1833 retire them.
  | "resolveAction"
  | "conditionApplied"
  | "conditionRemoved"
  | "exhaustionSet"
  | "buffApplied"
  | "buffCleared"
  | "attackRoll"
  | "damageRoll"
  | "checkRoll"
  | "saveRoll"
  | "initiativeRoll"
  | "revert";

export interface LogEventParams {
  characterId: string;
  category: EventCategory;
  type: EventType;
  // Stored at write time so the timeline reads correctly even if semantics change.
  summary: string;
  // Polymorphic soft-reference — no FK. entityType = "InventoryItem", etc.
  entityType?: string;
  entityId?: string | null;
  // Drives undo and field-level diff.
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  // Op-specific inputs not derivable from before/after alone.
  data?: Record<string, unknown> | null;
  batchId?: string;
  actor?: string;
  // Null for out-of-session events (shopping, level-ups on the reference sheet).
  sessionId?: string | null;
}

type DiffField = {
  path: string;
  oldValue: Prisma.InputJsonValue | null;
  newValue: Prisma.InputJsonValue | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Arrays compare via JSON.stringify — a reordered/extended array reads as one change at its own path, not per-element.
function diffLeaf(path: string, oldVal: unknown, newVal: unknown): DiffField[] {
  const normalizedOld = oldVal === undefined ? null : oldVal;
  const normalizedNew = newVal === undefined ? null : newVal;
  if (JSON.stringify(normalizedOld) === JSON.stringify(normalizedNew)) return [];
  return [{
    path,
    oldValue: normalizedOld as Prisma.InputJsonValue | null,
    newValue: normalizedNew as Prisma.InputJsonValue | null,
  }];
}

export function diffToFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  prefix = ""
): DiffField[] {
  const b = before ?? {};
  const a = after ?? {};
  const result: DiffField[] = [];

  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = b[key];
    const newVal = a[key];
    if (isPlainObject(oldVal) && isPlainObject(newVal)) {
      result.push(...diffToFields(oldVal, newVal, path));
    } else {
      result.push(...diffLeaf(path, oldVal, newVal));
    }
  }

  return result;
}

// Always call inside the caller's $transaction — not standalone, so the event write is atomic with the state change it records.
export async function logEvent(
  tx: Prisma.TransactionClient,
  params: LogEventParams
): Promise<void> {
  const fieldDiffs = diffToFields(params.before, params.after);

  await tx.characterEvent.create({
    data: {
      characterId: params.characterId,
      category: params.category as Parameters<typeof tx.characterEvent.create>[0]["data"]["category"],
      type: params.type as Parameters<typeof tx.characterEvent.create>[0]["data"]["type"],
      summary: params.summary,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      before: (params.before ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      after: (params.after ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      data: (params.data ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      actor: params.actor ?? "player",
      batchId: params.batchId ?? null,
      sessionId: params.sessionId ?? null,
      fields: {
        create: fieldDiffs.map((f) => ({
          path: f.path,
          oldValue: (f.oldValue ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
          newValue: (f.newValue ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        })),
      },
    },
  });
}
