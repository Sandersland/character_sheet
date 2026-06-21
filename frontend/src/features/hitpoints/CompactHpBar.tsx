import MeterBar from "@/components/ui/MeterBar";
import type { Character } from "@/types/character";

interface CompactHpBarProps {
  character: Pick<Character, "hitPoints">;
}

/**
 * Slim, read-only HP strip always visible at the top of the session page.
 * Shows current/max HP, temp HP if nonzero, and a MeterBar.
 * Full interactive HP controls (damage, heal, rests, death saves) live in
 * the "Rest" reference tab via the full HitPointTracker.
 */
export default function CompactHpBar({ character }: CompactHpBarProps) {
  const { current, max, temp } = character.hitPoints;
  const isLow = current / max <= 0.25;
  const isDown = current === 0;

  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-sans text-xs font-semibold uppercase tracking-wide text-parchment-500">
            Hit Points
          </span>
          <span
            className={[
              "font-sans text-sm font-bold",
              isDown
                ? "text-garnet-700"
                : isLow
                  ? "text-garnet-600"
                  : "text-parchment-900",
            ].join(" ")}
          >
            {current}
            <span className="font-normal text-parchment-400"> / {max}</span>
          </span>
          {temp > 0 && (
            <span className="rounded-control bg-arcane-50 px-2 py-0.5 text-xs font-semibold text-arcane-700">
              +{temp} temp
            </span>
          )}
          {isDown && (
            <span className="rounded-control bg-garnet-50 px-2 py-0.5 text-xs font-semibold text-garnet-700">
              Down
            </span>
          )}
        </div>
        <div className="w-32 shrink-0">
          <MeterBar current={current} max={max} tone="garnet" label={`${current} of ${max} HP`} />
        </div>
      </div>
    </div>
  );
}
