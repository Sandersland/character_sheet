import { Badge } from "character-sheet-ds";

const row: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

/** All five tones at a glance — the primary variant axis. */
export const Tones = () => (
  <div style={row}>
    <Badge tone="neutral">Wizard</Badge>
    <Badge tone="garnet">Level 5</Badge>
    <Badge tone="arcane">Evocation</Badge>
    <Badge tone="gold">3 / 4 slots</Badge>
    <Badge tone="vitality">Stabilized</Badge>
  </div>
);

/** Realistic header chips: race, class + level, proficiency bonus. */
export const CharacterChips = () => (
  <div style={row}>
    <Badge tone="neutral">Half-Elf</Badge>
    <Badge tone="garnet">Paladin 8</Badge>
    <Badge tone="gold">Prof +3</Badge>
  </div>
);

/** Single status indicator, as used for the backend health pill. */
export const StatusIndicator = () => (
  <Badge tone="vitality">Backend healthy</Badge>
);
