/**
 * CloakOfShadowsSection — Warrior of Shadow's L17 self-invisible toggle inside
 * ClassFeaturesSection (2024 rewrite, #1246: moved from L11, now costs 3 focus).
 * Activation posts an activateCloakOfShadows op through the shadow-arts
 * transaction path (backend spends focus + self-applies invisible atomically).
 * Breaking (attack / cast a spell / bright light) is manual: the player clears
 * the condition from the Conditions section.
 */

import type { Character } from "@/types/character";

const FOCUS_COST = 3;

interface Props {
  character: Character;
  /** Focus remaining on hand — gates the activation button, mirrors ShadowArtRow. */
  focusAvailable: number;
  busy: boolean;
  onActivate: () => void;
}

export default function CloakOfShadowsSection({ character, focusAvailable, busy, onActivate }: Props) {
  const isInvisible = (character.conditions?.active ?? []).some((c) => c.key === "invisible");
  const canAfford = focusAvailable >= FOCUS_COST;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Cloak of Shadows
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-parchment-600">
        Spend {FOCUS_COST} focus to become invisible and move through creatures and objects as
        difficult terrain, for 1 minute or until incapacitated. Ends early if you attack or cast a
        spell — clear it manually from Conditions when it breaks. While active, Flurry of Blows
        costs no focus.
      </p>

      {isInvisible ? (
        <p className="rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs text-arcane-800" role="status">
          You are <span className="font-semibold">Invisible</span> — clear it from Conditions when the cloak breaks.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || !canAfford}
          onClick={onActivate}
          className="rounded-control bg-gold-400 px-3 py-1 text-[11px] font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          title={canAfford ? `Become invisible (${FOCUS_COST} focus)` : `Not enough focus (needs ${FOCUS_COST})`}
        >
          Become Invisible
        </button>
      )}
    </div>
  );
}
