import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { cloakOfShadowsView } from "@/lib/cloakOfShadows";

interface Props {
  busy: boolean;
  onActivate: () => void;
}

export default function CloakOfShadowsSection({ busy, onActivate }: Props) {
  const { character } = useCurrentCharacter();
  // Resolves the description and affordability gate entirely off the character's
  // own "cloakOfShadows" availableActions row; never re-derives a focus/ki cost here.
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
