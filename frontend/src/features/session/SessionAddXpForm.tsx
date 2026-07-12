import { useState } from "react";

import { applyExperienceOperations, fetchSession } from "@/api/client";
import type { Character, Session } from "@/types/character";

// "Add XP to this session" — awards XP tagged to this (already-ended) session
// via the explicit-sessionId override, then refreshes the session so the
// participant's stats + the recap update in place.
export default function SessionAddXpForm({
  characterId,
  sessionId,
  onAwarded,
  onCharacterUpdate,
}: {
  characterId: string;
  sessionId: string;
  onAwarded: (session: Session) => void;
  onCharacterUpdate?: (character: Character) => void;
}) {
  const [open, setOpen] = useState(false);
  const [xp, setXp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(xp);
  const valid = xp.trim() !== "" && Number.isInteger(parsed) && parsed > 0;

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await applyExperienceOperations(
        characterId,
        [{ type: "award", amount: parsed }],
        sessionId,
      );
      onCharacterUpdate?.(updated);
      // Re-fetch the session to pick up its freshly recomputed summaries.
      const refreshed = await fetchSession(characterId, sessionId);
      onAwarded(refreshed);
      setXp("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to award XP.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-semibold text-garnet-700 hover:underline"
      >
        + Add XP to this session
      </button>
    );
  }

  // text-base at mobile widths keeps the XP field ≥16px so iOS Safari doesn't auto-zoom on focus.
  const inputCls =
    "w-28 rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-base md:text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="retro-xp" className="block text-xs font-semibold text-parchment-700">
            Award XP
          </label>
          <input
            id="retro-xp"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className={`${inputCls} mt-1`}
            value={xp}
            onChange={(e) => setXp(e.target.value)}
            placeholder="0"
            disabled={busy}
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid || busy}
          className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
        >
          {busy ? "Awarding…" : "Award"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-parchment-600">
        This session is closed, so the award is permanent — it can't be undone.
      </p>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}
