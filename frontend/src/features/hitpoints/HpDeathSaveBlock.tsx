import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import type { useDeathSaves } from "@/features/hitpoints/useDeathSaves";

// Death-save tracker + error, shown only at 0 HP (#736).
export default function HpDeathSaveBlock({ ctl }: { ctl: ReturnType<typeof useDeathSaves> }) {
  if (!ctl.isDying) return null;
  return (
    <div className="flex flex-col gap-2">
      <DeathSaveTracker
        deathSaves={ctl.deathSaves}
        pending={ctl.pending}
        onRollDeathSave={ctl.onRollDeathSave}
        onStabilize={ctl.onStabilize}
      />
      {ctl.error && <p className="text-xs font-semibold text-garnet-700">{ctl.error}</p>}
    </div>
  );
}
