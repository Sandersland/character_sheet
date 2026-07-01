// Shared presentational primitives for the TurnHub slots.

/** A single filled/empty pip representing one economy slot. */
export function SlotPip({ filled }: { filled: boolean }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full border-2 ${
        filled
          ? "border-garnet-700 bg-garnet-700"
          : "border-parchment-400 bg-transparent"
      }`}
      aria-hidden
    />
  );
}

export function QuickBtn({
  onClick,
  disabled,
  children,
  tone = "neutral",
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "garnet" | "neutral" | "arcane" | "gold";
  title?: string;
}) {
  const toneClass =
    tone === "garnet"
      ? "border-garnet-200 bg-garnet-50 text-garnet-700 hover:bg-garnet-100"
      : tone === "arcane"
        ? "border-arcane-200 bg-arcane-50 text-arcane-700 hover:bg-arcane-100"
        : tone === "gold"
          ? "border-gold-300 bg-gold-50 text-gold-800 hover:bg-gold-100"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-control border px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function AttackCounter({
  total,
  used,
  label,
}: {
  total: number;
  used: number;
  label: string;
}) {
  const remaining = total - used;
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-control border border-garnet-200 bg-garnet-50 px-3 py-1.5">
      <span className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              i < used ? "bg-parchment-300" : "bg-garnet-600"
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-medium text-garnet-700">
        {label}: {remaining} of {total} remaining
      </span>
    </div>
  );
}

/** Inline outcome strip shown in the Reaction slot after the reaction is spent. */
export function ReactionResult({
  message,
  tone = "gold",
}: {
  message: string | null;
  tone?: "gold" | "garnet";
}) {
  if (!message) return null;
  const wrapperCls =
    tone === "garnet"
      ? "border-garnet-200 bg-garnet-50 text-garnet-700"
      : "border-gold-200 bg-gold-50 text-gold-800";
  const labelCls = tone === "garnet" ? "text-garnet-600" : "text-gold-800";
  return (
    <div className={`mt-2 rounded-control border px-3 py-2 ${wrapperCls}`}>
      <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${labelCls}`}>
        Reaction used
      </p>
      <p className="text-xs font-semibold leading-snug">{message}</p>
    </div>
  );
}
