import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as barrel from "@/api/client";

// #1270: locks the post-split shape of frontend/src/api/ so the domain cut
// can't silently regress back into one file, and so client.ts can't grow a
// function body again. The 106-name list is the exact public surface today —
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

// PIN (passes today): the exact export set, so a dropped `export *` in any
// domain-move commit fails loudly instead of silently shrinking the barrel.
describe("api barrel surface", () => {
  it("exports exactly the 106 documented names", () => {
    const actual = Object.keys(barrel).sort();
    expect(actual).toEqual(EXPECTED_EXPORTS);
  });

  // Keeps the domain cut from collapsing back toward one file — the ceiling is
  // what makes a growing module split instead of absorb.
  it("every module in frontend/src/api/ is <= 250 lines", () => {
    const oversized = apiSourceFiles()
      .map((f) => ({ f, lines: readFileSync(join(API_DIR, f), "utf8").split("\n").length }))
      .filter(({ lines }) => lines > 250);

    expect(oversized).toEqual([]);
  });

  // A function body here means a call site could start importing behaviour from
  // the barrel, which is what re-creates the convergence point #1270 removed.
  it("client.ts is a pure barrel — declares no functions", () => {
    const source = readFileSync(join(API_DIR, "client.ts"), "utf8");
    expect(source).not.toMatch(/\bfunction\b/);
  });

  // Makes CLAUDE.md's "fetch only touches the API layer" invariant machine-
  // checkable: one chokepoint means the 401 handler and credentials mode can
  // never be bypassed by a domain module reaching for fetch directly.
  it("only api/http.ts calls fetch(...)", () => {
    const offenders = apiSourceFiles()
      .filter((f) => f !== "http.ts")
      .filter((f) => /\bfetch\(/.test(readFileSync(join(API_DIR, f), "utf8")));

    expect(offenders).toEqual([]);
  });
});
