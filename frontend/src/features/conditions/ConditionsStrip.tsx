// ConditionsSheetBody is shared with CombatUtilityStrip — keep both in sync.
import ConditionsSheetBody from "@/features/conditions/ConditionsSheetBody";

export default function ConditionsStrip() {
  return (
    <section
      className="rounded-card border border-parchment-200 bg-parchment-50 p-4 shadow-card"
      aria-label="Conditions"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Conditions
        </h2>
      </div>

      <ConditionsSheetBody />
    </section>
  );
}
