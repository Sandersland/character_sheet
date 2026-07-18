/**
 * SessionLog — read-only event timeline for a single play session.
 *
 * Fetches all CharacterEvents whose sessionId matches the current session and
 * renders them newest-first. Re-fetches on every mount; a caller that keeps the
 * log mounted across live mutations can pass the optional `refreshKey` prop (the
 * character object or a version counter) to trigger additional re-fetches.
 *
 * Intentionally read-only — no undo here. Use ActivityModal on the character
 * sheet for the full undo-capable history.
 */

import { Fragment, useEffect, useState } from "react";

import { fetchSession } from "@/api/client";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { formatRollBreakdown } from "@/lib/dice";
import { categoryTone } from "@/lib/events";
import type { CharacterEvent } from "@/types/character";

// Category → badge tone resolves through the shared categoryTone lookup so new
// event categories stay covered. The session log keeps its own terser TYPE_LABEL
// map below (e.g. "combat" vs the activity log's "Combat started").
//
// Coverage is a forcing function, not a suggestion (#983): SessionLog.test.tsx
// iterates every CharacterEventType and asserts an explicit entry here, so a
// newly-added event type is a failing test rather than a silently humanized key.
// The `humanizeEventType` fallback (below) is the runtime safety net for a
// backend-only type that outruns the frontend union — never a raw camelCase leak.
export const TYPE_LABEL: Partial<Record<string, string>> = {
  acquired: "acquired",
  bought: "bought",
  sold: "sold",
  consumed: "consumed",
  removed: "removed",
  equipped: "equipped",
  unequipped: "unequipped",
  damage: "damage",
  heal: "healed",
  setTemp: "temp HP",
  shortRest: "short rest",
  longRest: "long rest",
  levelUp: "level up",
  levelDown: "level down",
  deathSave: "death save",
  stabilize: "stabilize",
  xpAward: "XP",
  xpSet: "XP set",
  currencyAdjust: "currency",
  castSpell: "cast",
  expendSlot: "slot used",
  restoreSlot: "slot restored",
  learnSpell: "learned",
  forgetSpell: "forgotten",
  prepareSpell: "prepared",
  unprepareSpell: "unprepared",
  concentrationDropped: "concentration",
  subclassChosen: "subclass",
  subclassRemoved: "subclass removed",
  fightingStyleChosen: "fighting style",
  fightingStyleRemoved: "style removed",
  spendResource: "resource used",
  restoreResource: "resource restored",
  learnManeuver: "maneuver learned",
  forgetManeuver: "maneuver forgotten",
  maneuversReconciled: "maneuvers",
  learnToolProficiency: "tool learned",
  forgetToolProficiency: "tool forgotten",
  toolProficienciesReconciled: "tools",
  abilityScoreImprovement: "ASI",
  featTaken: "feat",
  advancementRemoved: "advancement removed",
  advancementsReconciled: "advancements",
  sessionStarted: "session",
  sessionEnded: "session end",
  combatStarted: "combat",
  combatEnded: "combat end",
  combatRoundAdvanced: "round",
  conditionApplied: "condition",
  conditionRemoved: "condition removed",
  exhaustionSet: "exhaustion",
  attackRoll: "attack",
  damageRoll: "damage",
  checkRoll: "check",
  saveRoll: "save",
  initiativeRoll: "initiative",
  awarded: "loot",
  revoked: "revoked",
  revert: "undo",
};

// Degrade an unmapped event type to spaced lower-case words (e.g. `someNewType`
// → "some new type") so a future type never renders its raw camelCase key.
function humanizeEventType(type: string): string {
  return type.replace(/([A-Z])/g, " $1").toLowerCase().trim();
}

/** Resolve an event type to its terse session-log label, humanizing the tail. */
function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? humanizeEventType(type);
}

// DM award/revoke loot events (#382) carry the recipient in data.recipientName.
// The session feed spans the whole party, so append "→ Recipient" to name who
// the grant landed on (the stored summary alone doesn't say).
function lootSummary(event: CharacterEvent): string | null {
  if (event.type !== "awarded" && event.type !== "revoked") return null;
  const recipient = (event.data as { recipientName?: string } | undefined)?.recipientName;
  return recipient ? `${event.summary} → ${recipient}` : event.summary;
}

// Roll events logged by the new client carry their kept die faces in `data.faces`.
// When present, rebuild the summary with the raw breakdown injected after the dice
// token (e.g. "Longsword: 17 (1d20 (12) + 5)") so the log mirrors the roll toast.
// Old events lack faces → return null and fall back to the stored summary.
type RollEventData = {
  source?: string;
  total?: number;
  specLabel?: string | null;
  damageType?: string | null;
  faces?: number[] | null;
};

function rollBreakdownSummary(event: CharacterEvent): string | null {
  if (event.type !== "attackRoll" && event.type !== "damageRoll") return null;
  const data = event.data as RollEventData | undefined;
  if (!data?.faces || data.faces.length === 0 || typeof data.specLabel !== "string") {
    return null;
  }
  const breakdown = formatRollBreakdown(data.specLabel, data.faces);
  const damagePart = data.damageType ? ` ${data.damageType}` : "";
  return `${data.source}: ${data.total}${damagePart} (${breakdown})`;
}

