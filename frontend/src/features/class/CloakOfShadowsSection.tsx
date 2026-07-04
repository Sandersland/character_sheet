/**
 * CloakOfShadowsSection — Way of Shadow's L11 self-invisible toggle inside
 * ClassFeaturesSection. Activation applies the `invisible` condition through the
 * conditions transaction path (source "Cloak of Shadows"), which logs the audit
 * event. Breaking (attack / cast a spell / bright light) is manual: the player
 * clears the condition from the Conditions section.
 */

import type { Character } from "@/types/character";

interface Props {
  character: Character;
  busy: boolean;
  onActivate: () => void;
}

export default function CloakOfShadowsSection({ character, busy, onActivate }: Props) {
  const isInvisible = (character.conditions?.active ?? []).some((c) => c.key === "invisible");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Cloak of Shadows
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-parchment-600">
        In dim light or darkness, use your action to become invisible. Ends when you attack, cast a
        spell, or enter an area of bright light — clear it manually from Conditions when it breaks.
      </p>

      {isInvisible ? (
        <p className="rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs text-arcane-800" role="status">
          You are <span className="font-semibold">Invisible</span> — clear it from Conditions when the cloak breaks.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onActivate}
          className="rounded-control bg-gold-400 px-3 py-1 text-[11px] font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          title="Become invisible (Cloak of Shadows)"
        >
          Become Invisible
        </button>
      )}
    </div>
  );
}
