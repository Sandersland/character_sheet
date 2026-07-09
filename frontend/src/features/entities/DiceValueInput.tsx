import Input from "@/components/ui/Input";
import type { CapabilityDice, ItemCapability } from "@/types/character";

interface DiceValueInputProps {
  index: number;
  dice: CapabilityDice | undefined;
  onChange: (patch: Partial<ItemCapability>) => void;
}

// A passiveBonus dice roll (count·d·faces + optional damage type), e.g. +2d6 fire.
export default function DiceValueInput({ index, dice, onChange }: DiceValueInputProps) {
  const count = dice?.count ?? 1;
  const faces = dice?.faces ?? 6;
  const damageType = dice?.damageType;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-parchment-700">Dice value</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          aria-label={`Capability ${index + 1} dice count`}
          fullWidth={false}
          className="w-14 text-center text-parchment-900"
          value={count}
          onChange={(e) => onChange({ dice: { count: Number(e.target.value), faces, damageType } })}
        />
        <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">d</span>
        <Input
          type="number"
          aria-label={`Capability ${index + 1} dice faces`}
          fullWidth={false}
          className="w-14 text-center text-parchment-900"
          value={faces}
          onChange={(e) => onChange({ dice: { count, faces: Number(e.target.value), damageType } })}
        />
        <Input
          type="text"
          aria-label={`Capability ${index + 1} damage type`}
          fullWidth={false}
          placeholder="type"
          className="w-24 text-parchment-900"
          value={damageType ?? ""}
          onChange={(e) => onChange({ dice: { count, faces, damageType: e.target.value || undefined } })}
        />
      </div>
    </div>
  );
}
