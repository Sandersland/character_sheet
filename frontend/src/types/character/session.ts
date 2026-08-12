/**
 * Live-play session wire types: summaries, participants, recaps, and the session doorway.
 */

import type { CampaignRecap, ParticipantSummary } from "@character-sheet/shared-types";

import type { JournalEntry } from "./journal";

// The summary/recap/doorway shapes are the single cross-tier source of truth in
// shared-types (#1273); re-exported here so this module stays the frontend's
// session-types entry point (flowing through the @/types/character barrel).
// CampaignRecap and ParticipantSummary are also used locally by Session and
// SessionParticipant below.
export type { CampaignRecap, ParticipantSummary };
export type {
  CombatState,
  SessionDoorwayKind,
  SessionDoorwaySessionState,
  SessionDoorwayState,
  SessionSummary,
  SessionSummaryAdvancement,
  SessionSummaryItem,
  SpellEconomyState,
} from "@character-sheet/shared-types";

/** Session types — live-play lifecycle + end-of-session summary shapes. */
export type SessionStatus = "active" | "ended";

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

export interface Session {
  id: string;
  /** null = a solo (campaign-less) session owned by one character (#1082). */
  campaignId: string | null;
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
