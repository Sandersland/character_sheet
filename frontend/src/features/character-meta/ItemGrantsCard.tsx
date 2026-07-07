import Card from "@/components/ui/Card";
import { advantageGrantSummary } from "@/lib/capabilities";
import { conditionLabel } from "@/lib/conditions";
import { damageTypeLabel } from "@/lib/damageTypes";
import type { Character } from "@/types/character";

// Item-granted traits (#529) derived from active (equipped/attuned) items:
// resistances, damage/condition immunities, and advantage reminders. Each row
// carries its item source. Hidden entirely when nothing is active.
export default function ItemGrantsCard({ character }: { character: Character }) {
  const resistances = character.resistances ?? [];
  const damageImmunities = character.damageImmunities ?? [];
  const conditionImmunities = character.conditionImmunities ?? [];
  const advantages = character.grantedAdvantages ?? [];

  if (
    resistances.length === 0 &&
    damageImmunities.length === 0 &&
    conditionImmunities.length === 0 &&
    advantages.length === 0
  ) {
    return null;
  }

  return (
    <Card title="Resistances & Traits" className="p-4">
      <div className="flex flex-col gap-4">
        {resistances.length > 0 && (
          <Group label="Damage resistances">
            {resistances.map((r, i) => (
              <Chip key={`res-${i}`} text={damageTypeLabel(r.damageType)} source={r.source} />
            ))}
          </Group>
        )}

        {damageImmunities.length > 0 && (
          <Group label="Damage immunities">
            {damageImmunities.map((d, i) => (
              <Chip key={`imm-${i}`} text={damageTypeLabel(d.damageType)} source={d.source} />
            ))}
          </Group>
        )}

        {conditionImmunities.length > 0 && (
          <Group label="Condition immunities">
            {conditionImmunities.map((c, i) => (
              <Chip key={`cond-${i}`} text={conditionLabel(c.condition)} source={c.source} />
            ))}
          </Group>
        )}

        {advantages.length > 0 && (
          <Group label="Advantages">
            {advantages.map((a, i) => (
              <Chip key={`adv-${i}`} text={advantageGrantSummary(a)} source={a.source} />
            ))}
          </Group>
        )}
      </div>
    </Card>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">{label}</span>
      <ul className="flex flex-wrap gap-2">{children}</ul>
    </div>
  );
}

function Chip({ text, source }: { text: string; source: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-control border border-parchment-200 bg-parchment-50 px-2 py-1 text-xs text-parchment-800">
      <span className="font-medium">{text}</span>
      <span className="rounded-full bg-garnet-100 px-1.5 py-0.5 text-[10px] font-semibold text-garnet-700">{source}</span>
    </li>
  );
}
