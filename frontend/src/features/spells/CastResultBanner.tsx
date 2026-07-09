// Inline result banner shown immediately after a cast.
import type { CastResult } from "@/lib/spellCast";

interface CastResultBannerProps {
  result: CastResult;
  onDismiss: () => void;
}

export default function CastResultBanner({ result, onDismiss }: CastResultBannerProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-control px-4 py-3 ${
        result.effectKind === "heal"
          ? "bg-vitality-50 text-vitality-800"
          : "bg-garnet-50 text-garnet-800"
      }`}
    >
      <div>
        <p className="text-sm font-semibold">
          {result.spellName}
          {result.slotLevel ? ` (L${result.slotLevel})` : ""}
          {" — "}
          <span className="font-display text-lg">{result.total}</span>{" "}
          {result.effectKind === "heal" ? "healing" : `${result.damageType ?? ""} damage`}
        </p>
        <p className="text-xs opacity-70">{result.diceStr}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-4 text-sm opacity-60 hover:opacity-100"
        aria-label="Dismiss roll result"
      >
        ✕
      </button>
    </div>
  );
}
