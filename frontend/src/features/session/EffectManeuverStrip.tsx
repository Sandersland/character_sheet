import { QuickBtn } from "@/features/session/TurnControls";

/** Gold strip of effect maneuvers (no slot consumed) — e.g. Evasive Footwork. */
export default function EffectManeuverStrip({
  effectManeuvers,
  superiorityRemaining,
  dieLabel,
  dieBusy,
  handleEffectManeuver,
}: {
  effectManeuvers: Array<{ id: string; name: string }>;
  superiorityRemaining: number;
  dieLabel: string;
  dieBusy: boolean;
  handleEffectManeuver: (entryId: string, name: string) => Promise<void>;
}) {
  if (effectManeuvers.length === 0 || superiorityRemaining <= 0) return null;
  return (
    <div className="rounded-card border border-gold-200 bg-gold-50 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gold-800">
        Maneuvers ({dieLabel}, {superiorityRemaining} left)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {effectManeuvers.map((m) => (
          <QuickBtn
            key={m.id}
            tone="gold"
            disabled={dieBusy}
            onClick={() => handleEffectManeuver(m.id, m.name)}
            title={`Spend ${dieLabel} — ${m.name}`}
          >
            {m.name} ({dieLabel})
          </QuickBtn>
        ))}
      </div>
    </div>
  );
}
