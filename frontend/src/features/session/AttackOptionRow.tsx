// One "attackOption" maneuver row (e.g. Commander's Strike) that forfeits an attack.

interface AttackOptionRowProps {
  name: string;
  enabled: boolean;
  reason?: string;
  message?: string;
  dieLabel: string;
  dieBusy: boolean;
  onUse: (name: string) => void;
}

export default function AttackOptionRow({
  name,
  enabled,
  reason,
  message,
  dieLabel,
  dieBusy,
  onUse,
}: AttackOptionRowProps) {
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-parchment-900">{name}</p>
          <p className="text-xs text-parchment-600">
            Forfeit 1 attack · Costs bonus action · Spend {dieLabel}
          </p>
          {message && <p className="mt-1 text-xs italic text-gold-800">{message}</p>}
        </div>
        <button
          type="button"
          disabled={!enabled || dieBusy}
          onClick={() => onUse(name)}
          title={reason}
          className="rounded-control border border-gold-300 bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Use
        </button>
      </div>
    </div>
  );
}
