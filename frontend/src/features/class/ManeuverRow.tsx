/**
 * ManeuverRow — renders a single known maneuver with an expandable description
 * and a "Forget" action. Purely presentational: no API calls, receives all
 * callbacks from the ClassFeaturesSection orchestrator. Renders through
 * AbilityRowShell (shared with ShadowArtRow).
 */

import AbilityRowShell from "@/features/class/AbilityRowShell";
import type { ManeuverEntry } from "@/types/character";

interface Props {
  entry: ManeuverEntry;
  busy: boolean;
  onForget: (entryId: string) => void;
}

export default function ManeuverRow({ entry, busy, onForget }: Props) {
  function handleForget() {
    if (!confirm(`Forget "${entry.name}"?`)) return;
    onForget(entry.id);
  }

  return (
    <AbilityRowShell
      name={entry.name}
      actions={
        <button
          type="button"
          disabled={busy}
          onClick={handleForget}
          className="rounded-control bg-garnet-50 px-2 py-0.5 text-[11px] font-semibold text-garnet-700 hover:bg-garnet-100 disabled:opacity-30"
          title={`Forget ${entry.name}`}
        >
          Forget
        </button>
      }
    >
      <p className="text-xs leading-relaxed text-parchment-600">{entry.description}</p>
    </AbilityRowShell>
  );
}
