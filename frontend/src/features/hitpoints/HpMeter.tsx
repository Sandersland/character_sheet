import MeterBar from "@/components/ui/MeterBar";

export default function HpMeter({
  current,
  max,
  temp,
  availableDice,
  hitDiceTotal,
  die,
}: {
  current: number;
  max: number;
  temp: number;
  availableDice: number;
  hitDiceTotal: number;
  die: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="font-display text-xl font-semibold leading-none text-garnet-800">
          {current}
          <span className="text-sm font-normal text-parchment-600">
            {" "}
            / {max}
            {temp > 0 && <span className="text-gold-800"> (+{temp} temp)</span>}
          </span>
        </p>
        <span className="text-xs text-parchment-600">
          {availableDice}/{hitDiceTotal}
          {die} available
        </span>
      </div>
      <MeterBar
        current={current}
        max={max}
        tone="garnet"
        label={`${current} of ${max} hit points`}
      />
    </div>
  );
}
