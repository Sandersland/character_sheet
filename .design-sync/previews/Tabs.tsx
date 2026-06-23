import { useState } from "react";
import { Tabs } from "character-sheet-ds";

/** Section switcher with count badges — the dominant in-app use. */
export const SectionSwitcher = () => {
  const [active, setActive] = useState("stats");
  return (
    <div style={{ width: 440 }}>
      <Tabs
        active={active}
        onChange={setActive}
        tabs={[
          { id: "stats", label: "Stats" },
          { id: "inventory", label: "Inventory", badge: 12 },
          { id: "spells", label: "Spells", badge: 4 },
        ]}
      />
    </div>
  );
};

/** Minimal two-tab switcher, no badges. */
export const TwoTabs = () => {
  const [active, setActive] = useState("log");
  return (
    <div style={{ width: 300 }}>
      <Tabs
        active={active}
        onChange={setActive}
        tabs={[
          { id: "summary", label: "Summary" },
          { id: "log", label: "Session Log" },
        ]}
      />
    </div>
  );
};
