import MeterBar from "@/components/ui/MeterBar";

interface InventoryMetersSlimProps {
  totalWeight: number;
  capacity: number;
  overCapacity: boolean;
  hasAttunable: boolean;
  attunedCount: number;
  atCap: boolean;
}

// Mobile density variant of the encumbrance readout (#1029): a 6px strip with
// the weight right-aligned, garnet + an "Over capacity" badge only when over.
export default function InventoryMetersSlim({
  totalWeight,
  capacity,
  overCapacity,
  hasAttunable,
  attunedCount,
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
            <span className="rounded-control bg-garnet-700 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-parchment-50">
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
            {attunedCount}/3 attuned
          </span>
        </div>
      )}
    </div>
  );
}
