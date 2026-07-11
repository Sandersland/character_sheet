// Decorative initiative / turn-order rail (#737), gated behind the `showInitiative`
// flag. There is no real turn-order model yet (epic #728, Decision #1), so this
// renders STATIC placeholder order with the current player inserted as "you".
// When a server-side initiative system lands, swap the static list for real
// combatants; the layout stays.

interface RailEntry {
  /** Single-letter avatar glyph. */
  initial: string;
  /** Initiative roll shown as a corner badge. */
  init: number;
  /** Under-avatar caption (e.g. "acting", "on deck", "you", "enemy"). */
  caption?: string;
  tone: "ally" | "you" | "enemy";
}

const TONE_RING: Record<RailEntry["tone"], string> = {
  ally: "border-parchment-300 bg-parchment-100 text-parchment-600",
  you: "border-arcane-500 bg-arcane-100 text-arcane-800",
  enemy: "border-garnet-400 border-dashed bg-garnet-50 text-garnet-700",
};

/**
 * `you` marks the current player's avatar (initial from their name); `active`
 * captions them "acting" on their own turn vs "on deck" while waiting.
 */
export default function InitiativeRail({
  youInitial,
  active,
}: {
  youInitial: string;
  active: boolean;
}) {
  const entries: RailEntry[] = [
    { initial: "M", init: 19, tone: "ally" },
    { initial: "G", init: 17, caption: active ? undefined : "acting", tone: "ally" },
    { initial: youInitial, init: 15, caption: active ? "acting" : "on deck", tone: "you" },
    { initial: "B", init: 12, tone: "ally" },
    { initial: "g", init: 8, caption: "enemy", tone: "enemy" },
  ];

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-parchment-500">
        Round · initiative
      </p>
      <ol className="flex items-start gap-3 overflow-x-auto pb-1">
        {entries.map((e, i) => (
          <li key={i} className="flex shrink-0 flex-col items-center gap-1">
            <span className="relative">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold ${TONE_RING[e.tone]}`}
              >
                {e.initial}
              </span>
              <span className="absolute -right-1 -top-1 rounded-full bg-parchment-900 px-1 text-[9px] font-bold text-parchment-50">
                {e.init}
              </span>
            </span>
            {e.caption && (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-parchment-500">
                {e.caption}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
