import Card from "@/components/ui/Card";
import { formatModifier } from "@/lib/abilities";

interface PreviewSectionProps {
  armorClass: number;
  dexModifier: number;
  speed: number | undefined;
  maxHp: number | undefined;
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-parchment-600">{label}</p>
      <p className="font-display text-xl text-garnet-800">{value}</p>
    </div>
  );
}

export default function PreviewSection({ armorClass, dexModifier, speed, maxHp }: PreviewSectionProps) {
  return (
    <Card
      title="Preview"
      headingLevel={2}
      titleAccessory={<span className="text-xs text-parchment-600">Level 1</span>}
    >
      <div className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
        <Stat label="Armor Class" value={String(armorClass)} />
        <Stat label="Initiative" value={formatModifier(dexModifier)} />
        <Stat label="Speed" value={speed !== undefined ? `${speed} ft` : "—"} />
        <Stat label="Hit Points" value={maxHp !== undefined ? String(maxHp) : "—"} />
      </div>
    </Card>
  );
}
