// Live-play session wire types (#1273) — de-duplicates the declarations that were
// hand-mirrored between the backend's computeSessionSummary / getSessionDoorway
// modules and frontend/src/types/character/session.ts.

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
   * separate from itemsAcquired so campaign grants read as their own line (#382). */
  loot: SessionSummaryItem[];
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
  featsOrAsis: SessionSummaryAdvancement[];
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
  itemsAcquired: SessionSummaryItem[];
  itemsSold: SessionSummaryItem[];
  /** DM-awarded loot across participants (awarded net of revoked) (#382). */
  loot: SessionSummaryItem[];
  /** Spell slots spent, keyed by slot level → count, summed across participants. */
  slotsSpent: Record<string, number>;
  /** ASIs + feats taken across all participants (level-ups counted separately). */
  featsOrAsis: SessionSummaryAdvancement[];
  totalPresentMs: number;
}

// The doorway is the sheet's one always-visible, state-aware session affordance
// (#942): the read model behind GET /api/characters/:id/sessions/doorway. The
// kind union is the FROZEN contract — scheduling (#951) extends server behavior
// only (starts emitting the `scheduled*`/`earlyJoin` kinds + `scheduled`
// sessions, flips `canStart` owner-only). The server never returns the scheduled
// kinds yet, but the shape already carries their fields so the client is written
// against all five kinds today.

/** Spelled out rather than imported from Prisma's CampaignRole — this package has
 * no Prisma dependency; the session-wire-contract test latches the two together. */
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
  /** null until #951 (no scheduled sittings exist yet). */
  scheduledAt: string | null; // ISO 8601
  title: string | null;
  /** This character is a present participant (joined, !leftAt). */
  joined: boolean;
  /** Session.round while combat is active, else null (#1030 — persisted, see CombatState). */
  round: number | null;
}

export interface SessionDoorwayState {
  /** null → character-scoped solo session; the client's signal for solo play (#1080). */
  campaignId: string | null;
  role: SessionDoorwayRole;
  /** THIS ISSUE: true for every campaign member and every solo character. #951 flips it owner-only. */
  canStart: boolean;
  kind: SessionDoorwayKind;
  session: SessionDoorwaySessionState | null;
}

/**
 * The 5e bonus-action spellcasting interlock, resolved server-side (#1439) from
 * the acting participant's per-turn cast record — the client receives these two
 * booleans, never the raw cast kinds plus the predicate. `bonusActionBlocked-
 * ByActionSpell`: a leveled spell was cast with the Action this turn, so no
 * bonus-action spell may be cast. `actionLimitedToCantrips`: a leveled spell was
 * cast as a bonus action this turn, so the Action may cast only cantrips.
 */
export interface SpellEconomyState {
  bonusActionBlockedByActionSpell: boolean;
  actionLimitedToCantrips: boolean;
}

/**
 * Server-authoritative combat state for a session (#1030): `Session.round`/
 * `combatActive` are a deliberate derive-don't-persist exception (shared
 * mutable session state no client can compute alone). This is the shape both
 * the combat/start|end|round mutation responses and the cheap poll GET
 * (`.../sessions/:sessionId/combat`) return — clients dispatch it verbatim
 * into their local turn tracker; they never compute round themselves.
 *
 * `spellEconomy` (#1439) is the acting character's resolved bonus-action
 * spellcasting interlock — the SECOND per-turn derive-don't-persist exception,
 * carried on the same payload the round rides so it reaches the client through
 * one sync seam. `updatedAt` is the max of the session's and this participant's
 * own updatedAt, so the client's monotonic guard advances on a cast (a
 * participant-only change) as well as a round change.
 */
export interface CombatState {
  round: number;
  combatActive: boolean;
  updatedAt: string; // ISO 8601
  spellEconomy: SpellEconomyState;
}
