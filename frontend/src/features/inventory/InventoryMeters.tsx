import MeterBar from "@/components/ui/MeterBar";

interface InventoryMetersProps {
  totalWeight: number;
  capacity: number;
  overCapacity: boolean;
  hasAttunable: boolean;
  attunedCount: number;
  atCap: boolean;
}

// Encumbrance meter + the X/3 attunement readout above the item list.
export default function InventoryMeters({
  totalWeight,
  capacity,
  overCapacity,
  hasAttunable,
  attunedCount,
  atCap,
}: InventoryMetersProps) {
  return (
    <>
      {totalWeight > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wide text-parchment-600">
              Encumbrance
            </span>
            <span className={overCapacity ? "font-semibold text-garnet-700" : "text-parchment-600"}>
              {totalWeight.toFixed(1)} / {capacity} lb
              {overCapacity && (
                <span className="ml-2 rounded-control bg-garnet-700 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-parchment-50">
                  Over capacity
                </span>
              )}
            </span>
          </div>
          <MeterBar
            current={totalWeight}
            max={capacity}
            tone={overCapacity ? "garnet" : "gold"}
            label={`Encumbrance ${totalWeight.toFixed(1)} of ${capacity} lb`}
          />
        </div>
      )}

      {hasAttunable && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-parchment-600">Attunement</span>
          <span className={atCap ? "font-semibold text-arcane-700" : "text-parchment-600"}>
            {attunedCount}/3 attuned
          </span>
        </div>
      )}
    </>
  );
}
