/**
 * Live-play session wire types: summaries, participants, recaps, and the session doorway.
 */

import type { JournalEntry } from "./journal";

/** Session types — live-play lifecycle + end-of-session summary shapes. */
export type SessionStatus = "active" | "ended";

/** One acquired-item line in a session summary. */
export interface SessionSummaryItem {
  name: string;
  qty: number;
}

/** A level-up, ASI, or feat surfaced in a session summary. */
export interface SessionSummaryAdvancement {
  type: string;
  label: string;
}

/**
 * Computed end-of-session summary (Session Phase 3). Mirrors the backend
 * `SessionSummary` shape produced by `computeSessionSummary`. Null while the
 * session is still active.
 */
export interface SessionSummary {
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  durationMs: number;
  xpGained: number;
  levelsGained: number;
  itemsAcquired: SessionSummaryItem[];
  /** Items sold this session (positive counts) — kept separate from acquired. */
  itemsSold: SessionSummaryItem[];
  /** DM-awarded loot this session (awarded net of revoked) — its own line (#382). */
  loot: SessionSummaryItem[];
  slotsSpent: Record<string, number>;
  spellsCast: number;
  combatRounds: number;
  attackRolls: number;
  damageRolls: number;
  featsOrAsis: SessionSummaryAdvancement[];
}

/** One character's session summary plus their presence window (#245). */
export interface ParticipantSummary extends SessionSummary {
  characterId: string;
  characterName: string;
  joinedAt: string; // ISO 8601
  leftAt: string | null; // ISO 8601, null if present at session end
  presentMs: number;
}

/** A character's membership in a shared session (#245). */
export interface SessionParticipant {
  id: string;
  sessionId: string;
  characterId: string;
  joinedAt: string; // ISO 8601
  leftAt?: string | null;
  summary?: ParticipantSummary | null;
  character?: {
    id: string;
    name: string;
    // Per-campaign play prefs (#462) — used to offer party-target healing only
    // to allies who opted in. One row per campaign this character set prefs in.
    campaignPreferences?: { campaignId: string; autoFriendlyHealing: boolean }[];
  };
}

/**
 * Campaign recap aggregate computed at session-end (#245). Mirrors the backend
 * `CampaignRecap`. Stored on `Session.summary`; null while the session is active.
 */
export interface CampaignRecap {
  startedAt: string | null; // ISO 8601
  endedAt: string | null; // ISO 8601
  durationMs: number;
  participantCount: number;
  xpGained: number;
  levelsGained: number;
  spellsCast: number;
  combatRounds: number;
  attackRolls: number;
  damageRolls: number;
  itemsAcquired: SessionSummaryItem[];
  /** Items sold across the party this session (positive counts). */
  itemsSold: SessionSummaryItem[];
  /** DM-awarded loot across the party this session (awarded net of revoked) (#382). */
  loot: SessionSummaryItem[];
  /** Spell slots spent, keyed by slot level → count, summed across participants. */
  slotsSpent: Record<string, number>;
  /** ASIs + feats taken across all participants (level-ups counted separately). */
  featsOrAsis: SessionSummaryAdvancement[];
  totalPresentMs: number;
}

export interface Session {
  id: string;
  campaignId: string;
  status: SessionStatus;
  startedAt: string; // ISO 8601
  endedAt?: string;
  title?: string;
  /** Campaign recap aggregate (#245); null while the session is still active. */
  summary?: CampaignRecap | null;
  /** Party members in this session, with their presence + per-participant summary. */
  participants?: SessionParticipant[];
  /**
   * Journal entries written during this session (linked by
   * JournalEntry.sessionId). Present on the end-session response and the
   * single-session GET; surfaced read-only in the recap.
   */
  journalEntries?: JournalEntry[];
}

/**
 * A session row from the journal "chronicle" read model (#863):
 * `GET /api/campaigns/:id/sessions?characterId=<id>`. Extends the session with a
 * DERIVED 1-based `sessionNumber` (by startedAt ascending — never a persisted
 * column), the `arcId` it's filed under (nullable), and this character's
 * `noteCount` for the session. `title` is nullable (fallback "Session N").
 */
export interface ChronicleSession {
  id: string;
  campaignId: string;
  status: SessionStatus;
  startedAt: string; // ISO 8601
  endedAt?: string | null;
  title?: string | null;
  arcId?: string | null;
  /** DERIVED 1-based chapter number (startedAt ascending within the campaign). */
  sessionNumber: number;
  /** This character's journal entries in the session (0 when none). */
  noteCount: number;
  participants?: SessionParticipant[];
}

/**
 * The sheet's session-doorway read model (#942):
 * `GET /api/characters/:id/sessions/doorway`. One state-aware fact set the
 * SessionDoorway bar renders. This union is the FROZEN contract — scheduling
 * (#951) extends server behavior only (emits the `scheduled*`/`earlyJoin` kinds
 * + `scheduled` sessions, flips `canStart` owner-only). The client already
 * handles all five kinds; the server never returns the scheduled ones yet.
 */
export type SessionDoorwayKind =
  | "none"
  | "liveJoined"
  | "liveNotJoined"
  | "scheduledUpcoming"
  | "earlyJoin";

export interface SessionDoorwaySessionState {
  id: string;
  status: "active" | "scheduled"; // "scheduled" impossible until #951
  startedAt: string | null; // ISO 8601
  scheduledAt: string | null; // ISO 8601; null until #951
  title: string | null;
  /** This character is a present participant (joined, not left). */
  joined: boolean;
  /** DERIVED from the latest combatRoundAdvanced event — never persisted. */
  round: number | null;
}

export interface SessionDoorwayState {
  /** null → solo character → the doorway renders nothing. */
  campaignId: string | null;
  role: "OWNER" | "PLAYER";
  /** THIS ISSUE: true for every campaign member. #951 flips it owner-only. */
  canStart: boolean;
  kind: SessionDoorwayKind;
  session: SessionDoorwaySessionState | null;
}
