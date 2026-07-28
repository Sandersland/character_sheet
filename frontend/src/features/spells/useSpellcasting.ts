// Spellcasting orchestration state + op handlers for SpellsSection. Feature-local
// (not a shared hook): batches ops through applySpellcastingTransactions and owns
// busy/error/castResult/panel state. Pure cast planning lives in spellCast.
import { useState } from "react";

import { applySpellcastingTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { planCast, type CastResult } from "@/lib/spellCast";
import { canPrepare, preparedBudget } from "@/lib/spellList";
import type {
  Character,
  LearnSpellOperation,
  Spell,
  SpellcastingOperation,
} from "@/types/character";

export function useSpellcasting(character: Character) {
  const [castResult, setCastResult] = useState<CastResult | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  // The prepared-cap pre-block fires before any request is sent, so it needs
  // its own slot — a mutation's error only clears on its NEXT mutate() call.
  const [prepareCapError, setPrepareCapError] = useState<string | null>(null);

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: SpellcastingOperation[]) => applySpellcastingTransactions(character.id, ops),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
  });

  async function send(ops: SpellcastingOperation[]) {
    setPrepareCapError(null);
    try {
      await mutation.mutateAsync(ops);
    } catch {
      // mutation.error already carries the message.
    }
  }

  function handleCast(spell: Spell, slotLevel?: number) {
    const { ops, result } = planCast(spell, slotLevel);
    if (result) setCastResult(result);
    if (ops.length) send(ops);
  }

  function handlePrepare(spell: Spell) {
    if (spell.prepared) {
      send([{ type: "unprepareSpell", entryId: spell.id }]);
      return;
    }
    // Optimistic pre-block at the derived cap (#883); the server enforces it too.
    const budget = preparedBudget(character.spellcasting!);
    if (!canPrepare(spell, budget)) {
      setPrepareCapError(`You can prepare at most ${budget.limit} spells.`);
      return;
    }
    send([{ type: "prepareSpell", entryId: spell.id }]);
  }

  // Swap = unprepare one + prepare another in a single atomic batch.
  function handleSwap(dropId: string, addId: string) {
    send([
      { type: "unprepareSpell", entryId: dropId },
      { type: "prepareSpell", entryId: addId },
    ]);
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
    busy: mutation.isPending, error: prepareCapError ?? mutation.error, castResult, addPanelOpen,
    setCastResult, setAddPanelOpen, send,
    handleCast, handlePrepare, handleForget, handleLearn, handleSwap,
  };
}
