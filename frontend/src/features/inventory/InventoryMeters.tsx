import MeterBar from "@/components/ui/MeterBar";
import InventoryMetersSlim from "@/features/inventory/InventoryMetersSlim";

interface InventoryMetersProps {
  totalWeight: number;
  capacity: number;
  overCapacity: boolean;
  hasAttunable: boolean;
  attunedCount: number;
  /** The served attunement cap (#1377) — never a local literal. */
  cap: number;
  atCap: boolean;
  slim?: boolean;
}

export default function InventoryMeters({ slim = false, ...props }: InventoryMetersProps) {
  if (slim) return <InventoryMetersSlim {...props} />;

  const { totalWeight, capacity, overCapacity, hasAttunable, attunedCount, cap, atCap } = props;
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
                <span className="ml-2 rounded-control bg-garnet-surface px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-garnet-on-surface">
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
            {attunedCount}/{cap} attuned
          </span>
        </div>
      )}
    </>
  );
}
