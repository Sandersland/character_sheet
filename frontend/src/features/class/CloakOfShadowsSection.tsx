/**
 * CloakOfShadowsSection — the monk's self-invisible activation inside
 * ClassFeaturesSection. Shared by both editions (#1738): a 2024 Warrior of
 * Shadow's version is gated at L17 (3 focus, 1 minute, frees Flurry of
 * Blows), a 2014 Way of Shadow's is gated at L11 (no ki cost, no duration
 * cap — ends only on attack/cast/bright light). Neither shape is hardcoded
 * here: cloakOfShadowsView resolves the description and the affordability
 * gate entirely off the character's own "cloakOfShadows" `availableActions`
 * row (`reminder` + `enabled`/`disabledReason`), which the backend already
 * computes per edition (actions.ts) — this component never re-derives a
 * focus/ki cost.
 * Activation posts an activateCloakOfShadows op through the shadow-arts
 * transaction path (backend pays the edition-correct cost + self-applies
 * invisible atomically). Breaking (attack / cast a spell / bright light) is
 * manual: the player clears the condition from the Conditions section.
 */

import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { cloakOfShadowsView } from "@/lib/cloakOfShadows";

interface Props {
  busy: boolean;
  onActivate: () => void;
}

export default function CloakOfShadowsSection({ busy, onActivate }: Props) {
  const { character } = useCurrentCharacter();
  const view = cloakOfShadowsView(character);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Cloak of Shadows
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {view.reminder && (
        <p className="mb-3 text-xs leading-relaxed text-parchment-600">{view.reminder}</p>
      )}

      {view.isInvisible ? (
        <p className="rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs text-arcane-800" role="status">
          You are <span className="font-semibold">Invisible</span> — clear it from Conditions when the cloak breaks.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || !view.canActivate}
          onClick={onActivate}
          className="rounded-control bg-gold-400 px-3 py-1 text-[11px] font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          title={view.canActivate ? "Become invisible" : view.disabledTitle}
        >
          Become Invisible
        </button>
      )}
    </div>
  );
}
