import type { CharacterResources, LearnManeuverOperation } from "@/types/character";
import AddManeuverPanel from "@/features/class/AddManeuverPanel";
import ManeuverRow from "@/features/class/ManeuverRow";

interface Props {
  characterId: string;
  resources: CharacterResources;
  maneuverKnownIds: string[];
  busy: boolean;
  onLearn: (op: LearnManeuverOperation) => void;
  onForget: (entryId: string) => void;
}

export default function ManeuversSection({
  characterId,
  resources,
  maneuverKnownIds,
  busy,
  onLearn,
  onForget,
}: Props) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Maneuvers
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {resources.maneuverSaveDC !== undefined && (
        <p className="mb-3 text-xs text-parchment-600">
          Maneuver Save DC:{" "}
          <span className="font-semibold text-parchment-900">{resources.maneuverSaveDC}</span>
        </p>
      )}

      {resources.maneuversKnown.length === 0 ? (
        <p className="py-3 text-center text-sm text-parchment-600">No maneuvers learned yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-parchment-200">
          {resources.maneuversKnown.map((entry) => (
            <ManeuverRow key={entry.id} entry={entry} busy={busy} onForget={onForget} />
          ))}
        </ul>
      )}

      <AddManeuverPanel
        characterId={characterId}
        knownIds={maneuverKnownIds}
        choiceCount={resources.maneuverChoiceCount!}
        knownCount={resources.maneuversKnown.length}
        busy={busy}
        onLearn={onLearn}
      />
    </div>
  );
}
