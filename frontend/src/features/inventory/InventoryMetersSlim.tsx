import MeterBar from "@/components/ui/MeterBar";

interface InventoryMetersSlimProps {
  totalWeight: number;
  capacity: number;
  overCapacity: boolean;
  hasAttunable: boolean;
  attunedCount: number;
  /** The served attunement cap (#1377) — never a local literal. */
  cap: number;
  atCap: boolean;
}

export default function InventoryMetersSlim({
  totalWeight,
  capacity,
  overCapacity,
  hasAttunable,
  attunedCount,
  cap,
  atCap,
}: InventoryMetersSlimProps) {
  return (
    <div className="flex flex-col gap-1">
      {totalWeight > 0 && (
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-parchment-600">Load</span>
          <MeterBar
            current={totalWeight}
            max={capacity}
            tone={overCapacity ? "garnet" : "gold"}
            label={`Encumbrance ${totalWeight.toFixed(1)} of ${capacity} lb`}
            className="h-1.5 flex-1"
          />
          {overCapacity && (
            <span className="rounded-control bg-garnet-surface px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-garnet-on-surface">
              Over capacity
            </span>
          )}
          <span
            className={`text-xs font-bold tabular-nums ${overCapacity ? "text-garnet-700" : "text-parchment-600"}`}
          >
            {totalWeight.toFixed(1)} / {capacity} lb
          </span>
        </div>
      )}
      {hasAttunable && (
        <div className="flex items-center justify-end">
          <span className={`text-[11px] font-semibold ${atCap ? "text-arcane-700" : "text-parchment-500"}`}>
            {attunedCount}/{cap} attuned
          </span>
        </div>
      )}
    </div>
  );
}
