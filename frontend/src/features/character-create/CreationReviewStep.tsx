import type { RulesEdition } from "@character-sheet/shared-types";

import { useEditions } from "@/hooks/useEditions";
import { formatModifier } from "@/lib/abilities";
import type { CreationPreview } from "@/lib/characterCreation";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-parchment-600">{label}</p>
      <p className="font-display text-xl text-garnet-800">{value}</p>
    </div>
  );
}

export default function CreationReviewStep({
  preview,
  missing,
  submitError,
  campaignName,
  rulesEdition,
}: {
  preview: CreationPreview;
  missing: string[];
  submitError: string | null;
  campaignName: string | null;
  rulesEdition: RulesEdition | null;
}) {
  // #1436: no server row exists mid-creation to resolve a rulesEditionLabel from, so editionLabel stays null until /api/editions loads.
  const { editions } = useEditions();
  const editionLabel = editions?.editions.find((row) => row.key === rulesEdition)?.label ?? null;

  return (
    <div className="flex flex-col gap-4 p-1">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-parchment-500">Level 1 preview</p>
        <div className="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Armor Class" value={String(preview.armorClass)} />
          <Stat label="Initiative" value={formatModifier(preview.dexModifier)} />
          <Stat label="Speed" value={preview.speed !== undefined ? `${preview.speed} ft` : "—"} />
          <Stat label="Hit Points" value={preview.maxHp !== undefined ? String(preview.maxHp) : "—"} />
        </div>
      </div>

      <p className="text-sm text-parchment-700">
        {campaignName ? `Joining ${campaignName}` : "Solo character"}
        {editionLabel && (
          <>
            {" · "}
            <span className="font-semibold text-parchment-900">{editionLabel}</span>
          </>
        )}
      </p>

      {missing.length > 0 && (
        <div
          role="status"
          className="rounded-control border border-parchment-300 bg-parchment-100 px-3 py-2 text-sm text-parchment-700"
        >
          <p className="font-semibold text-parchment-800">Still needed before you can create:</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <p role="alert" className="text-sm font-semibold text-garnet-700">
          {submitError}
        </p>
      )}
    </div>
  );
}
