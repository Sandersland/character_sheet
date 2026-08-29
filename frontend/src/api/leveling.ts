import type {
  AdvancementOperation,
  Character,
  ClassOperation,
  LevelUpPlanResponse,
  LevelUpSubmission,
  LevelUpTarget,
} from "@/types/character";
import { jsonBody, postTransactions, request } from "@/api/http";

export async function applyClassTransactions(
  characterId: string,
  operations: ClassOperation[]
): Promise<Character> {
  return postTransactions(characterId, "class", operations, "Failed to apply class operations");
}

export async function applyAdvancementTransactions(
  characterId: string,
  operations: AdvancementOperation[]
): Promise<Character> {
  return postTransactions(characterId, "advancement", operations, "Failed to apply advancement operations");
}

// `subclassId` triggers the server-side re-plan for a not-yet-committed
// subclass pick. Read-only — nothing is mutated.
export async function fetchLevelUpPlan(
  characterId: string,
  target: LevelUpTarget,
  subclassId?: string,
): Promise<LevelUpPlanResponse> {
  const params = new URLSearchParams();
  if (target.kind === "existing") params.set("classEntryId", target.classEntryId);
  else params.set("classId", target.classId);
  if (subclassId) params.set("subclassId", subclassId);
  return request<LevelUpPlanResponse>(
    `/characters/${characterId}/level-up/plan?${params.toString()}`,
    undefined,
    "Failed to fetch level-up plan",
  );
}

// Bypasses postTransactions: the body is the LevelUpSubmission verbatim,
// not an { operations } batch.
export async function submitLevelUp(
  characterId: string,
  submission: LevelUpSubmission,
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/level-up/transactions`,
    jsonBody(submission),
    "Failed to apply level-up",
  );
}
