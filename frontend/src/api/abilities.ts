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
  RollSneakAttackOperation,
  SetQuiveringPalmOperation,
  ShadowArtOperation,
  SneakAttackRollResult,
  StunningStrikeAttemptResult,
  TriggerQuiveringPalmOperation,
  WarriorOfElementsOperation,
  WarriorOfElementsResult,
} from "@/types/character";
import { jsonBody, request } from "@/api/http";
import type { RulesEdition } from "@character-sheet/shared-types";

// The single seam onto the shared ability endpoint (#1275): every automated
// class/subclass feature POSTs the same { operations } batch, choosing the
// feature by URL key rather than by its own route. Generic in the response
// because some abilities return the bare Character and others { character,
// results }; the named wrappers below fix that per feature.
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

// Applies a batch of Warrior of the Elements operations atomically (Elemental
// Attunement toggle, Elemental Burst, Elemental Strikes). Returns the updated
// Character plus a per-op results array (save DC / outcome / applied damage).
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

// Feeds the Warrior of Shadow monk's Shadow Arts picker — the single flat
// 1-focus Darkness cast (2024 rewrite, #1246). `edition` is required for the
// same reason as fetchManeuvers below (#1412).
export async function fetchShadowArts(edition: RulesEdition): Promise<CatalogShadowArt[]> {
  return request<CatalogShadowArt[]>(
    `/shadow-arts?edition=${edition}`,
    undefined,
    "Failed to fetch shadow arts catalog",
  );
}

// Applies a batch of Warrior of Shadow operations atomically: castShadowArt
// (spend 1 focus, concentration) or activateCloakOfShadows (L17: spend 3
// focus, become invisible). Full updated Character returned on success.
export async function applyShadowArtsTransactions(
  characterId: string,
  operations: ShadowArtOperation[]
): Promise<Character> {
  return applyAbilityTransactions(characterId, "shadow-arts", operations, "Failed to apply shadow arts operations");
}

// Feeds the Cleric/Paladin Channel Divinity picker — the entitled options for
// this character (gated per class/subclass/level), each with its save DC + reminder.
export async function fetchChannelDivinity(characterId: string): Promise<CatalogChannelDivinity[]> {
  return request<CatalogChannelDivinity[]>(
    `/characters/${characterId}/channel-divinity`,
    undefined,
    "Failed to fetch Channel Divinity options",
  );
}

// Applies a batch of Channel Divinity operations atomically: castChannelDivinity
// (spend 1 CD charge, apply the option's real side effect). Full updated Character.
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

// Feeds the class-features section's "learn a maneuver" picker. Ordered
// alphabetically server-side; no client-side re-sort needed.
//
// `edition` is required, not optional (#1412): the route 400s without it, so an
// omission is a compile error at every call site rather than a picker that
// silently degrades to empty. Same query-param-not-header reasoning as
// fetchSubclassChoiceOptions below.
export async function fetchManeuvers(edition: RulesEdition): Promise<CatalogManeuver[]> {
  return request<CatalogManeuver[]>(`/maneuvers?edition=${edition}`, undefined, "Failed to fetch maneuver catalog");
}

// Feeds the level-up ceremony's subclassChoice step (choiceConfigForStep, #1422)
// — its only client. A query param, not a header (mirrors fetchReference,
// #1325): there is no Cache-Control in backend/src and Express's weak ETag is
// on, so a header could hand a 2014 payload to a 2024 request. The route
// ignores `edition` today; #1412 makes it required, so it's sent from day one.
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

// Casts a known maneuver: the server spends one superiority die, rolls it, and
// returns the updated Character plus per-op { roll, saveDc } so the caller folds
// the die into the attack/damage total (or reads the announced DC).
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

// Rolls the rogue's level-derived Nd6 Sneak Attack server-side (enforcing the
// once-per-turn + eligibility guard) and returns the updated Character plus the
// roll so the caller folds it into the attack's damage total.
export async function rollSneakAttackTransaction(
  characterId: string,
  eligible: boolean,
  usedThisTurn: boolean,
): Promise<{ character: Character; results: SneakAttackRollResult[] }> {
  return applyAbilityTransactions<RollSneakAttackOperation, { character: Character; results: SneakAttackRollResult[] }>(
    characterId,
    "sneak-attack",
    [{ type: "rollSneakAttack", eligible, usedThisTurn }],
    "Failed to roll Sneak Attack",
  );
}

// Spends 1 focus to attempt Stunning Strike server-side (enforcing the
// once-per-turn guard), rolling the target's Con save against the monk's focus
// DC. Returns the updated Character plus the DC/roll/fail-or-success outcome
// so the caller surfaces the Stunned (fail) or half-speed+advantage (success)
// rider inline (#1242).
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

// Imposes one Flurry-of-Blows rider (Addle/Push/Topple, #1245). Addle never
// rolls (no save); Push/Topple roll a flat d20 vs the monk's focus save DC
// server-side. Returns the updated Character plus the rider/DC/roll/outcome so
// the caller surfaces it inline, mirroring attemptStunningStrikeTransaction.
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

// Spends 4 focus to set Quivering Palm's vibrations (#1245). Returns the
// updated Character plus { active, daysRemaining, summary }.
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

// Ends Quivering Palm's vibrations as a Magic action (#1245): the server rolls
// the target's Constitution save against the monk's focus save DC and halves
// the client-rolled 10d12 total (`roll`) on a success. Returns the updated
// Character plus { dc, saveRoll, outcome, rawDamage, appliedDamage, summary }.
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
