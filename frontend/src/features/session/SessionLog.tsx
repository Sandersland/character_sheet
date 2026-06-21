/**
 * SessionLog — read-only event timeline for a single play session.
 *
 * Fetches all CharacterEvents whose sessionId matches the current session and
 * renders them newest-first. Refreshes automatically when `refreshKey` changes
 * (SessionPage passes the character object as the key, so every cast/damage/heal
 * that calls onUpdate triggers a refresh).
 *
 * Intentionally read-only — no undo here. Use ActivityModal on the character
 * sheet for the full undo-capable history.
 */

import { useEffect, useState } from "react";

import { fetchSession } from "@/api/client";
import Badge from "@/components/ui/Badge";
import type { CharacterEvent, CharacterEventCategory } from "@/types/character";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_TONE: Record<CharacterEventCategory, "vitality" | "gold" | "garnet" | "neutral" | "arcane"> = {
  inventory: "gold",
  hitPoints: "vitality",
  experience: "arcane",
  currency: "gold",
  spellcasting: "arcane",
  class: "neutral",
  resources: "gold",
  combat: "garnet",
};

const TYPE_LABEL: Partial<Record<string, string>> = {
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
  spendResource: "resource used",
  restoreResource: "resource restored",
  combatStarted: "combat",
  combatEnded: "combat end",
  combatRoundAdvanced: "round",
  revert: "undo",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface SessionLogProps {
  characterId: string;
  sessionId: string;
  /**
   * Changing this value re-fetches the event list. Pass the character object
   * (or a version counter) so casts and HP changes trigger a live refresh.
   */
  refreshKey: unknown;
}

export default function SessionLog({ characterId, sessionId, refreshKey }: SessionLogProps) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return <p className="text-sm text-parchment-500">Loading…</p>;
  }

  // Filter out reverted events — they're confusing without context.
  const activeEvents = events.filter((e) => !e.reverted && e.type !== "revert");

  if (activeEvents.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-parchment-500">
        No events yet — actions taken during this session will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {activeEvents.map((event) => {
        const tone = CATEGORY_TONE[event.category] ?? "neutral";
        const label = TYPE_LABEL[event.type] ?? event.type;
        return (
          <li
            key={event.id}
            className="flex flex-wrap items-center gap-2 py-1 text-sm"
          >
            <Badge tone={tone}>{label}</Badge>
            <span className="text-parchment-800">{event.summary}</span>
          </li>
        );
      })}
    </ul>
  );
}
