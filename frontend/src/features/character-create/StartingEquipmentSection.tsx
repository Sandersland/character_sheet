import Card from "@/components/ui/Card";
import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import type { EquipmentDraft } from "@/lib/startingEquipment";
import type { ClassStartingEquipment, Item } from "@/types/character";

interface StartingEquipmentSectionProps {
  startingEquipment: ClassStartingEquipment | null | undefined;
  value: EquipmentDraft | null;
  catalog: Item[];
  onChange: (value: EquipmentDraft) => void;
  /** The character's own chosen tool proficiencies (creation toolChoices
   *  step) — threaded down to a boundToToolChoice open pick (#1564 PR #1567
   *  fix 2), never re-derived here. */
  selectedToolChoices: string[];
  /** #1565: the card's own title, defaulting to "Starting Equipment" — the
   *  background reuse of this section passes "Background Equipment" so two
   *  cards on the same step read distinctly. */
  title?: string;
  /** #1565: forwarded to StartingEquipmentEditor's own `kind` (default "class"). */
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
