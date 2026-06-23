import { Card, Badge } from "character-sheet-ds";

const body: React.CSSProperties = {
  padding: 16,
  fontFamily: "var(--font-sans)",
  color: "var(--color-parchment-700)",
  fontSize: 14,
  lineHeight: 1.5,
};

const stat: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 28,
  fontWeight: 600,
  color: "var(--color-parchment-900)",
};

/** Plain surface — no title row, arbitrary content. */
export const Basic = () => (
  <div style={{ width: 320 }}>
    <Card>
      <div style={body}>
        A parchment panel with the shared card radius and soft shadow. Drop any
        content inside as children.
      </div>
    </Card>
  </div>
);

/** Caption-style title row above the content. */
export const WithTitle = () => (
  <div style={{ width: 320 }}>
    <Card title="Hit Points">
      <div style={body}>
        <span style={stat}>27</span>
        <span style={{ color: "var(--color-parchment-500)" }}> / 38</span>
      </div>
    </Card>
  </div>
);

/** Title row with a Badge accessory pinned to the right edge. */
export const WithAccessory = () => (
  <div style={{ width: 320 }}>
    <Card title="Spell Slots" titleAccessory={<Badge tone="gold">Level 3</Badge>}>
      <div style={body}>
        <span style={stat}>3</span>
        <span style={{ color: "var(--color-parchment-500)" }}> / 4 remaining</span>
      </div>
    </Card>
  </div>
);
