// Review step of the creation ceremony (#1176): the derived level-1 stats
// (formerly PreviewSection) plus the still-needed list + submit error (formerly
// CreateActions). The confirm button itself lives in the ceremony footer.

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
}: {
  preview: CreationPreview;
  missing: string[];
  submitError: boolean;
}) {
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
          Couldn't save — check the form and try again.
        </p>
      )}
    </div>
  );
}
