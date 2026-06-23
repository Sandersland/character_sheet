import { MeterBar } from "character-sheet-ds";

type Tone = "garnet" | "arcane" | "gold";

const labelRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-parchment-700)",
  marginBottom: 4,
};

function Meter({
  label,
  current,
  max,
  tone,
}: {
  label: string;
  current: number;
  max: number;
  tone: Tone;
}) {
  return (
    <div>
      <div style={labelRow}>
        <span>{label}</span>
        <span>
          {current} / {max}
        </span>
      </div>
      <MeterBar current={current} max={max} tone={tone} label={label} />
    </div>
  );
}

/** The three tones on real resources — color plus the numeric value as text. */
export const Resources = () => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}
  >
    <Meter label="Hit Points" current={27} max={38} tone="garnet" />
    <Meter label="Spell Slots" current={3} max={4} tone="arcane" />
    <Meter label="Ki Points" current={5} max={6} tone="gold" />
  </div>
);

/** Fill levels from empty to full (garnet HP). */
export const FillLevels = () => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}
  >
    <Meter label="Bloodied" current={6} max={38} tone="garnet" />
    <Meter label="Wounded" current={19} max={38} tone="garnet" />
    <Meter label="Full" current={38} max={38} tone="garnet" />
  </div>
);
