// Spellcasting orchestration state + op handlers for SpellsSection. Feature-local
// (not a shared hook): batches ops through applySpellcastingTransactions and owns
// busy/error/castResult/panel state. Pure cast planning lives in lib/spellCast.
import { useState } from "react";

import { applySpellcastingTransactions } from "@/api/client";
import { planCast, type CastResult } from "@/lib/spellCast";
import type {
  Character,
  LearnSpellOperation,
  Spell,
  SpellcastingOperation,
} from "@/types/character";

export function useSpellcasting(character: Character, onUpdate: (c: Character) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [castResult, setCastResult] = useState<CastResult | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  async function send(ops: SpellcastingOperation[]) {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await applySpellcastingTransactions(character.id, ops));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleCast(spell: Spell, slotLevel?: number) {
    const { ops, result } = planCast(spell, character, slotLevel);
    if (result) setCastResult(result);
    if (ops.length) send(ops);
  }

  function handlePrepare(spell: Spell) {
    send([{ type: spell.prepared ? "unprepareSpell" : "prepareSpell", entryId: spell.id }]);
  }

  function handleForget(spell: Spell) {
    if (!confirm(`Remove ${spell.name} from your spellbook?`)) return;
    send([{ type: "forgetSpell", entryId: spell.id }]);
  }

  // Keep the panel open so multiple spells can be learned in one session.
  function handleLearn(op: LearnSpellOperation) {
    send([op]);
  }

  return {
    busy, error, castResult, addPanelOpen,
    setCastResult, setAddPanelOpen, send,
    handleCast, handlePrepare, handleForget, handleLearn,
  };
}
