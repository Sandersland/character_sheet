/** One acquired-item line: catalog/custom name + net quantity gained. */
export interface SessionSummaryItem {
  name: string;
  qty: number;
}

/** A level-up, ASI, or feat taken during the session — surfaced as a headline. */
export interface SessionSummaryAdvancement {
  /** "levelUp" | "abilityScoreImprovement" | "featTaken" */
  type: string;
  /** Human-readable description, copied from the event's stored summary. */
  label: string;
}

/** Computed end-of-session summary; null while the session is still active. */
export interface SessionSummary {
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  durationMs: number;
  /** Net XP gained across all xpAward / xpSet events (can be negative). */
  xpGained: number;
  /** Number of levelUp events logged this session. */
  levelsGained: number;
  /** Net quantity acquired per item, alphabetical, zero-net items omitted. */
  itemsAcquired: SessionSummaryItem[];
  /** Quantity sold per item (positive counts), alphabetical. Kept separate from
   * acquired so a sale never shows as a negative "acquired" line. */
  itemsSold: SessionSummaryItem[];
  /** DM-awarded loot this session (awarded net of revoked), alphabetical. Kept
   * separate from itemsAcquired so campaign grants read as their own line. */
  loot: SessionSummaryItem[];
  /** Spell slots spent this session, keyed by slot level → count (net of restores). */
  slotsSpent: Record<string, number>;
  /** Number of castSpell events (includes cantrips). */
  spellsCast: number;
  /** Highest combat round reached across all combatRoundAdvanced events. */
  combatRounds: number;
  attackRolls: number;
  damageRolls: number;
  /** ASIs + feats taken (level-ups excluded; counted separately). */
  featsOrAsis: SessionSummaryAdvancement[];
}

/** One participant's session summary, plus their presence window. */
export interface ParticipantSummary extends SessionSummary {
  characterId: string;
  characterName: string;
  joinedAt: string; // ISO 8601
  leftAt: string | null; // ISO 8601, null if still present at session end
  presentMs: number;
}

/** Campaign-level recap: aggregate of every participant's summary. */
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
  itemsAcquired: SessionSummaryItem[];
  itemsSold: SessionSummaryItem[];
  /** DM-awarded loot across participants (awarded net of revoked). */
  loot: SessionSummaryItem[];
  /** Spell slots spent, keyed by slot level → count, summed across participants. */
  slotsSpent: Record<string, number>;
  /** ASIs + feats taken across all participants (level-ups counted separately). */
  featsOrAsis: SessionSummaryAdvancement[];
  totalPresentMs: number;
}

// Read model behind GET /api/characters/:id/sessions/doorway.
// The kind union is a frozen contract — scheduling only extends server behavior; the server doesn't return the scheduled kinds yet, but the client is already written against all five.

/** Spelled out, not imported from Prisma's CampaignRole; a session-wire-contract test latches the two together. */
export type SessionDoorwayRole = "OWNER" | "PLAYER";

export type SessionDoorwayKind =
  | "none"
  | "liveJoined"
  | "liveNotJoined"
  | "scheduledUpcoming"
  | "earlyJoin";

export interface SessionDoorwaySessionState {
  id: string;
  status: "active" | "scheduled";
  startedAt: string | null; // ISO 8601
  /** null until scheduled sittings exist. */
  scheduledAt: string | null; // ISO 8601
  title: string | null;
  /** This character is a present participant (joined, !leftAt). */
  joined: boolean;
  /** Session.round while combat is active, else null — see CombatState. */
  round: number | null;
}

export interface SessionDoorwayState {
  /** null → character-scoped solo session; the client's signal for solo play. */
  campaignId: string | null;
  role: SessionDoorwayRole;
  /** True for every campaign member and every solo character today — #951 flips it owner-only. */
  canStart: boolean;
  kind: SessionDoorwayKind;
  session: SessionDoorwaySessionState | null;
}

/** Resolved server-side from the cast record and edition; the client receives these booleans, never the raw predicate. */
export interface SpellEconomyState {
  /** SRD 5.1 only: a leveled Action spell blocks the bonus action entirely (a bonus cantrip is not the exception). */
  bonusActionBlockedByActionSpell: boolean;
  /** SRD 5.2 only: a leveled Action spell leaves bonus cantrips castable (one spell slot per turn) — leveled bonus spells drop, cantrips stay. */
  bonusActionLimitedToCantrips: boolean;
  /** Both editions, after the triggering bonus-action spell (SRD 5.1: any bonus spell; SRD 5.2: a leveled one). */
  actionLimitedToCantrips: boolean;
}

/** Server-authoritative; the combat/start|end|round mutation responses and the poll GET return this same shape, and clients dispatch it verbatim into their local turn tracker. */
export interface CombatState {
  /** `round`/`combatActive` are a deliberate derive-don't-persist exception — shared mutable session state no client can compute alone. */
  round: number;
  combatActive: boolean;
  updatedAt: string; // ISO 8601 — the max of the session's and this participant's own updatedAt, so the client's monotonic guard also advances on a cast.
  /** A second derive-don't-persist exception, carried on the same payload so it reaches the client through one sync seam. */
  spellEconomy: SpellEconomyState;
}
