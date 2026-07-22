/**
 * ShadowArtsSection — Warrior of Shadow's Shadow Arts block inside
 * ClassFeaturesSection. Fetches the single-item Darkness catalog (2024 rewrite,
 * #1246 — the 2014 4-spell menu is retired) and wires the cast up to the
 * orchestrator. The cast is flat 1-focus, roll-less, and routes its
 * concentration result through the re-rendered character (concentration
 * banner) rather than a dice toast.
 */

import { useEffect, useState } from "react";

import { fetchShadowArts } from "@/api/client";
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

// Remaining Focus from the character's derived resource pools.
function focusRemaining(character: Character): number {
  return character.resources?.pools.find((p) => p.key === "focus")?.remaining ?? 0;
}

export default function ShadowArtsSection({ character, busy, onCast }: Props) {
  const [catalog, setCatalog] = useState<CatalogShadowArt[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // The mounted flag alone is the StrictMode-safe fetch guard.
  useEffect(() => {
    let mounted = true;
    fetchShadowArts()
      .then((rows) => { if (mounted) setCatalog(rows); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load Shadow Arts."); });
    return () => { mounted = false; };
  }, []);

  const focusAvailable = focusRemaining(character);
  const concentratingOn = character.spellcasting?.concentratingOn ?? null;
  // A cast Shadow Art's concentration entryId is prefixed (disjoint from Spell.id) on the backend.
  const concentratingArtId = concentratingOn?.entryId?.startsWith("shadow-art:")
    ? concentratingOn.entryId.slice("shadow-art:".length)
    : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Shadow Arts
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs text-parchment-600">
        Cast Darkness for 1 focus.
        <span className="ml-2">
          Focus remaining: <span className="font-semibold text-gold-800">{focusAvailable}</span>
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
              focusAvailable={focusAvailable}
              busy={busy}
              isConcentrating={concentratingArtId === art.id}
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
