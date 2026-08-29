import Card from "@/components/ui/Card";
import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import type { EquipmentDraft } from "@/lib/startingEquipment";
import type { ClassStartingEquipment, Item } from "@/types/character";

interface StartingEquipmentSectionProps {
  startingEquipment: ClassStartingEquipment | null | undefined;
  value: EquipmentDraft | null;
  catalog: Item[];
  onChange: (value: EquipmentDraft) => void;
  // Threaded down to a boundToToolChoice open pick; never re-derived here.
  selectedToolChoices: string[];
  title?: string;
  kind?: "class" | "background";
}

export default function StartingEquipmentSection({
  startingEquipment,
  value,
  catalog,
  onChange,
  selectedToolChoices,
  title = "Starting Equipment",
  kind = "class",
}: StartingEquipmentSectionProps) {
  if (!startingEquipment || !value) return null;
  return (
    <Card
      title={title}
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
          selectedToolChoices={selectedToolChoices}
          kind={kind}
        />
      </div>
    </Card>
  );
}
