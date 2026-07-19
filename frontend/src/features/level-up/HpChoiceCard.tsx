// One of the HP step's two choice cards (average / roll) (#887). Presentational —
// selection state and the values it shows are computed by HitPointsStep.

const CHOICE_BASE =
  "relative rounded-card border border-parchment-300 bg-parchment-50 px-4 py-5 text-center transition-colors hover:bg-parchment-100";
const CHOICE_SEL = "border-garnet-600 ring-2 ring-garnet-50";
const CH = "text-[11px] font-bold uppercase tracking-wide text-parchment-500";
const CBIG = "mt-1.5 font-display text-4xl font-bold";
const CNOTE = "mt-0.5 text-xs text-parchment-500";
const PICK = "absolute right-3 top-3 h-5 w-5 rounded-full border";

export default function HpChoiceCard({
  label,
  value,
  note,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  note: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${CHOICE_BASE} ${selected ? CHOICE_SEL : ""}`}
    >
      <span className={`${PICK} ${selected ? "border-garnet-700 bg-garnet-600" : "border-parchment-300"}`} />
      <div className={CH}>{label}</div>
      <div className={`${CBIG} ${selected ? "text-garnet-700" : "text-parchment-900"}`}>{value}</div>
      <div className={CNOTE}>{note}</div>
    </button>
  );
}
