import Card from "@/components/ui/Card";
import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import type { EquipmentDraft } from "@/lib/startingEquipment";
import type { ClassStartingEquipment, Item } from "@/types/character";

interface StartingEquipmentSectionProps {
  startingEquipment: ClassStartingEquipment | null | undefined;
  value: EquipmentDraft | null;
  catalog: Item[];
  onChange: (value: EquipmentDraft) => void;
}

export default function StartingEquipmentSection({
  startingEquipment,
  value,
  catalog,
  onChange,
}: StartingEquipmentSectionProps) {
  if (!startingEquipment || !value) return null;
  return (
    <Card
      title="Starting Equipment"
      headingLevel={2}
      titleAccessory={
        <span className="text-xs font-normal normal-case text-parchment-600">
          All choices required
        </span>
      }
    >
      <div className="p-4">
        <StartingEquipmentEditor
          startingEquipment={startingEquipment}
          catalog={catalog}
          value={value}
          onChange={onChange}
        />
      </div>
    </Card>
  );
}
