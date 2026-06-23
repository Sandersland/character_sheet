import { Modal, Badge } from "character-sheet-ds";

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  borderBottom: "1px solid var(--color-parchment-200)",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  color: "var(--color-parchment-800)",
};

function Entry({ name, qty, tone }: { name: string; qty: string; tone?: "gold" | "neutral" }) {
  return (
    <div style={rowStyle}>
      <span>{name}</span>
      <Badge tone={tone ?? "neutral"}>{qty}</Badge>
    </div>
  );
}

/**
 * The modal's canonical use: a read-only review surface (the inventory
 * ledger). Always rendered open — mount conditionally and dismiss via onClose.
 */
export const LedgerReview = () => (
  <Modal title="Inventory Ledger" onClose={() => {}}>
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Entry name="Longsword" qty="1" />
      <Entry name="Potion of Healing" qty="x3" tone="gold" />
      <Entry name="Rations (1 day)" qty="x7" tone="gold" />
      <Entry name="Thieves' Tools" qty="1" />
      <Entry name="Gold Pieces" qty="142 gp" tone="gold" />
      <div
        style={{
          marginTop: 16,
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          color: "var(--color-parchment-600)",
        }}
      >
        Press Escape or click outside the panel to close.
      </div>
    </div>
  </Modal>
);
