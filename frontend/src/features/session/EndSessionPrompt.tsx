/**
 * EndSessionPrompt — interruptive confirm dialog shown when ending a session.
 * Per the inline-vs-Modal rule this is a focused, blocking flow (not a row-bound
 * edit), so it uses the Modal primitive.
 *
 * It collects an OPTIONAL XP award for the session. On confirm the parent awards
 * the XP (tagged to the active session, so it flows into the recap's xpGained)
 * BEFORE ending the session. A blank / 0 amount ends cleanly with no award.
 */

import { useState } from "react";

import Modal from "@/components/ui/Modal";

interface EndSessionPromptProps {
  busy: boolean;
  /** Error from the last attempt, if any (e.g. endSession failed). */
  error?: string | null;
  /** Confirm with the parsed XP amount (0 = skip / no award). */
  onConfirm: (xpAmount: number) => void;
  onCancel: () => void;
}

export default function EndSessionPrompt({
  busy,
  error,
  onConfirm,
  onCancel,
}: EndSessionPromptProps) {
  const [xp, setXp] = useState("");

  // Empty input → 0 (skip). Only non-negative integers are awardable here.
  const parsed = xp.trim() === "" ? 0 : Number(xp);
  const valid = Number.isInteger(parsed) && parsed >= 0;

  function handleConfirm() {
    if (!valid || busy) return;
    onConfirm(parsed);
  }

  const inputCls =
    "w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

  return (
    <Modal title="End Session" onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-parchment-700">
          Ending the session will close it out and show your recap. Record any XP the DM
          awarded for this session below — or leave it blank to skip.
        </p>

        <div>
          <label htmlFor="end-session-xp" className="block text-xs font-semibold text-parchment-700">
            Award XP for this session
          </label>
          <input
            id="end-session-xp"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className={`${inputCls} mt-1`}
            value={xp}
            onChange={(e) => setXp(e.target.value)}
            placeholder="0"
            disabled={busy}
          />
          {!valid && (
            <p className="mt-1 text-xs font-semibold text-garnet-700">
              Enter a whole number of XP (0 or more).
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs font-semibold text-garnet-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!valid || busy}
            className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
          >
            {busy ? "Ending…" : parsed > 0 ? `End & award ${parsed.toLocaleString()} XP` : "End session"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
