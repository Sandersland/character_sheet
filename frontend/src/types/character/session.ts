import type { CampaignRecap, ParticipantSummary } from "@character-sheet/shared-types";

import type { JournalEntry } from "./journal";

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

export type SessionStatus = "active" | "ended";

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
    // One row per campaign this character set prefs in; drives party-target healing opt-in.
    campaignPreferences?: { campaignId: string; autoFriendlyHealing: boolean }[];
  };
}

export interface Session {
  id: string;
  /** null = a solo (campaign-less) session owned by one character. */
  campaignId: string | null;
  status: SessionStatus;
  startedAt: string; // ISO 8601
  endedAt?: string;
  title?: string;
  /** Null while the session is still active. */
  summary?: CampaignRecap | null;
  /** Party members in this session, with their presence + per-participant summary. */
  participants?: SessionParticipant[];
  /** Present on the end-session response and the single-session GET only. */
  journalEntries?: JournalEntry[];
}

/** `GET /api/campaigns/:id/sessions?characterId=<id>`; `title` is nullable with a "Session N" fallback. */
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
