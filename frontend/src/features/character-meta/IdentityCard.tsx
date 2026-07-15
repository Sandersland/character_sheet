import Card from "@/components/ui/Card";
import type { Character } from "@/types/character";

// Read-only identity summary (#927): background + alignment name strings off the
// wire. Pure display — no onUpdate, no API. Editable narrative fields land in #930.
export default function IdentityCard({ character }: { character: Character }) {
  return (
    <Card title="Identity" className="p-4">
      <dl className="flex flex-col gap-3">
        <Row label="Background" value={character.background} />
        <Row label="Alignment" value={character.alignment} />
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-parchment-800">{label}</dt>
      <dd className="text-sm text-parchment-600">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
