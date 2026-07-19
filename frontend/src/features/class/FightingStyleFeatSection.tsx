// Fighting Style feats (#1137): the sheet section for the fightingStyle slot
// partition. Shows taken Fighting Style feats and, while a slot is open, an
// inline picker of the catalog's fighting_style feats (excluding taken ones).
// Taking one routes through the advancement endpoint with a slot:"fightingStyle"
// takeFeat op — never the removed setFightingStyle class scalar.

import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import { useFeatCatalog } from "@/features/advancement/useFeatCatalog";
import type { AdvancementEntry, CatalogFeat, Character, TakeFeatOperation } from "@/types/character";

interface Props {
  character: Character;
  takenFeats: AdvancementEntry[];
  busy: boolean;
  onTake: (op: TakeFeatOperation) => void;
}

function TakenFeat({ entry }: { entry: AdvancementEntry }) {
  return (
    <div className="mb-3">
      <p className="text-sm font-semibold text-parchment-900">{entry.featName ?? "Fighting Style"}</p>
      {entry.featDescription && (
        <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">{entry.featDescription}</p>
      )}
    </div>
  );
}

function FeatPicker({
  character,
  takenIds,
  busy,
  onTake,
}: {
  character: Character;
  takenIds: Set<string>;
  busy: boolean;
  onTake: (op: TakeFeatOperation) => void;
}) {
  const [open, setOpen] = useState(false);
  // Fighting Style feats never appear in the ASI picker, so useFeatCatalog.filter
  // (which mirrors that gate) is bypassed — we filter the raw catalog by category.
  const feats = useFeatCatalog(open, character.level);
  const options = (feats.catalog ?? []).filter(
    (f) => f.category === "fighting_style" && !takenIds.has(f.id),
  );

  function choose(feat: CatalogFeat) {
    onTake({ type: "takeFeat", featId: feat.id, slot: "fightingStyle" });
    setOpen(false);
  }

  // fallow-ignore-next-line code-duplication -- collapsed-picker toggle mirrors AddConditionPanel's; shared-shell extraction deferred (#1137)
  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Choose a fighting style
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-card border border-gold-200 bg-gold-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-900">Choose a Fighting Style</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label="Close fighting style picker"
        >
          ✕
        </button>
      </div>

      {feats.error && <p className="text-xs text-garnet-700">{feats.error}</p>}
      {feats.catalog === null && !feats.error && feats.showSpinner && <Spinner />}
      {feats.catalog !== null && options.length === 0 && (
        <p className="py-2 text-center text-xs text-parchment-600">No fighting styles left to choose.</p>
      )}

      <ul className="max-h-72 overflow-y-auto">
        {options.map((feat) => (
          <li
            key={feat.id}
            className="flex items-start justify-between gap-3 border-b border-gold-100 py-2.5 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-parchment-900">{feat.name}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">{feat.description}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => choose(feat)}
              className="shrink-0 rounded bg-gold-400 px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
              title={`Choose ${feat.name}`}
            >
              Choose
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FightingStyleFeatSection({ character, takenFeats, busy, onTake }: Props) {
  const { total, used } = character.fightingStyleSlots;
  const canTake = used < total;
  const takenIds = new Set(takenFeats.map((f) => f.featId).filter((id): id is string => id != null));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Fighting Style
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {takenFeats.length > 0 ? (
        takenFeats.map((entry) => <TakenFeat key={entry.id} entry={entry} />)
      ) : (
        <p className="mb-3 text-xs text-parchment-600">Choose a fighting style specialty.</p>
      )}

      {canTake && (
        <FeatPicker character={character} takenIds={takenIds} busy={busy} onTake={onTake} />
      )}
    </div>
  );
}
