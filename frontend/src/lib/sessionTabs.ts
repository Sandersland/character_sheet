/**
 * Pure tab-list construction for the SessionPage reference area. Conditionally
 * includes Spells/Class/Loot per character + viewer flags, and resolves the
 * effective tab when the active one has been gated away.
 */

import type { Character, Session } from "@/types/character";

export interface LootRecipient {
  id: string;
  name: string;
}

/** Participant list for the DM loot picker — id + display name, "Unknown" fallback. */
export function sessionRecipients(session: Session): LootRecipient[] {
  return (session.participants ?? []).map((p) => ({
    id: p.characterId,
    name: p.character?.name ?? "Unknown",
  }));
}

export interface SessionTabSpec {
  id: string;
  label: string;
}

/** Total unspent spell slots across all levels — drives the Spells tab badge. */
export function remainingSpellSlots(character: Character): number {
  return (character.spellcasting?.slots ?? []).reduce(
    (sum, s) => sum + Math.max(0, s.total - s.used),
    0,
  );
}

export function buildSessionTabs(opts: {
  isCaster: boolean;
  hasClass: boolean;
  isOwner: boolean;
}): SessionTabSpec[] {
  return [
    { id: "inventory", label: "Inventory" },
    ...(opts.isCaster ? [{ id: "spells", label: "Spells" }] : []),
    ...(opts.hasClass ? [{ id: "class", label: "Class" }] : []),
    { id: "log", label: "Log" },
    ...(opts.isOwner ? [{ id: "loot", label: "Loot" }] : []),
  ];
}

export function resolveActiveTab(tabs: SessionTabSpec[], activeTab: string): string {
  return tabs.some((t) => t.id === activeTab) ? activeTab : "inventory";
}
