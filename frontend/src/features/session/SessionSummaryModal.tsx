import { useEffect, useState } from "react";

import { applyExperienceOperations, fetchSession } from "@/api/client";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatJournalDate } from "@/lib/formatJournalDate";
import type {
  CampaignRecap,
  Character,
  JournalEntry,
  ParticipantSummary,
  Session,
  SessionParticipant,
} from "@/types/character";

interface SessionSummaryModalProps {
  /** Owning character — needed to retroactively award XP to this session. */
  characterId: string;
  /** The ended session whose recap + participants are displayed. */
  session: Session;
  onClose: () => void;
  /**
   * Called with the updated character after a retroactive XP award lands, so the
   * parent sheet's XP can refresh live (otherwise it only updates on reload).
   */
  onCharacterUpdate?: (character: Character) => void;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatTimeRange(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleDateString(undefined, dateFmt)}, ${start.toLocaleTimeString(
    undefined,
    timeFmt,
  )} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-parchment-200 bg-parchment-50 px-3 py-3 text-center">
      <span className={`font-display text-2xl font-semibold ${tone}`}>{value}</span>
      <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {label}
      </span>
    </div>
  );
}

// ── Participant card ──────────────────────────────────────────────────────────

/** One party member's contribution + time present in the shared session. */
function ParticipantCard({ summary }: { summary: ParticipantSummary }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-parchment-200 bg-parchment-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-sm font-semibold text-parchment-900">
          {summary.characterName}
        </span>
        <Badge tone="neutral">{formatDuration(summary.presentMs)} present</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="XP" value={summary.xpGained.toLocaleString()} tone="text-arcane-700" />
        <StatTile label="Spells" value={summary.spellsCast} tone="text-arcane-700" />
        <StatTile label="Attacks" value={summary.attackRolls} tone="text-garnet-700" />
        <StatTile label="Damage" value={summary.damageRolls} tone="text-garnet-700" />
      </div>
      {summary.itemsAcquired.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-parchment-900">
          {summary.itemsAcquired.map((item) => (
            <li key={item.name} className="flex items-center gap-1.5">
              <Badge tone="gold">×{item.qty}</Badge>
              <span>{item.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Journal list ────────────────────────────────────────────────────────────

/** Read-only, expandable list of the session's journal entries. */
function JournalEntryRow({ entry }: { entry: JournalEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="font-display text-sm font-semibold text-parchment-900">
          {entry.title}
        </span>
        <span className="whitespace-nowrap text-xs text-parchment-600">
          {formatJournalDate(entry.date)}
        </span>
      </button>
      {open && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-parchment-700">{entry.body}</p>
      )}
    </li>
  );
}

// ── Retroactive XP form ─────────────────────────────────────────────────────

/**
 * "Add XP to this session" — awards XP tagged to this (already-ended) session
 * via the explicit-sessionId override, then refreshes the session so the
 * participant's stats + the recap update in place.
 */
function AddXpForm({
  characterId,
  sessionId,
  onAwarded,
  onCharacterUpdate,
}: {
  characterId: string;
  sessionId: string;
  onAwarded: (session: Session) => void;
  onCharacterUpdate?: (character: Character) => void;
}) {
  const [open, setOpen] = useState(false);
  const [xp, setXp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(xp);
  const valid = xp.trim() !== "" && Number.isInteger(parsed) && parsed > 0;

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await applyExperienceOperations(
        characterId,
        [{ type: "award", amount: parsed }],
        sessionId,
      );
      onCharacterUpdate?.(updated);
      // Re-fetch the session to pick up its freshly recomputed summaries.
      const refreshed = await fetchSession(characterId, sessionId);
      onAwarded(refreshed);
      setXp("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to award XP.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-semibold text-garnet-700 hover:underline"
      >
        + Add XP to this session
      </button>
    );
  }

  const inputCls =
    "w-28 rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="retro-xp" className="block text-xs font-semibold text-parchment-700">
            Award XP
          </label>
          <input
            id="retro-xp"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className={`${inputCls} mt-1`}
            value={xp}
            onChange={(e) => setXp(e.target.value)}
            placeholder="0"
            disabled={busy}
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid || busy}
          className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
        >
          {busy ? "Awarding…" : "Award"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-parchment-600">
        This session is closed, so the award is permanent — it can't be undone.
      </p>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

// A participant carrying a computed summary (post-end participants always do).
type SummarizedParticipant = SessionParticipant & { summary: ParticipantSummary };

function withSummary(participants: SessionParticipant[]): SummarizedParticipant[] {
  return participants.filter(
    (p): p is SummarizedParticipant => Boolean(p.summary),
  );
}

/**
 * Read-only end-of-session recap (#245). Shows the campaign recap aggregate up
 * top, then each participant's contribution + time present, the session's
 * journals, and a retroactive "add XP" affordance.
 */
export default function SessionSummaryModal({
  characterId,
  session,
  onClose,
  onCharacterUpdate,
}: SessionSummaryModalProps) {
  const [recap, setRecap] = useState<CampaignRecap | null | undefined>(session.summary);
  const [participants, setParticipants] = useState<SummarizedParticipant[]>(
    withSummary(session.participants ?? []),
  );
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(
    session.journalEntries ?? [],
  );

  // When opened from a list that doesn't carry full detail (SessionsModal seeds
  // from the sessions list), lazily fetch the session so journals + participant
  // summaries surface. The end-session path already supplies them.
  useEffect(() => {
    if (session.journalEntries !== undefined) return;
    let cancelled = false;
    fetchSession(characterId, session.id)
      .then((full) => {
        if (cancelled) return;
        setJournalEntries(full.journalEntries ?? []);
        setParticipants(withSummary(full.participants ?? []));
        setRecap(full.summary);
      })
      .catch(() => {
        /* leave the seeded data in place if detail fetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, session.id, session.journalEntries]);

  function applyRefreshed(full: Session) {
    setRecap(full.summary);
    setParticipants(withSummary(full.participants ?? []));
    if (full.journalEntries !== undefined) setJournalEntries(full.journalEntries);
  }

  const hasWindow = Boolean(recap?.startedAt && recap?.endedAt);

  return (
    <Modal title={session.title ? `Session Recap — ${session.title}` : "Session Recap"} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {!recap ? (
          <p className="py-6 text-center text-sm text-parchment-600">
            No summary is available for this session.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* ── Time window + party size ────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-parchment-600">
              {hasWindow && (
                <span>{formatTimeRange(recap.startedAt!, recap.endedAt!)}</span>
              )}
              <span className="flex items-center gap-2">
                <Badge tone="neutral">{formatDuration(recap.durationMs)}</Badge>
                <Badge tone="arcane">
                  {recap.participantCount} player{recap.participantCount === 1 ? "" : "s"}
                </Badge>
              </span>
            </div>

            {/* ── Campaign recap tiles ────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="XP gained" value={recap.xpGained.toLocaleString()} tone="text-arcane-700" />
              <StatTile label="Spells cast" value={recap.spellsCast} tone="text-arcane-700" />
              <StatTile label="Attack rolls" value={recap.attackRolls} tone="text-garnet-700" />
              <StatTile label="Damage rolls" value={recap.damageRolls} tone="text-garnet-700" />
            </div>

            {/* ── Secondary recap facts ───────────────────────────────────── */}
            <ul className="flex flex-col gap-2 text-sm text-parchment-900">
              {recap.levelsGained > 0 && (
                <li className="flex items-center gap-2">
                  <Badge tone="vitality">level up</Badge>
                  <span>
                    Gained {recap.levelsGained} level{recap.levelsGained === 1 ? "" : "s"}
                  </span>
                </li>
              )}
              {recap.combatRounds > 0 && (
                <li className="flex items-center gap-2">
                  <Badge tone="garnet">combat</Badge>
                  <span>
                    {recap.combatRounds} combat round{recap.combatRounds === 1 ? "" : "s"}
                  </span>
                </li>
              )}
            </ul>

            {/* ── Items acquired (party-wide) ─────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
                Items acquired
              </p>
              {recap.itemsAcquired.length === 0 ? (
                <p className="text-sm text-parchment-600">No items gained this session.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {recap.itemsAcquired.map((item) => (
                    <li key={item.name} className="flex items-center gap-2 text-sm text-parchment-900">
                      <Badge tone="gold">×{item.qty}</Badge>
                      <span>{item.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Participants ────────────────────────────────────────────── */}
            {participants.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
                  Participants
                </p>
                <div className="flex flex-col gap-2">
                  {participants.map((p) => (
                    <ParticipantCard key={p.characterId} summary={p.summary} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Session journals ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Journal
          </p>
          {journalEntries.length === 0 ? (
            <p className="text-sm text-parchment-600">No journal entries for this session.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-parchment-200">
              {journalEntries.map((entry) => (
                <JournalEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Retroactive XP ───────────────────────────────────────────────── */}
        {/* Retroactive awards only apply to a closed session — gate defensively. */}
        {session.status === "ended" && (
          <AddXpForm
            characterId={characterId}
            sessionId={session.id}
            onAwarded={applyRefreshed}
            onCharacterUpdate={onCharacterUpdate}
          />
        )}
      </div>
    </Modal>
  );
}
