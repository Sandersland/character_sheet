import type {
  AttemptStunningStrikeOperation,
  CatalogChannelDivinity,
  CatalogManeuver,
  CatalogShadowArt,
  ChannelDivinityOperation,
  Character,
  ImposeOpenHandRiderOperation,
  ManeuverCastResult,
  ManeuverOperation,
  OpenHandRider,
  OpenHandRiderResult,
  QuiveringPalmResult,
  SetQuiveringPalmOperation,
  ShadowArtOperation,
  StunningStrikeAttemptResult,
  TriggerQuiveringPalmOperation,
  WarriorOfElementsOperation,
  WarriorOfElementsResult,
} from "@/types/character";
import { jsonBody, request } from "@/api/http";
import type { RulesEdition } from "@character-sheet/shared-types";

export async function applyAbilityTransactions<TOp, TResponse = Character>(
  characterId: string,
  abilityKey: string,
  operations: TOp[],
  errorLabel: string,
): Promise<TResponse> {
  return request<TResponse>(
    `/characters/${characterId}/abilities/${abilityKey}/transactions`,
    jsonBody({ operations }),
    errorLabel,
  );
}

export async function applyWarriorOfElementsTransactions(
  characterId: string,
  operations: WarriorOfElementsOperation[]
): Promise<{ character: Character; results: WarriorOfElementsResult[] }> {
  return applyAbilityTransactions<WarriorOfElementsOperation, { character: Character; results: WarriorOfElementsResult[] }>(
    characterId,
    "warrior-of-elements",
    operations,
    "Failed to apply Warrior of the Elements operations",
  );
}

export async function fetchShadowArts(edition: RulesEdition): Promise<CatalogShadowArt[]> {
  return request<CatalogShadowArt[]>(
    `/shadow-arts?edition=${edition}`,
    undefined,
    "Failed to fetch shadow arts catalog",
  );
}

export async function applyShadowArtsTransactions(
  characterId: string,
  operations: ShadowArtOperation[]
): Promise<Character> {
  return applyAbilityTransactions(characterId, "shadow-arts", operations, "Failed to apply shadow arts operations");
}

export async function fetchChannelDivinity(characterId: string): Promise<CatalogChannelDivinity[]> {
  return request<CatalogChannelDivinity[]>(
    `/characters/${characterId}/channel-divinity`,
    undefined,
    "Failed to fetch Channel Divinity options",
  );
}

export async function applyChannelDivinityTransactions(
  characterId: string,
  operations: ChannelDivinityOperation[]
): Promise<Character> {
  return applyAbilityTransactions(
    characterId,
    "channel-divinity",
    operations,
    "Failed to apply Channel Divinity operations",
  );
}

// Ordered alphabetically server-side; no client-side re-sort needed.
// `edition` is required (#1412): the route 400s without it, so an omission
// fails at every call site instead of silently returning an empty picker.
export async function fetchManeuvers(edition: RulesEdition): Promise<CatalogManeuver[]> {
  return request<CatalogManeuver[]>(`/maneuvers?edition=${edition}`, undefined, "Failed to fetch maneuver catalog");
}

// A query param, not a header (mirrors fetchReference in api/catalog.ts):
// there is no Cache-Control in backend/src and Express's default weak ETag
// is on, so a header could hand a 2014 payload to a 2024 request.
export async function fetchSubclassChoiceOptions(
  source: string,
  edition: RulesEdition,
): Promise<{ id: string; name: string; description: string; minLevel: number }[]> {
  return request(
    `/subclass-choices/${source}?edition=${edition}`,
    undefined,
    "Failed to fetch subclass choice options",
  );
}

export async function castManeuverTransaction(
  characterId: string,
  operations: ManeuverOperation[],
): Promise<{ character: Character; results: ManeuverCastResult[] }> {
  return applyAbilityTransactions<ManeuverOperation, { character: Character; results: ManeuverCastResult[] }>(
    characterId,
    "maneuvers",
    operations,
    "Failed to cast maneuver",
  );
}

export async function attemptStunningStrikeTransaction(
  characterId: string,
  usedThisTurn: boolean,
): Promise<{ character: Character; results: StunningStrikeAttemptResult[] }> {
  return applyAbilityTransactions<
    AttemptStunningStrikeOperation,
    { character: Character; results: StunningStrikeAttemptResult[] }
  >(
    characterId,
    "stunning-strike",
    [{ type: "attemptStunningStrike", usedThisTurn }],
    "Failed to attempt Stunning Strike",
  );
}

export async function imposeOpenHandRiderTransaction(
  characterId: string,
  rider: OpenHandRider,
  usedThisTurn: boolean,
): Promise<{ character: Character; results: OpenHandRiderResult[] }> {
  return applyAbilityTransactions<
    ImposeOpenHandRiderOperation,
    { character: Character; results: OpenHandRiderResult[] }
  >(
    characterId,
    "open-hand-technique",
    [{ type: "imposeOpenHandRider", rider, usedThisTurn }],
    "Failed to impose Open Hand Technique rider",
  );
}

export async function setQuiveringPalmTransaction(
  characterId: string,
): Promise<{ character: Character; results: QuiveringPalmResult[] }> {
  return applyAbilityTransactions<SetQuiveringPalmOperation, { character: Character; results: QuiveringPalmResult[] }>(
    characterId,
    "quivering-palm",
    [{ type: "setQuiveringPalm" }],
    "Failed to set Quivering Palm",
  );
}

export async function triggerQuiveringPalmTransaction(
  characterId: string,
  roll: number,
): Promise<{ character: Character; results: QuiveringPalmResult[] }> {
  return applyAbilityTransactions<
    TriggerQuiveringPalmOperation,
    { character: Character; results: QuiveringPalmResult[] }
  >(
    characterId,
    "quivering-palm",
    [{ type: "triggerQuiveringPalm", roll }],
    "Failed to trigger Quivering Palm",
  );
}
