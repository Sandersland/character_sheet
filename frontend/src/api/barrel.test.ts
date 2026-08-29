import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as barrel from "@/api/client";

// EXPECTED_EXPORTS pins api/'s exact public surface (#1270) — add a new
// export here on purpose, not by accident.
const EXPECTED_EXPORTS = [
  "addCharacterToCampaign",
  "advanceCombatRound",
  "dismissInboxFlag",
  "applyAbilityTransactions",
  "applyActionTransactions",
  "applyAdvancementTransactions",
  "applyChannelDivinityTransactions",
  "applyClassTransactions",
  "applyConditionTransactions",
  "applyExperienceOperations",
  "applyHitPointOperations",
  "applyInventoryTransactions",
  "applyResolveActionOperations",
  "applyResourceTransactions",
  "applyShadowArtsTransactions",
  "applySpellcastingTransactions",
  "applyWarriorOfElementsTransactions",
  "attemptStunningStrikeTransaction",
  "awardCampaignItem",
  "bondWeaponTransaction",
  "castDisciplineTransaction",
  "castManeuverTransaction",
  "checkHealth",
  "combineEntities",
  "createCampaign",
  "createCampaignItem",
  "createCharacter",
  "createCustomSpell",
  "createEntity",
  "createJournalEntry",
  "deleteCampaign",
  "deleteCampaignItem",
  "deleteCharacter",
  "deleteCharacterPortrait",
  "deleteCustomSpell",
  "deleteEntity",
  "deleteEntityPortrait",
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
  "fetchCombatState",
  "fetchDisciplines",
  "fetchEditions",
  "fetchEntities",
  "fetchEntityActivity",
  "fetchEntityBacklinks",
  "fetchEntityConnections",
  "fetchEntityMerges",
  "fetchFeats",
  "fetchInbox",
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
  "fetchSubclassChoiceOptions",
  "forkCatalogEntry",
  "imposeOpenHandRiderTransaction",
  "joinCampaign",
  "joinSession",
  "leaveSession",
  "logout",
  "logRollAction",
  "patchPreferences",
  "prepareEntityMerge",
  "revertBatch",
  "revokeCampaignItem",
  "rollInitiativeTransaction",
  "setQuiveringPalmTransaction",
  "setUnauthorizedHandler",
  "shareCatalogEntry",
  "startCampaignSession",
  "startCombat",
  "startSoloSession",
  "submitLevelUp",
  "triggerQuiveringPalmTransaction",
  "unbondWeaponTransaction",
  "unmergeEntityMerge",
  "unshareCatalogEntry",
  "updateCampaignItem",
  "updateCampaignPreferences",
  "updateCharacter",
  "updateCustomSpell",
  "updateEntity",
  "updateJournalEntry",
  "updateSessionTitle",
  "uploadCharacterPortrait",
  "uploadEntityPortrait",
].sort();

const API_DIR = join(dirname(fileURLToPath(import.meta.url)));

function apiSourceFiles(): string[] {
  return readdirSync(API_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

describe("api barrel surface", () => {
  it("exports exactly the 108 documented names", () => {
    const actual = Object.keys(barrel).sort();
    expect(actual).toEqual(EXPECTED_EXPORTS);
  });

  // Keeps the domain cut from collapsing back into one file.
  it("every module in frontend/src/api/ is <= 250 lines", () => {
    const oversized = apiSourceFiles()
      .map((f) => ({ f, lines: readFileSync(join(API_DIR, f), "utf8").split("\n").length }))
      .filter(({ lines }) => lines > 250);

    expect(oversized).toEqual([]);
  });

  // A function body here would let call sites import behavior from the
  // barrel — the exact convergence point #1270 removed.
  it("client.ts is a pure barrel — declares no functions", () => {
    const source = readFileSync(join(API_DIR, "client.ts"), "utf8");
    expect(source).not.toMatch(/\bfunction\b/);
  });

  // Makes CLAUDE.md's fetch-only-in-api-layer rule machine-checkable.
  it("only api/http.ts calls fetch(...)", () => {
    const offenders = apiSourceFiles()
      .filter((f) => f !== "http.ts")
      .filter((f) => /\bfetch\(/.test(readFileSync(join(API_DIR, f), "utf8")));

    expect(offenders).toEqual([]);
  });
});
