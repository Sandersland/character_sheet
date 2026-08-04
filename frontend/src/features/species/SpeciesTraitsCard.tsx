import Card from "@/components/ui/Card";
import { Eye } from "@/components/ui/icons";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SpeciesTrait } from "@/types/character";

/**
 * Species-granted information (#1682) — the sheet's new domain component for
 * `character.speciesTraits` (name + cited text, server-resolved, no rule
 * arithmetic here — CLAUDE.md: the frontend never originates a rule). Darkvision
 * renders in its own accented row above the rest (owner ruling 2026-08-03:
 * visible information, not a derived combat stat, but still prominent) —
 * everything else is a plain name/description list, ordered exactly as served.
 * Renders nothing for a legacy `race`-name-only character with no species
 * picked yet (speciesTraits: []) — the species picker itself ships in #1680.
 */
export default function SpeciesTraitsCard() {
  const { character } = useCurrentCharacter();
  const traits = character.speciesTraits;
  if (traits.length === 0) return null;

  const darkvision = traits.find((t) => t.name === "Darkvision");
  const rest = traits.filter((t) => t !== darkvision);

  return (
    <Card title="Species Traits" titleAccessory={<span className="text-xs text-parchment-600">{character.race}</span>} className="p-4">
      <div className="flex flex-col gap-3">
        {darkvision && <DarkvisionRow trait={darkvision} />}
        {rest.length > 0 && (
          <dl className="flex flex-col gap-3">
            {rest.map((trait) => (
              <TraitRow key={trait.name} trait={trait} />
            ))}
          </dl>
        )}
      </div>
    </Card>
  );
}

// Darkvision gets its own accented row (amber, matching ConditionRollBanner's
// "say the fact once, prominently" treatment) rather than blending into the
// plain trait list below — the owner asked for it visible, not buried.
function DarkvisionRow({ trait }: { trait: SpeciesTrait }) {
  return (
    <div className="flex items-center gap-2.5 rounded-card border border-gold-400 bg-gold-100 px-3 py-2">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-gold-400 text-gold-900"
        aria-hidden="true"
      >
        <Eye className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-bold text-gold-900">{trait.name}</div>
        <div className="text-[11px] font-medium text-gold-800">{trait.description}</div>
      </div>
    </div>
  );
}

function TraitRow({ trait }: { trait: SpeciesTrait }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-parchment-800">{trait.name}</dt>
      <dd className="text-sm text-parchment-600">{trait.description}</dd>
    </div>
  );
}
