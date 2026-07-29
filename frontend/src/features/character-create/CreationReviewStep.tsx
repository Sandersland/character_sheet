// Review step of the creation ceremony (#1176): the derived level-1 stats
// (formerly PreviewSection) plus the still-needed list + submit error (formerly
// CreateActions). The confirm button itself lives in the ceremony footer.

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
  /** The real error text (create OR campaign-attach failure), or null. */
  submitError: string | null;
  /** Resolved by CreationEntryGate; null for a solo build. */
  campaignName: string | null;
  /** Resolved by CreationEntryGate — always set by Review; null only defensively. */
  rulesEdition: RulesEdition | null;
}) {
  // Mid-creation there is no server row to hang a rulesEditionLabel on, so the
  // label is resolved out of the served rows (#1436). Null until they arrive —
  // the fragment below then renders nothing while the rest of the line still
  // does, rather than flashing a raw EDITION_* key.
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

      {/* #1286: the last screen before an irreversible write echoes the choice —
          otherwise it's invisible here and only changeable via Start Over. */}
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
