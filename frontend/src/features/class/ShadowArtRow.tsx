/**
 * ShadowArtRow — a single Way of Shadow Shadow Art with an expandable
 * description and a flat 2-ki cast affordance. Mirrors DisciplineRow, minus the
 * ki scaling (Shadow Arts are flat-cost, roll-less utility/buff spells).
 */

import { useState } from "react";

import { skillLabel } from "@/lib/abilities";
import type {
  CastShadowArtOperation,
  CatalogShadowArt,
  SkillName,
} from "@/types/character";

interface Props {
  art: CatalogShadowArt;
  kiAvailable: number;
  busy: boolean;
  /** True when this Shadow Art is the character's active concentration. */
  isConcentrating: boolean;
  /** Name of the current concentration spell, to warn a cast will replace it. */
  concentratingOnName: string | null;
  onCast: (op: CastShadowArtOperation) => void;
}

export default function ShadowArtRow({
  art,
  kiAvailable,
  busy,
  isConcentrating,
  concentratingOnName,
  onCast,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const kiCost = art.cost.kind === "pool" ? art.cost.base : 0;
  const canAfford = kiAvailable >= kiCost;
  const concentrates = art.effect.concentration ?? false;
  const displayName = art.name.replace(/^Shadow Arts:\s*/, "");

  // Pass without Trace's passive buff (+10 Stealth) — resolved through skillLabel.
  const buffLabel =
    art.effect.effectType === "buff" && art.effect.buffTarget
      ? `${(art.effect.buffModifier ?? 0) >= 0 ? "+" : ""}${art.effect.buffModifier ?? 0} ${skillLabel(art.effect.buffTarget as SkillName)}`
      : null;

  // Warn that casting a new concentration art drops the current one.
  const willReplace = concentrates && !isConcentrating && concentratingOnName;

  function handleCast() {
    if (busy || !canAfford) return;
    onCast({ type: "castShadowArt", shadowArtId: art.id });
  }

  return (
    <li className="border-b border-parchment-200 py-2.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-baseline gap-1.5 text-left"
          aria-expanded={expanded}
        >
          <span className="text-sm font-semibold text-parchment-900">{displayName}</span>
          <span className="text-[10px] text-gold-700" aria-hidden="true">
            {kiCost} ki
          </span>
          {concentrates &&
            (isConcentrating ? (
              <span className="rounded-control bg-arcane-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-parchment-50">
                concentrating
              </span>
            ) : (
              <span className="rounded-control bg-arcane-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-arcane-800">
                conc
              </span>
            ))}
          {buffLabel && (
            <span className="rounded-control bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
              {buffLabel}
            </span>
          )}
          <span className="text-[10px] text-parchment-400" aria-hidden="true">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        <button
          type="button"
          disabled={busy || !canAfford}
          onClick={handleCast}
          className="shrink-0 rounded-control bg-gold-400 px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            !canAfford
              ? `Not enough ki (needs ${kiCost})`
              : `Cast ${displayName} (${kiCost} ki)`
          }
        >
          Cast
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 pr-2">
          <p className="text-xs leading-relaxed text-parchment-600">{art.description}</p>
          {willReplace && (
            <p className="mt-1 text-[11px] text-arcane-800">
              Replaces concentration on {concentratingOnName}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