interface SessionLogProps {
  characterId: string;
  sessionId: string;
  /**
   * Changing this value re-fetches the event list. Both live-Combat call sites
   * (the desktop right rail and the mobile Turn/Log panel, #964) stay mounted, so
   * they pass the shared `logRefresh` counter to pick up new events. Optional —
   * a caller that fully unmounts/remounts per view refetches on mount anyway.
   */
  refreshKey?: unknown;
}

// Build a round-per-event map by walking events oldest-first (list arrives
// newest-first). Combat markers (combatStarted/combatRoundAdvanced/combatEnded)
// anchor the round counter; every other event inside a combat block is tagged
// with the current round so its R{n} chip renders.
function buildRoundMap(activeEvents: CharacterEvent[]): Map<string, number> {
  const roundById = new Map<string, number>();
  let currentRound: number | null = null;
  for (const e of [...activeEvents].reverse()) {
    if (e.type === "combatStarted") {
      currentRound = 1;
    } else if (e.type === "combatRoundAdvanced") {
      const dataRound = (e.data as { round?: number } | undefined)?.round;
      currentRound = dataRound ?? (currentRound !== null ? currentRound + 1 : 2);
    } else if (e.type === "combatEnded") {
      currentRound = null;
    } else if (currentRound !== null) {
      roundById.set(e.id, currentRound);
    }
  }
  return roundById;
}

// A row in the rendered feed: either a standalone event, or a run of ≥2
// consecutive same-type roll events collapsed behind a disclosure (#983). Roll
// spam (a party's worth of initiative rolls) otherwise buries everything else.
type FeedRow =
  | { kind: "event"; event: CharacterEvent }
  | { kind: "rollRun"; head: CharacterEvent; rest: CharacterEvent[] };

// Walk the newest-first display list, collapsing each maximal run of adjacent
// roll events that share a type (≥2 long) into one rollRun. Non-roll events and
// a differing type break the run, so interleaved events stay in place.
function groupRollRuns(events: CharacterEvent[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (let i = 0; i < events.length; ) {
    const head = events[i];
    if (head.category === "roll") {
      let j = i + 1;
      while (j < events.length && events[j].category === "roll" && events[j].type === head.type) {
        j += 1;
      }
      if (j - i >= 2) {
        rows.push({ kind: "rollRun", head, rest: events.slice(i + 1, j) });
        i = j;
        continue;
      }
    }
    rows.push({ kind: "event", event: head });
    i += 1;
  }
  return rows;
}

export default function SessionLog({ characterId, sessionId, refreshKey }: SessionLogProps) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const showSpinner = useDelayedFlag(!events && !error);

  const toggleRun = (id: string) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    setEvents(null);
    setError(null);
    fetchSession(characterId, sessionId)
      .then((data) => setEvents(data.events as CharacterEvent[]))
      .catch(() => setError("Couldn't load session log — try again."));
  }, [characterId, sessionId, refreshKey]);

  if (error) {
    return <p className="text-xs font-semibold text-garnet-700">{error}</p>;
  }

  if (!events) {
    return showSpinner ? <Spinner /> : null;
  }

  // Filter out reverted events — they're confusing without context.
  const activeEvents = events.filter((e) => !e.reverted && e.type !== "revert");

  if (activeEvents.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-parchment-600">
        No events yet — actions taken during this session will appear here.
      </p>
    );
  }

  const roundById = buildRoundMap(activeEvents);

  // combatRoundAdvanced markers drive the R{n} chip walk above but are too noisy to
  // show as their own rows — every other entry already carries its round chip.
  const displayEvents = activeEvents.filter((e) => e.type !== "combatRoundAdvanced");
  const rows = groupRollRuns(displayEvents);

  const renderRow = (event: CharacterEvent) => {
    const round = roundById.get(event.id);
    return (
      <li key={event.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
        {round !== undefined && <Badge tone="neutral">R{round}</Badge>}
        <Badge tone={categoryTone(event.category)}>{typeLabel(event.type)}</Badge>
        <span className="text-parchment-800">
          {rollBreakdownSummary(event) ?? lootSummary(event) ?? event.summary}
        </span>
      </li>
    );
  };

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        if (row.kind === "event") return renderRow(row.event);

        const { head, rest } = row;
        const expanded = expandedRuns.has(head.id);
        const label = typeLabel(head.type);
        return (
          <Fragment key={head.id}>
            {renderRow(head)}
            <li>
              <button
                type="button"
                onClick={() => toggleRun(head.id)}
                aria-expanded={expanded}
                className="flex items-center gap-1 text-xs font-medium text-parchment-600 hover:text-parchment-800"
              >
                <span aria-hidden>{expanded ? "▾" : "▸"}</span>
                {expanded
                  ? `Hide ${rest.length} earlier ${label} rolls`
                  : `${rest.length} earlier ${label} rolls`}
              </button>
            </li>
            {expanded && rest.map((event) => renderRow(event))}
          </Fragment>
        );
      })}
    </ul>
  );
}
