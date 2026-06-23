import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import type { Session, SessionSummary } from "@/types/character";

interface SessionSummaryModalProps {
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

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Read-only end-of-session recap. Per the inline-vs-Modal rule this is review
 * content (not a row-bound edit), so it lives in a Modal — modeled on
 * ActivityModal's styling. Renders the persisted `Session.summary`.
 */
export default function SessionSummaryModal({ session, onClose }: SessionSummaryModalProps) {
  const summary = session.summary as SessionSummary | null | undefined;

  return (
    <Modal title={session.title ? `Session Recap — ${session.title}` : "Session Recap"} onClose={onClose}>
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
    </Modal>
  );
}
