// #1778: exactly one full-height SpellPicker visible at a time. Stacking two
// independent SpellPickers (each `flex-1 … overflow-y-auto`) split the card's
// height between them — fine with one group, but a species cantrip group
// collapsed both to ~1 visible row. A segmented control swaps between groups
// instead of scrolling them side by side. Presentational only: it owns just
// the active-tab index, no fetching or eligibility logic.
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
      {/* The segment caption above already carries this group's selected/cap —
          an empty override suppresses SpellPicker's own default headline so
          the count isn't printed twice. */}
      <SpellPicker groups={[groups[index]]} headline="" />
    </div>
  );
}
