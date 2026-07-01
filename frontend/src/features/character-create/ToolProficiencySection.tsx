import Card from "@/components/ui/Card";
import type { ToolProficiencyChoices } from "@/features/character-create/useToolProficiencyChoices";

type ToolProficiencySectionProps = Pick<
  ToolProficiencyChoices,
  "grantedToolProfs" | "toolChoiceOptions" | "maxToolChoices" | "selectedToolChoices" | "toggleToolChoice"
>;

export default function ToolProficiencySection({
  grantedToolProfs,
  toolChoiceOptions,
  maxToolChoices,
  selectedToolChoices,
  toggleToolChoice,
}: ToolProficiencySectionProps) {
  if (grantedToolProfs.length === 0 && toolChoiceOptions.length === 0) return null;
  return (
    <Card title="Tool Proficiencies" headingLevel={2}>
      <div className="flex flex-col gap-3 p-4">
        {grantedToolProfs.length > 0 && (
          <p className="text-xs text-parchment-600">
            Granted:{" "}
            <span className="font-medium text-parchment-800">{grantedToolProfs.join(", ")}</span>
          </p>
        )}
        {toolChoiceOptions.length > 0 && (
          <>
            <p className="text-xs font-semibold text-parchment-600">
              Choose {maxToolChoices} ({selectedToolChoices.length}/{maxToolChoices} selected)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {toolChoiceOptions.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm text-parchment-800">
                  <input
                    type="checkbox"
                    checked={selectedToolChoices.includes(name)}
                    onChange={() => toggleToolChoice(name)}
                    disabled={
                      !selectedToolChoices.includes(name) &&
                      selectedToolChoices.length >= maxToolChoices
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
