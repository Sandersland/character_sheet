/**
 * ShadowArtsSection — Way of Shadow's Shadow Arts block inside ClassFeaturesSection.
 * Fetches the 4-spell catalog once and wires each cast up to the orchestrator.
 * Mirrors DisciplinesSection; casts are flat 2-ki, roll-less, and route their
 * concentration/buff results through the re-rendered character (Stealth row +
 * concentration banner) rather than a dice toast.
 */

import { useEffect, useState } from "react";

import { fetchShadowArts } from "@/api/client";
import { kiRemaining } from "@/lib/disciplines";
import type {
  CastShadowArtOperation,
  CatalogShadowArt,
  Character,
} from "@/types/character";
import ShadowArtRow from "@/features/class/ShadowArtRow";

interface Props {
  character: Character;
  busy: boolean;
  onCast: (op: CastShadowArtOperation) => void;
}

export default function ShadowArtsSection({ character, busy, onCast }: Props) {
  const [catalog, setCatalog] = useState<CatalogShadowArt[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // The mounted flag alone is the StrictMode-safe fetch guard (see DisciplinesSection).
  useEffect(() => {
    let mounted = true;
    fetchShadowArts()
      .then((rows) => { if (mounted) setCatalog(rows); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load Shadow Arts."); });
    return () => { mounted = false; };
  }, []);

  const kiAvailable = kiRemaining(character.resources);
  const concentratingOn = character.spellcasting?.concentratingOn ?? null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Shadow Arts
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs text-parchment-600">
        Each Shadow Art costs 2 ki.
        <span className="ml-2">
          Ki remaining: <span className="font-semibold text-gold-800">{kiAvailable}</span>
        </span>
      </p>

      {concentratingOn && (
        <p className="mb-3 rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs text-arcane-800" role="status">
          Concentrating on <span className="font-semibold">{concentratingOn.spellName}</span>
        </p>
      )}

      {catalogError ? (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {catalogError}
        </p>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {(catalog ?? []).map((art) => (
            <ShadowArtRow
              key={art.id}
              art={art}
              kiAvailable={kiAvailable}
              busy={busy}
              isConcentrating={concentratingOn?.entryId === art.id}
              concentratingOnName={concentratingOn?.spellName ?? null}
              onCast={onCast}
            />
          ))}
          {catalog === null && (
            <li className="py-3 text-center text-sm text-parchment-600">Loading Shadow Arts…</li>
          )}
        </ul>
      )}
    </div>
  );
}
