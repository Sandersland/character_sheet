// #1690: the species-granted Origin feat choice (2024 Human's Versatile) —
// driven purely by the served spec (CreationSpeciesOriginFeatChoice.applicable);
// renders nothing when the server serves no chooseOriginFeat for the chosen
// species+variant. Reuses the SAME useFeatCatalog hook the level-up ASI/feat
// picker uses (features/advancement/useFeatCatalog.ts) — the full edition
// catalog (no asiLevel filter), narrowed to category:"origin" here in the
// component: a UI-level filter of an already-resolved server field, not a
// rule origination (the category itself, and "is this feat legal here" —
// including the duplicate-vs-background check — are both decided server-side
// by resolveSpeciesOriginFeatGrant, character-create.ts).
import Spinner from "@/components/ui/Spinner";
import Card from "@/components/ui/Card";
import { useFeatCatalog, type FeatCatalog } from "@/features/advancement/useFeatCatalog";
import type { CreationSpeciesOriginFeatChoice } from "@/lib/characterCreation";
import type { CatalogFeat } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface SpeciesOriginFeatSectionProps {
  choice: CreationSpeciesOriginFeatChoice;
  /** RulesEdition | null mirrors CreationReviewStep's own draft.rulesEdition
   *  prop — null only pre-CreationEntryGate, before ANY species spec (and so
   *  `choice.applicable`) could ever resolve true, so the picker below never
   *  actually renders with a null edition. */
  edition: RulesEdition | null;
  onChange: (featId: string) => void;
}

function OriginFeatRow({ feat, selected, onSelect }: { feat: CatalogFeat; selected: boolean; onSelect: () => void }) {
  return (
    <li
      className={`flex items-start justify-between gap-3 rounded-control border-b border-gold-100 px-1.5 py-2.5 transition-colors last:border-0 ${
        selected ? "bg-gold-50" : "hover:bg-gold-100/50"
      }`}
    >
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold text-parchment-900">{feat.name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">{feat.description}</p>
      </div>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`shrink-0 rounded px-2.5 py-1 text-xs font-semibold ${
          selected ? "bg-garnet-600 text-white" : "bg-gold-400 text-ink hover:bg-gold-500"
        }`}
      >
        {selected ? "Selected" : "Select"}
      </button>
    </li>
  );
}

// Extracted from SpeciesOriginFeatPicker purely to keep that component's own
// cyclomatic/cognitive complexity under the repo's health gate — same
// reasoning as reference.ts's/character-create.ts's split-out helpers, and
// FeatCatalogRows' own split out of FeatFlow's FeatCatalogList above.
function OriginFeatRows({
  originFeats,
  selectedId,
  onChange,
}: {
  originFeats: CatalogFeat[];
  selectedId: string;
  onChange: (featId: string) => void;
}) {
  return (
    <ul className="max-h-64 overflow-y-auto pr-3 thin-scrollbar">
      {originFeats.map((feat) => (
        <OriginFeatRow
          key={feat.id}
          feat={feat}
          selected={selectedId === feat.id}
          onSelect={() => onChange(selectedId === feat.id ? "" : feat.id)}
        />
      ))}
    </ul>
  );
}

// The catalog-state branches (loading/error/empty/list) as their own
// component, split out for the same complexity-gate reason as OriginFeatRows
// above — SpeciesOriginFeatPicker itself only wires the hook + Card chrome.
function OriginFeatCatalogBody({
  feats,
  selectedId,
  onChange,
}: {
  feats: FeatCatalog;
  selectedId: string;
  onChange: (featId: string) => void;
}) {
  const originFeats = (feats.catalog ?? []).filter((f) => f.category === "origin");
  if (feats.error) return <p className="text-xs text-garnet-700">{feats.error}</p>;
  if (feats.catalog === null) return feats.showSpinner ? <Spinner /> : null;
  if (originFeats.length === 0) {
    return <p className="py-2 text-center text-xs text-parchment-600">No Origin feats in catalog.</p>;
  }
  return <OriginFeatRows originFeats={originFeats} selectedId={selectedId} onChange={onChange} />;
}

// The `applicable` guard lives in the PARENT (below), not here — same "hooks
// run unconditionally, fetch only once mounted" shape as
// SpeciesCantripSection's own split.
function SpeciesOriginFeatPicker({
  choice,
  edition,
  onChange,
}: SpeciesOriginFeatSectionProps) {
  // Fallback is unreachable at runtime (see the prop's own comment) — kept only
  // so useFeatCatalog's non-nullable signature is satisfied without an unsound
  // non-null assertion at this call site.
  const feats = useFeatCatalog(true, undefined, edition ?? "EDITION_2024");

  return (
    <Card title="Species Origin Feat" headingLevel={2}>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold text-parchment-600">Choose one Origin feat</p>
        <OriginFeatCatalogBody feats={feats} selectedId={choice.selectedId} onChange={onChange} />
      </div>
    </Card>
  );
}

export default function SpeciesOriginFeatSection({ choice, edition, onChange }: SpeciesOriginFeatSectionProps) {
  if (!choice.applicable) return null;
  return <SpeciesOriginFeatPicker choice={choice} edition={edition} onChange={onChange} />;
}
