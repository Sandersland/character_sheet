/**
 * Pure aggregation of a play session's event log into an end-of-session
 * summary (Session Phase 3). Lives here — separate from the DB lifecycle in
 * `sessions.ts` — so it is unit-testable without Postgres.
 *
 * Derive, don't persist: the summary is computed entirely from the session's
 * existing `CharacterEvent` rows. No new per-event bookkeeping is introduced.
 */

/** One acquired-item line: catalog/custom name + net quantity gained. */
export interface SummaryItem {
  name: string;
  qty: number;
}

/** A level-up, ASI, or feat taken during the session — surfaced as a headline. */
export interface SummaryAdvancement {
  /** "levelUp" | "abilityScoreImprovement" | "featTaken" */
  type: string;
  /** Human-readable description, copied from the event's stored summary. */
  label: string;
}

export interface SessionSummary {
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  durationMs: number;
  /** Net XP gained across all xpAward / xpSet events (can be negative). */
  xpGained: number;
  /** Number of levelUp events logged this session. */
  levelsGained: number;
  /** Net quantity acquired per item, alphabetical, zero-net items omitted. */
  itemsAcquired: SummaryItem[];
  /** Quantity sold per item (positive counts), alphabetical. Kept separate from
   * acquired so a sale never shows as a negative "acquired" line. */
  itemsSold: SummaryItem[];
  /** DM-awarded loot this session (awarded net of revoked), alphabetical. Kept
   * separate from itemsAcquired so campaign grants read as their own line. */
  loot: SummaryItem[];
  /** Spell slots spent this session, keyed by slot level → count (net of restores). */
  slotsSpent: Record<string, number>;
  /** Number of castSpell events (includes cantrips). */
  spellsCast: number;
  /** Highest combat round reached across all combatRoundAdvanced events. */
  combatRounds: number;
  /** Count of attackRoll events. */
  attackRolls: number;
  /** Count of damageRoll events. */
  damageRolls: number;
  /** ASIs + feats taken (level-ups excluded; counted separately). */
  featsOrAsis: SummaryAdvancement[];
}

/** One participant's session summary, plus their presence window (#245). */
export interface ParticipantSummary extends SessionSummary {
  characterId: string;
  characterName: string;
  joinedAt: string; // ISO 8601
  leftAt: string | null; // ISO 8601, null if still present at session end
  presentMs: number;
}

/** Campaign-level recap: aggregate of every participant's summary (#245). */
export interface CampaignRecap {
  startedAt: string | null; // ISO 8601 — earliest join, null when no participants
  endedAt: string | null; // ISO 8601 — latest leave/end, null when no participants
  durationMs: number;
  participantCount: number;
  xpGained: number;
  levelsGained: number;
  spellsCast: number;
  combatRounds: number;
  attackRolls: number;
  damageRolls: number;
  itemsAcquired: SummaryItem[];
  itemsSold: SummaryItem[];
  /** DM-awarded loot across participants (awarded net of revoked). */
  loot: SummaryItem[];
  /** Spell slots spent, keyed by slot level → count, summed across participants. */
  slotsSpent: Record<string, number>;
  /** ASIs + feats taken across all participants (level-ups counted separately). */
  featsOrAsis: SummaryAdvancement[];
  totalPresentMs: number;
}

/**
 * The minimal subset of a `CharacterEvent` the aggregation reads. Matches the
 * Prisma row (before/after/data are JSON) but is declared independently so the
 * helper has no Prisma dependency and stays trivially testable.
 */
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

/**
 * Reads a per-level counter map out of an event's `spellcasting` snapshot
 * (`before`/`after`). The snapshot shape is `{ spellcasting: { slotsUsed,
 * arcanumUsed, … } }` (see `spellcasting.ts`). Returns the numeric count for
 * `level` within the named counter, defaulting to 0 when absent.
 */
function spellcastingCount(snapshot: unknown, counter: string, level: number): number {
  const spellcasting = asRecord(asRecord(snapshot).spellcasting);
  const map = asRecord(spellcasting[counter]);
  const v = map[String(level)];
  return typeof v === "number" ? v : 0;
}

/**
 * Distinguishes a true spell-slot restore from a Warlock Mystic Arcanum charge
 * restore. Both are logged as `restoreSlot` with identical `data` ({ level }),
 * so the only reliable signal is which counter changed in the event's
 * before→after snapshot: a real slot restore decrements `slotsUsed`, while an
 * Arcanum restore decrements `arcanumUsed` (and leaves `slotsUsed` untouched).
 * See `spellcasting.ts`'s `restoreSlot` op, which prefers slots over Arcanum.
 */
function isArcanumRestore(event: SummaryEventInput, level: number): boolean {
  const slotsBefore = spellcastingCount(event.before, "slotsUsed", level);
  const slotsAfter = spellcastingCount(event.after, "slotsUsed", level);
  // A real spell-slot restore drops slotsUsed by one. If slotsUsed did not
  // change but arcanumUsed dropped, this restore returned an Arcanum charge.
  if (slotsAfter < slotsBefore) return false;
  const arcanumBefore = spellcastingCount(event.before, "arcanumUsed", level);
  const arcanumAfter = spellcastingCount(event.after, "arcanumUsed", level);
  return arcanumAfter < arcanumBefore;
}

