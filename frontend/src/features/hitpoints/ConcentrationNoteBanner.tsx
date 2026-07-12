import type { ConcentrationNote } from "@/features/hitpoints/useHitPointApply";

/** Resolved concentration-save result banner (issue #41, auto-roll path). */
export default function ConcentrationNoteBanner({ note }: { note: ConcentrationNote }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-card border px-3 py-2 text-sm font-semibold ${
        note.held
          ? "border-arcane-300 bg-arcane-50 text-arcane-800"
          : "border-garnet-300 bg-garnet-50 text-garnet-800"
      }`}
    >
      {note.text}
    </div>
  );
}
