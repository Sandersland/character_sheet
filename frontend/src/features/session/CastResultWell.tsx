/**
 * The cast sheet's pinned result well (#1164): ALWAYS rendered under the spell
 * list so nothing shifts when it fills — a dashed placeholder pre-cast, then
 * the kept dice/total/announce line in place at settle. Distinct from the
 * transient RollResultSeal (2.2s toast); this persists until the next cast or
 * the sheet closes.
 */

import type { CastSettleView } from "@/features/session/useSpellPicker";

export default function CastResultWell({ settle }: { settle: CastSettleView | null }) {
  if (!settle) {
    return (
      <div className="flex min-h-24 flex-col justify-center gap-1 rounded-control border border-dashed border-parchment-300 bg-parchment-50 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-500">Result</p>
        <p className="text-xs text-parchment-500">Cast a spell — its roll and what to announce land here.</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex min-h-24 flex-col justify-center gap-1.5 rounded-control border border-vitality-300 bg-vitality-50 px-3 py-2.5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-vitality-700">
        Result · {settle.spellName}
      </p>
      {settle.total !== null ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {settle.dice.map((value, i) => (
              <span
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-control border border-vitality-300 bg-parchment-50 font-display text-sm font-semibold text-vitality-700"
              >
                {value}
              </span>
            ))}
          </div>
          <span className="font-display text-xl font-bold text-vitality-700">
            {settle.total}
            {settle.damageType ? ` ${settle.damageType}` : ""}
          </span>
        </div>
      ) : (
        <p className="text-sm font-semibold text-vitality-700">No roll — effect applied</p>
      )}
      {settle.announce && (
        <p className="text-xs text-vitality-700">Announce: {settle.announce} · logged to the session</p>
      )}
    </div>
  );
}
