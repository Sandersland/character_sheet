import Card from "@/components/ui/Card";
import type { ToolChoiceGroup, ToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";

type ToolProficiencySectionProps = Pick<
  ToolProficiencyChoices,
  "grantedToolProfs" | "classChoices" | "backgroundChoices"
>;

function ToolChoiceGroupSection({ group }: { group: ToolChoiceGroup }) {
  if (group.options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-parchment-600">
        {group.label}: Choose {group.max} ({group.selected.length}/{group.max} selected)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {group.options.map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm text-parchment-800">
            <input
              type="checkbox"
              checked={group.selected.includes(name)}
              onChange={() => group.toggle(name)}
              disabled={!group.selected.includes(name) && group.selected.length >= group.max}
            />
            {name}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ToolProficiencySection({
  grantedToolProfs,
  classChoices,
  backgroundChoices,
}: ToolProficiencySectionProps) {
  if (grantedToolProfs.length === 0 && classChoices.options.length === 0 && backgroundChoices.options.length === 0) {
    return null;
  }
  return (
    <Card title="Tool Proficiencies" headingLevel={2}>
      <div className="flex flex-col gap-3 p-4">
        {grantedToolProfs.length > 0 && (
          <p className="text-xs text-parchment-600">
            Granted:{" "}
            <span className="font-medium text-parchment-800">{grantedToolProfs.join(", ")}</span>
          </p>
        )}
        <ToolChoiceGroupSection group={classChoices} />
        <ToolChoiceGroupSection group={backgroundChoices} />
      </div>
    </Card>
  );
}
