import type {
  CampaignRecap,
  ParticipantSummary,
  SessionSummary,
  SessionSummaryAdvancement,
  SessionSummaryItem,
} from "@character-sheet/shared-types";

// CampaignRecap/ParticipantSummary/SessionSummary are re-exported here so importers of this module keep resolving them (#1273).
export type { CampaignRecap, ParticipantSummary, SessionSummary };

export interface SummaryEventInput {
  type: string;
  reverted?: boolean;
  before?: unknown;
  after?: unknown;
  data?: unknown;
}

interface SummaryWindow {
  startedAt: Date;
  endedAt: Date;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numField(value: unknown, key: string): number | undefined {
  const v = asRecord(value)[key];
  return typeof v === "number" ? v : undefined;
}

function spellcastingCount(snapshot: unknown, counter: string, level: number): number {
  const spellcasting = asRecord(asRecord(snapshot).spellcasting);
  const map = asRecord(spellcasting[counter]);
  const v = map[String(level)];
  return typeof v === "number" ? v : 0;
}

// restoreSlot is logged identically ({ level }) for a real slot restore and a Warlock Mystic Arcanum charge restore; only which counter moved tells them apart.
function isArcanumRestore(event: SummaryEventInput, level: number): boolean {
  const slotsBefore = spellcastingCount(event.before, "slotsUsed", level);
  const slotsAfter = spellcastingCount(event.after, "slotsUsed", level);
  if (slotsAfter < slotsBefore) return false;
  const arcanumBefore = spellcastingCount(event.before, "arcanumUsed", level);
  const arcanumAfter = spellcastingCount(event.after, "arcanumUsed", level);
  return arcanumAfter < arcanumBefore;
}

// Cast-side counterpart to isArcanumRestore: a Mystic Arcanum cast goes through castSpell with a non-null slotLevel but bumps arcanumUsed, not slotsUsed.
function isArcanumCast(event: SummaryEventInput, level: number): boolean {
  const slotsBefore = spellcastingCount(event.before, "slotsUsed", level);
  const slotsAfter = spellcastingCount(event.after, "slotsUsed", level);
  if (slotsAfter > slotsBefore) return false;
  const arcanumBefore = spellcastingCount(event.before, "arcanumUsed", level);
  const arcanumAfter = spellcastingCount(event.after, "arcanumUsed", level);
  return arcanumAfter > arcanumBefore;
}

interface SummaryAccumulator {
  xpGained: number;
  levelsGained: number;
  spellsCast: number;
  combatRounds: number;
  attackRolls: number;
  damageRolls: number;
  itemNet: Map<string, number>;
  soldNet: Map<string, number>;
  lootNet: Map<string, number>;
  slotsSpent: Record<string, number>;
  featsOrAsis: SessionSummaryAdvancement[];
}

function createAccumulator(): SummaryAccumulator {
  return {
    xpGained: 0,
    levelsGained: 0,
    spellsCast: 0,
    combatRounds: 0,
    attackRolls: 0,
    damageRolls: 0,
    itemNet: new Map(),
    soldNet: new Map(),
    lootNet: new Map(),
    slotsSpent: {},
    featsOrAsis: [],
  };
}

function tallyItemEvent(
  map: Map<string, number>,
  event: SummaryEventInput,
  transform: (delta: number) => number = (delta) => delta,
): void {
  const data = asRecord(event.data);
  const name = typeof data.itemName === "string" ? data.itemName : null;
  const delta = numField(event.data, "quantityDelta");
  if (name && delta !== undefined) {
    map.set(name, (map.get(name) ?? 0) + transform(delta));
  }
}

function applyProgressEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type === "levelUp") {
    acc.levelsGained += 1;
    return;
  }
  if (event.type !== "xpAward" && event.type !== "xpSet") return;
  const before = numField(event.before, "experiencePoints");
  const after = numField(event.after, "experiencePoints");
  if (before !== undefined && after !== undefined) acc.xpGained += after - before;
}

function applyRollEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  switch (event.type) {
    case "combatRoundAdvanced": {
      const round = numField(event.data, "round");
      if (typeof round === "number") acc.combatRounds = Math.max(acc.combatRounds, round);
      break;
    }
    case "attackRoll":
      acc.attackRolls += 1;
      break;
    case "damageRoll":
      acc.damageRolls += 1;
      break;
    default:
      break;
  }
}

/** Inventory nets: acquisitions, sales (magnitude), and DM loot grants (#382). */
function applyItemEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  switch (event.type) {
    case "acquired":
    case "bought":
    case "consumed":
    case "removed":
      tallyItemEvent(acc.itemNet, event);
      break;
    case "sold":
      // A sale's quantityDelta is negative; record the magnitude as a positive count.
      tallyItemEvent(acc.soldNet, event, Math.abs);
      break;
    case "awarded":
    case "revoked":
      tallyItemEvent(acc.lootNet, event);
      break;
    default:
      break;
  }
}

function applyCastEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type !== "expendSlot" && event.type !== "castSpell") return;
  if (event.type === "castSpell") acc.spellsCast += 1;
  // castSpell stores `slotLevel` (null for cantrips); expendSlot stores `level`.
  const data = asRecord(event.data);
  const level = numField(event.data, "level") ?? numField(event.data, "slotLevel");
  if (typeof level !== "number" || data.slotLevel === null) return;
  if (isArcanumCast(event, level)) return;
  const key = String(level);
  acc.slotsSpent[key] = (acc.slotsSpent[key] ?? 0) + 1;
}

function applyRestoreEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type !== "restoreSlot") return;
  const level = numField(event.data, "level");
  if (typeof level !== "number") return;
  if (isArcanumRestore(event, level)) return;
  const key = String(level);
  // Floor at 0: a cross-session restore has no in-window expend to net against.
  const next = (acc.slotsSpent[key] ?? 0) - 1;
  if (next > 0) acc.slotsSpent[key] = next;
  else delete acc.slotsSpent[key];
}

function applyAdvancementEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type !== "abilityScoreImprovement" && event.type !== "featTaken") return;
  const data = asRecord(event.data);
  const label =
    typeof data.featName === "string"
      ? `Feat: ${data.featName}`
      : event.type === "featTaken"
        ? "Feat taken"
        : "Ability Score Improvement";
  acc.featsOrAsis.push({ type: event.type, label });
}

// checkRoll/saveRoll/initiativeRoll are logged but intentionally not yet surfaced here (#128).
function applyEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  applyProgressEvent(acc, event);
  applyRollEvent(acc, event);
  applyItemEvent(acc, event);
  applyCastEvent(acc, event);
  applyRestoreEvent(acc, event);
  applyAdvancementEvent(acc, event);
}

export function computeSessionSummary(
  events: SummaryEventInput[],
  window: SummaryWindow,
): SessionSummary {
  const acc = createAccumulator();
  for (const event of events) {
    if (event.reverted) continue;
    applyEvent(acc, event);
  }

  return {
    startedAt: window.startedAt.toISOString(),
    endedAt: window.endedAt.toISOString(),
    durationMs: Math.max(0, window.endedAt.getTime() - window.startedAt.getTime()),
    xpGained: acc.xpGained,
    levelsGained: acc.levelsGained,
    itemsAcquired: itemsFromMap(acc.itemNet),
    itemsSold: itemsFromMap(acc.soldNet),
    loot: itemsFromMap(acc.lootNet),
    slotsSpent: acc.slotsSpent,
    spellsCast: acc.spellsCast,
    combatRounds: acc.combatRounds,
    attackRolls: acc.attackRolls,
    damageRolls: acc.damageRolls,
    featsOrAsis: acc.featsOrAsis,
  };
}

function mergeItems(map: Map<string, number>, items: SessionSummaryItem[]): void {
  for (const item of items) {
    map.set(item.name, (map.get(item.name) ?? 0) + item.qty);
  }
}

function itemsFromMap(map: Map<string, number>): SessionSummaryItem[] {
  return [...map.entries()]
    .filter(([, qty]) => qty !== 0)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// combatRounds is the max across participants (how long combat lasted), not a per-participant sum.
export function computeCampaignRecap(participants: ParticipantSummary[]): CampaignRecap {
  const itemNet = new Map<string, number>();
  const soldNet = new Map<string, number>();
  const lootNet = new Map<string, number>();
  const slotsSpent: Record<string, number> = {};
  const featsOrAsis: SessionSummaryAdvancement[] = [];
  let xpGained = 0;
  let levelsGained = 0;
  let spellsCast = 0;
  let combatRounds = 0;
  let attackRolls = 0;
  let damageRolls = 0;
  let totalPresentMs = 0;
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;

  for (const p of participants) {
    xpGained += p.xpGained;
    levelsGained += p.levelsGained;
    spellsCast += p.spellsCast;
    combatRounds = Math.max(combatRounds, p.combatRounds);
    attackRolls += p.attackRolls;
    damageRolls += p.damageRolls;
    totalPresentMs += p.presentMs;
    startMs = Math.min(startMs, new Date(p.joinedAt).getTime());
    endMs = Math.max(endMs, new Date(p.leftAt ?? p.endedAt).getTime());
    mergeItems(itemNet, p.itemsAcquired);
    mergeItems(soldNet, p.itemsSold);
    // Coalesce: participant summaries stored before #382 lack loot.
    mergeItems(lootNet, p.loot ?? []);
    for (const [level, count] of Object.entries(p.slotsSpent)) {
      slotsSpent[level] = (slotsSpent[level] ?? 0) + count;
    }
    featsOrAsis.push(...p.featsOrAsis);
  }

  const hasParticipants = participants.length > 0;
  return {
    startedAt: hasParticipants ? new Date(startMs).toISOString() : null,
    endedAt: hasParticipants ? new Date(endMs).toISOString() : null,
    durationMs: hasParticipants ? Math.max(0, endMs - startMs) : 0,
    participantCount: participants.length,
    xpGained,
    levelsGained,
    spellsCast,
    combatRounds,
    attackRolls,
    damageRolls,
    itemsAcquired: itemsFromMap(itemNet),
    itemsSold: itemsFromMap(soldNet),
    loot: itemsFromMap(lootNet),
    slotsSpent,
    featsOrAsis,
    totalPresentMs,
  };
}
