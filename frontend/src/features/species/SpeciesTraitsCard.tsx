import Card from "@/components/ui/Card";
import GoldWarningBox from "@/components/ui/GoldWarningBox";
import { Eye } from "@/components/ui/icons";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SpeciesTrait } from "@/types/character";

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

function DarkvisionRow({ trait }: { trait: SpeciesTrait }) {
  return (
    <GoldWarningBox variant="row" icon={<Eye className="h-3.5 w-3.5" />}>
      <div className="text-xs font-bold text-gold-900">{trait.name}</div>
      <div className="text-[11px] font-medium text-gold-800">{trait.description}</div>
    </GoldWarningBox>
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
