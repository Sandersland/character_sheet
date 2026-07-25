import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as barrel from "@/api/client";

// #1270: locks the post-split shape of frontend/src/api/ so the domain cut
// can't silently regress back into one file, and so client.ts can't grow a
// function body again. The 86-name list is the exact public surface today —
// changing it on purpose (new endpoint) means editing this list on purpose.
const EXPECTED_EXPORTS = [
  "addCharacterToCampaign",
  "advanceCombatRound",
  "applyAbilityTransactions",
  "applyActionTransactions",
  "applyAdvancementTransactions",
  "applyChannelDivinityTransactions",
  "applyClassTransactions",
  "applyConditionTransactions",
  "applyExperienceOperations",
  "applyHitPointOperations",
  "applyInventoryTransactions",
  "applyResourceTransactions",
  "applyShadowArtsTransactions",
  "applySpellcastingTransactions",
  "applyWarriorOfElementsTransactions",
  "attemptStunningStrikeTransaction",
  "awardCampaignItem",
  "castManeuverTransaction",
  "checkHealth",
  "createCampaign",
  "createCampaignItem",
  "createCharacter",
  "createEntity",
  "createJournalEntry",
  "deleteCampaignItem",
  "deleteCharacter",
  "deleteEntity",
  "deleteJournalEntry",
  "endCombat",
  "endSession",
  "endSoloSession",
  "executeEntityMerge",
  "fetchActiveSession",
  "fetchActivity",
  "fetchAuthProviders",
  "fetchCampaign",
  "fetchCampaignArcs",
  "fetchCampaignItemByEntity",
  "fetchCampaignItems",
  "fetchCampaigns",
  "fetchCampaignSessions",
  "fetchChannelDivinity",
  "fetchCharacter",
  "fetchCharacters",
  "fetchChronicleSessions",
  "fetchEntities",
  "fetchEntityActivity",
  "fetchEntityBacklinks",
  "fetchEntityConnections",
  "fetchEntityMerges",
  "fetchFeats",
  "fetchItems",
  "fetchLevelUpPlan",
  "fetchManeuvers",
  "fetchMe",
  "fetchReference",
  "fetchSession",
  "fetchSessionDoorway",
  "fetchSessions",
  "fetchShadowArts",
  "fetchSpells",
  "imposeOpenHandRiderTransaction",
  "joinCampaign",
  "joinSession",
  "leaveSession",
  "logout",
  "logRoll",
  "prepareEntityMerge",
  "revertBatch",
  "revokeCampaignItem",
  "rollInitiativeTransaction",
  "rollSneakAttackTransaction",
  "setQuiveringPalmTransaction",
  "setUnauthorizedHandler",
  "startCampaignSession",
  "startCombat",
  "startSoloSession",
  "submitLevelUp",
  "triggerQuiveringPalmTransaction",
  "unmergeEntityMerge",
  "updateCampaignItem",
  "updateCampaignPreferences",
  "updateCharacter",
  "updateEntity",
  "updateJournalEntry",
  "updateSessionTitle",
].sort();

const API_DIR = join(dirname(fileURLToPath(import.meta.url)));

function apiSourceFiles(): string[] {
  return readdirSync(API_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

// PIN (passes today): the exact export set, so a dropped `export *` in any
// domain-move commit fails loudly instead of silently shrinking the barrel.
describe("api barrel surface", () => {
  it("exports exactly the 86 documented names", () => {
    const actual = Object.keys(barrel).sort();
    expect(actual).toEqual(EXPECTED_EXPORTS);
  });

  // RED today: client.ts is 1,137 lines. Green once the split lands.
  it("every module in frontend/src/api/ is <= 250 lines", () => {
    const oversized = apiSourceFiles()
      .map((f) => ({ f, lines: readFileSync(join(API_DIR, f), "utf8").split("\n").length }))
      .filter(({ lines }) => lines > 250);

    expect(oversized).toEqual([]);
  });

  // RED today: client.ts still declares every function body. Green once C11
  // reduces it to re-export statements only.
  it("client.ts is a pure barrel — declares no functions", () => {
    const source = readFileSync(join(API_DIR, "client.ts"), "utf8");
    expect(source).not.toMatch(/\bfunction\b/);
  });

  // RED today: apiFetch's call plus fetchMe's raw un-hooked probe both live in
  // client.ts. Green once both move behind http.ts's apiFetch/rawFetch — makes
  // CLAUDE.md's "fetch only touches api/" invariant machine-checkable.
  it("only api/http.ts calls fetch(...)", () => {
    const offenders = apiSourceFiles()
      .filter((f) => f !== "http.ts")
      .filter((f) => /\bfetch\(/.test(readFileSync(join(API_DIR, f), "utf8")));

    expect(offenders).toEqual([]);
  });
});
