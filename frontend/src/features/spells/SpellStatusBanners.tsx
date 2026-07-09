// Active concentration + dismissible while-active spell buffs.
import type { ActiveBuff } from "@/types/character";

interface SpellStatusBannersProps {
  concentratingOn: { entryId: string; spellName: string } | null;
  dismissibleSpellBuffs: ActiveBuff[];
  busy: boolean;
  onDropConcentration: () => void;
  onDismissBuff: (entryId: string) => void;
}

export default function SpellStatusBanners({
  concentratingOn,
  dismissibleSpellBuffs,
  busy,
  onDropConcentration,
  onDismissBuff,
}: SpellStatusBannersProps) {
  return (
    <>
      {concentratingOn && (
        <div
          className="flex items-center justify-between gap-3 rounded-control border border-arcane-300 bg-arcane-50 px-4 py-2.5"
          role="status"
        >
          <p className="text-sm text-arcane-800">
            Concentrating on{" "}
            <span className="font-semibold">{concentratingOn.spellName}</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onDropConcentration}
            className="shrink-0 rounded bg-arcane-200 px-2.5 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-300 disabled:opacity-40"
            title={`Stop concentrating on ${concentratingOn.spellName}`}
          >
            Drop concentration
          </button>
        </div>
      )}

      {dismissibleSpellBuffs.map((buff) => (
        <div
          key={buff.id}
          className="flex items-center justify-between gap-3 rounded-control border border-arcane-300 bg-arcane-50 px-4 py-2.5"
          role="status"
        >
          <p className="text-sm text-arcane-800">
            <span className="font-semibold">{buff.source}</span> active
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDismissBuff(buff.sourceEntryId!)}
            className="shrink-0 rounded bg-arcane-200 px-2.5 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-300 disabled:opacity-40"
            title={`Dismiss ${buff.source}`}
          >
            Dismiss
          </button>
        </div>
      ))}
    </>
  );
}
