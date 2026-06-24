import { useEffect, useState } from "react";

import { applyExperienceOperations, fetchSession } from "@/api/client";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatJournalDate } from "@/lib/formatJournalDate";
import type { JournalEntry, Session, SessionSummary } from "@/types/character";

interface SessionSummaryModalProps {
  /** Owning character — needed to retroactively award XP to this session. */
  characterId: string;
  /** The ended session whose `summary` is displayed. */
  session: Session;
  onClose: () => void;
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
      <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
        {label}
      </span>
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
        <span className="whitespace-nowrap text-xs text-parchment-500">
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
 * via the explicit-sessionId override, then refreshes the displayed summary so
 * the XP-gained tile updates in place.
 */
function AddXpForm({
  characterId,
  sessionId,
  onAwarded,
}: {
  characterId: string;
  sessionId: string;
  onAwarded: (summary: SessionSummary) => void;
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
      await applyExperienceOperations(characterId, [{ type: "award", amount: parsed }], sessionId);
      // Re-fetch the session to pick up its freshly recomputed summary.
      const refreshed = await fetchSession(characterId, sessionId);
      if (refreshed.summary) onAwarded(refreshed.summary as SessionSummary);
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
    "w-28 rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

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
          className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-garnet-700 disabled:opacity-40"
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
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Read-only end-of-session recap. Per the inline-vs-Modal rule this is review
 * content (not a row-bound edit), so it lives in a Modal — modeled on
 * ActivityModal's styling. Renders the persisted `Session.summary`, the
 * session's journal entries, and a retroactive "add XP" affordance.
 */
export default function SessionSummaryModal({ characterId, session, onClose }: SessionSummaryModalProps) {
  const [summary, setSummary] = useState<SessionSummary | null | undefined>(
    session.summary as SessionSummary | null | undefined,
  );
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(
    session.journalEntries ?? [],
  );

  // When opened from a list that doesn't carry journals (SessionsModal seeds
  // from the sessions list endpoint), lazily fetch the full session detail so
  // its journal entries surface here. The end-session path already supplies
  // them, so this only fires when they're absent.
  useEffect(() => {
    if (session.journalEntries !== undefined) return;
    let cancelled = false;
    fetchSession(characterId, session.id)
      .then((full) => {
        if (cancelled) return;
        setJournalEntries(full.journalEntries ?? []);
        if (full.summary) setSummary(full.summary as SessionSummary);
      })
      .catch(() => {
        /* leave the seeded summary in place if detail fetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, session.id, session.journalEntries]);

  return (
    <Modal title={session.title ? `Session Recap — ${session.title}` : "Session Recap"} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {!summary ? (
          <p className="py-6 text-center text-sm text-parchment-500">
            No summary is available for this session.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
          {/* ── Time window ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-parchment-500">
            <span>{formatTimeRange(summary.startedAt, summary.endedAt)}</span>
            <Badge tone="neutral">{formatDuration(summary.durationMs)}</Badge>
          </div>

          {/* ── Headline stat tiles ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="XP gained" value={summary.xpGained.toLocaleString()} tone="text-arcane-700" />
            <StatTile label="Spells cast" value={summary.spellsCast} tone="text-arcane-700" />
            <StatTile label="Attack rolls" value={summary.attackRolls} tone="text-garnet-700" />
            <StatTile label="Damage rolls" value={summary.damageRolls} tone="text-garnet-700" />
          </div>

          {/* ── Secondary facts ──────────────────────────────────────────── */}
          <ul className="flex flex-col gap-2 text-sm text-parchment-900">
            {summary.levelsGained > 0 && (
              <li className="flex items-center gap-2">
                <Badge tone="vitality">level up</Badge>
                <span>
                  Gained {summary.levelsGained} level{summary.levelsGained === 1 ? "" : "s"}
                </span>
              </li>
            )}

            {summary.combatRounds > 0 && (
              <li className="flex items-center gap-2">
                <Badge tone="garnet">combat</Badge>
                <span>
                  {summary.combatRounds} combat round{summary.combatRounds === 1 ? "" : "s"}
                </span>
              </li>
            )}

            {Object.keys(summary.slotsSpent).length > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <Badge tone="arcane">slots spent</Badge>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {Object.entries(summary.slotsSpent)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([level, count]) => (
                      <span key={level}>
                        L{level}: {count}
                      </span>
                    ))}
                </span>
              </li>
            )}

            {summary.featsOrAsis.map((adv, i) => (
              <li key={`${adv.type}-${i}`} className="flex items-center gap-2">
                <Badge tone="vitality">advancement</Badge>
                <span>{adv.label}</span>
              </li>
            ))}
          </ul>

          {/* ── Items acquired ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-parchment-500">
              Items acquired
            </p>
            {summary.itemsAcquired.length === 0 ? (
              <p className="text-sm text-parchment-500">No items gained this session.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {summary.itemsAcquired.map((item) => (
                  <li key={item.name} className="flex items-center gap-2 text-sm text-parchment-900">
                    <Badge tone="gold">×{item.qty}</Badge>
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        )}

        {/* ── Session journals ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-parchment-500">
            Journal
          </p>
          {journalEntries.length === 0 ? (
            <p className="text-sm text-parchment-500">No journal entries for this session.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-parchment-200">
              {journalEntries.map((entry) => (
                <JournalEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Retroactive XP ───────────────────────────────────────────────── */}
        <AddXpForm
          characterId={characterId}
          sessionId={session.id}
          onAwarded={(s) => setSummary(s)}
        />
      </div>
    </Modal>
  );
}
