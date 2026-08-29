import { useState } from "react";

import Segmented from "@/components/ui/Segmented";
import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";

export default function SpellPickerTabs({ groups }: { groups: SpellPickerGroup[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (groups.length <= 1) return <SpellPicker groups={groups} />;

  const index = Math.min(activeIndex, groups.length - 1);
  const options = groups.map((g, i) => ({
    value: String(i),
    label: `${g.label} ${g.selectedIds.length}/${g.cap}${g.selectedIds.length === g.cap ? " ✓" : ""}`,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Segmented
        options={options}
        value={String(index)}
        onChange={(value) => setActiveIndex(Number(value))}
        label="Spell group"
        className="shrink-0"
      />
      {/* headline="" suppresses SpellPicker's own default so the count isn't printed twice; the segment caption above already shows it. */}
      <SpellPicker groups={[groups[index]]} headline="" />
    </div>
  );
}
