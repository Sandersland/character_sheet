/**
 * ChannelDivinitySection — the Cleric/Paladin Channel Divinity block inside
 * ClassFeaturesSection. Fetches the character-scoped entitled options (gated per
 * class/subclass/level server-side) and wires each use to the orchestrator.
 * Mirrors ShadowArtsSection; each use spends 1 CD charge and surfaces its result
 * (save DC, applied buff/condition, or reminder) through the re-rendered character.
 */

import { useEffect, useState } from "react";

import { fetchChannelDivinity } from "@/api/client";
import { abilityLabel } from "@/lib/abilities";
import type {
  CastChannelDivinityOperation,
  CatalogChannelDivinity,
  Character,
} from "@/types/character";

interface Props {
  character: Character;
  busy: boolean;
  onCast: (op: CastChannelDivinityOperation) => void;
}

export default function ChannelDivinitySection({ character, busy, onCast }: Props) {
  const [catalog, setCatalog] = useState<CatalogChannelDivinity[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // The mounted flag alone is the StrictMode-safe fetch guard (see ShadowArtsSection).
  useEffect(() => {
    let mounted = true;
    fetchChannelDivinity(character.id)
      .then((rows) => { if (mounted) setCatalog(rows); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load Channel Divinity options."); });
    return () => { mounted = false; };
  }, [character.id]);

  const pool = character.resources?.pools.find((p) => p.key === "channelDivinity");
  const remaining = pool?.remaining ?? 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Channel Divinity
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs text-parchment-600">
        Each option spends one Channel Divinity charge.
        <span className="ml-2">
          Charges remaining: <span className="font-semibold text-gold-800">{remaining}</span>
        </span>
      </p>

      {catalogError ? (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {catalogError}
        </p>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {(catalog ?? []).map((option) => {
            const label = option.name.replace(/^Channel Divinity: /, "");
            return (
              <li key={option.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-parchment-800">{label}</span>
                    {option.saveDc !== null && (
                      <span className="rounded-control bg-arcane-50 px-1.5 py-0.5 text-[10px] font-semibold text-arcane-800">
                        {option.saveAbility ? `${abilityLabel(option.saveAbility)} DC ${option.saveDc}` : `DC ${option.saveDc}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-parchment-600">{option.description}</p>
                  {option.reminder && (
                    <p className="mt-1 text-[11px] italic text-parchment-500">{option.reminder}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-control bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  disabled={busy || remaining <= 0}
                  onClick={() => onCast({ type: "castChannelDivinity", abilityId: option.id })}
                >
                  Channel
                </button>
              </li>
            );
          })}
          {catalog === null && (
            <li className="py-3 text-center text-sm text-parchment-600">Loading Channel Divinity…</li>
          )}
        </ul>
      )}
    </div>
  );
}
