import type { Character } from "@/types/character";
import { postTransactions } from "@/api/http";
import type { ResolveActionEventData, RollEventData } from "@character-sheet/shared-types";

export interface ResolveActionOperation extends ResolveActionEventData {
  type: "resolveAction";
}

export interface ResolveActionResult {
  character: Character;
  batchId: string;
}

export async function applyResolveActionOperations(
  characterId: string,
  operations: ResolveActionOperation[],
): Promise<ResolveActionResult> {
  const { batchId, ...character } = await postTransactions<
    ResolveActionOperation,
    Character & { batchId: string }
  >(characterId, "resolve-action", operations, "Failed to resolve action");
  return { character, batchId };
}

interface LogRollOperation extends Omit<RollEventData, "target" | "outcome"> {
  type: "logRoll";
}

export async function logRollAction(
  characterId: string,
  roll: Omit<RollEventData, "target" | "outcome">,
): Promise<Character> {
  const op: LogRollOperation = { type: "logRoll", ...roll };
  return postTransactions(characterId, "resolve-action", [op], "Failed to log roll");
}