/**
 * Cast-side counterpart to {@link isArcanumRestore}. A Warlock Mystic Arcanum
 * cast goes through the normal `castSpell` op and emits a non-null `slotLevel`,
 * but it spends an Arcanum charge (`arcanumUsed`), not a spell slot
 * (`slotsUsed`). Inspect the before→after snapshot: it's an Arcanum cast when
 * `arcanumUsed[level]` increased while `slotsUsed[level]` did NOT — so its slot
 * accounting must be skipped (the cast itself still counts toward `spellsCast`).
 */
function isArcanumCast(event: SummaryEventInput, level: number): boolean {
  const slotsBefore = spellcastingCount(event.before, "slotsUsed", level);
  const slotsAfter = spellcastingCount(event.after, "slotsUsed", level);
  // A real slot cast bumps slotsUsed by one; if it did, this is not Arcanum.
  if (slotsAfter > slotsBefore) return false;
  const arcanumBefore = spellcastingCount(event.before, "arcanumUsed", level);
  const arcanumAfter = spellcastingCount(event.after, "arcanumUsed", level);
  return arcanumAfter > arcanumBefore;
}

/** Mutable running totals folded across a session's events. */
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
  featsOrAsis: SummaryAdvancement[];
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

/** Add an event's `{ itemName, quantityDelta }` into a name→qty map. */
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

/** XP net (award/set) and level-up count. */
function applyProgressEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type === "levelUp") {
    acc.levelsGained += 1;
    return;
  }
  if (event.type !== "xpAward" && event.type !== "xpSet") return;
  // before/after carry the authoritative XP values for both award and set.
  const before = numField(event.before, "experiencePoints");
  const after = numField(event.after, "experiencePoints");
  if (before !== undefined && after !== undefined) acc.xpGained += after - before;
}

/** Combat round high-water mark and attack/damage roll counts. */
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

/** Casts (expendSlot/castSpell): counts the cast and tallies the slot spent. */
function applyCastEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type !== "expendSlot" && event.type !== "castSpell") return;
  if (event.type === "castSpell") acc.spellsCast += 1;
  // castSpell stores `slotLevel` (null for cantrips); expendSlot stores `level`.
  const data = asRecord(event.data);
  const level = numField(event.data, "level") ?? numField(event.data, "slotLevel");
  if (typeof level !== "number" || data.slotLevel === null) return;
  // A Mystic Arcanum cast has a non-null slotLevel but spends a charge, not a slot.
  if (isArcanumCast(event, level)) return;
  const key = String(level);
  acc.slotsSpent[key] = (acc.slotsSpent[key] ?? 0) + 1;
}

/** restoreSlot: nets a real slot restore against slots spent, floored at 0. */
function applyRestoreEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  if (event.type !== "restoreSlot") return;
  const level = numField(event.data, "level");
  if (typeof level !== "number") return;
  // Arcanum charge restores share this event type but aren't spell slots — skip.
  if (isArcanumRestore(event, level)) return;
  const key = String(level);
  // Floor at 0: a cross-session restore has no in-window expend to net against.
  const next = (acc.slotsSpent[key] ?? 0) - 1;
  if (next > 0) acc.slotsSpent[key] = next;
  else delete acc.slotsSpent[key];
}

/** ASIs and feats taken, surfaced with a readable label. */
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

// checkRoll / saveRoll / initiativeRoll are logged (roll category) but not yet
// surfaced in session-summary stats — intentional scope limit (#128).

/** Route one non-reverted event through every per-concern accumulator. */
function applyEvent(acc: SummaryAccumulator, event: SummaryEventInput): void {
  applyProgressEvent(acc, event);
  applyRollEvent(acc, event);
  applyItemEvent(acc, event);
  applyCastEvent(acc, event);
  applyRestoreEvent(acc, event);
  applyAdvancementEvent(acc, event);
}

/**
 * Folds a session's events into a typed summary. Reverted events are skipped so
 * the summary reflects the net result of the session (undone actions don't
 * count). Pure: no I/O, deterministic given its inputs.
 */
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

/** Merge a list of already-summed items into a name→qty map. */
function mergeItems(map: Map<string, number>, items: SummaryItem[]): void {
  for (const item of items) {
    map.set(item.name, (map.get(item.name) ?? 0) + item.qty);
  }
}

/** Net a name→qty map into a sorted SummaryItem[], dropping zero-net entries. */
function itemsFromMap(map: Map<string, number>): SummaryItem[] {
  return [...map.entries()]
    .filter(([, qty]) => qty !== 0)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Aggregates per-participant summaries into a campaign recap (#245). Sums XP,
 * spells, and rolls; takes the max combat rounds (how long combat lasted, not a
 * per-participant total); unions acquired items by name; reports the participant
 * count and total present-time. Pure: deterministic given inputs.
 */
export function computeCampaignRecap(participants: ParticipantSummary[]): CampaignRecap {
  const itemNet = new Map<string, number>();
  const soldNet = new Map<string, number>();
  const lootNet = new Map<string, number>();
  const slotsSpent: Record<string, number> = {};
  const featsOrAsis: SummaryAdvancement[] = [];
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
