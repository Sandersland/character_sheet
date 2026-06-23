/**
 * Pure aggregation of a play session's event log into an end-of-session
 * summary (Session Phase 3). Lives here — separate from the DB lifecycle in
 * `sessions.ts` — so it is unit-testable without Postgres.
 *
 * Derive, don't persist: the summary is computed entirely from the session's
 * existing `CharacterEvent` rows. No new per-event bookkeeping is introduced.
 */

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Input shape ──────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numField(value: unknown, key: string): number | undefined {
  const v = asRecord(value)[key];
  return typeof v === "number" ? v : undefined;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Folds a session's events into a typed summary. Reverted events are skipped so
 * the summary reflects the net result of the session (undone actions don't
 * count). Pure: no I/O, deterministic given its inputs.
 */
export function computeSessionSummary(
  events: SummaryEventInput[],
  window: SummaryWindow,
): SessionSummary {
  let xpGained = 0;
  let levelsGained = 0;
  let spellsCast = 0;
  let combatRounds = 0;
  let attackRolls = 0;
  let damageRolls = 0;

  const itemNet = new Map<string, number>();
  const slotsSpent: Record<string, number> = {};
  const featsOrAsis: SummaryAdvancement[] = [];

  for (const event of events) {
    if (event.reverted) continue;

    switch (event.type) {
      case "xpAward":
      case "xpSet": {
        // before/after carry the authoritative XP values for both award and
        // set, so the net delta is robust regardless of op kind.
        const before = numField(event.before, "experiencePoints");
        const after = numField(event.after, "experiencePoints");
        if (before !== undefined && after !== undefined) {
          xpGained += after - before;
        }
        break;
      }

      case "levelUp":
        levelsGained += 1;
        break;

      case "acquired":
      case "bought":
      case "consumed":
      case "sold":
      case "removed": {
        const data = asRecord(event.data);
        const name = typeof data.itemName === "string" ? data.itemName : null;
        const delta = numField(event.data, "quantityDelta");
        if (name && delta !== undefined) {
          itemNet.set(name, (itemNet.get(name) ?? 0) + delta);
        }
        break;
      }

      case "expendSlot":
      case "castSpell": {
        if (event.type === "castSpell") spellsCast += 1;
        // castSpell stores `slotLevel` (null for cantrips); expendSlot stores `level`.
        const data = asRecord(event.data);
        const level = numField(event.data, "level") ?? numField(event.data, "slotLevel");
        if (typeof level === "number" && data.slotLevel !== null) {
          const key = String(level);
          slotsSpent[key] = (slotsSpent[key] ?? 0) + 1;
        }
        break;
      }

      case "restoreSlot": {
        const level = numField(event.data, "level");
        if (typeof level === "number") {
          const key = String(level);
          const next = (slotsSpent[key] ?? 0) - 1;
          if (next > 0) slotsSpent[key] = next;
          else delete slotsSpent[key];
        }
        break;
      }

      case "combatRoundAdvanced": {
        const round = numField(event.data, "round");
        if (typeof round === "number") combatRounds = Math.max(combatRounds, round);
        break;
      }

      case "attackRoll":
        attackRolls += 1;
        break;

      case "damageRoll":
        damageRolls += 1;
        break;

      case "abilityScoreImprovement":
      case "featTaken": {
        const data = asRecord(event.data);
        const label =
          typeof data.featName === "string"
            ? `Feat: ${data.featName}`
            : event.type === "featTaken"
              ? "Feat taken"
              : "Ability Score Improvement";
        featsOrAsis.push({ type: event.type, label });
        break;
      }

      default:
        break;
    }
  }

  const itemsAcquired: SummaryItem[] = [...itemNet.entries()]
    .filter(([, qty]) => qty !== 0)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    startedAt: window.startedAt.toISOString(),
    endedAt: window.endedAt.toISOString(),
    durationMs: Math.max(0, window.endedAt.getTime() - window.startedAt.getTime()),
    xpGained,
    levelsGained,
    itemsAcquired,
    slotsSpent,
    spellsCast,
    combatRounds,
    attackRolls,
    damageRolls,
    featsOrAsis,
  };
}
