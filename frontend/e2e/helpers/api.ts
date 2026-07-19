import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Per-spec fixtures: create throwaway characters and seed their domain state
// through the same REST endpoints the app uses. Callers pass page.request after
// login(page), so the cs_session cookie rides along with every call.
//
// A unique-name suffix keeps repeat runs from colliding and keeps each spec's
// character distinct from the shared globalSetup roster.

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 14,
  intelligence: 16,
  wisdom: 12,
  charisma: 8,
};

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

// Navigate to a character sheet, optionally landing on a specific workspace tab.
// Since #922 the sheet is a tabbed workspace whose active tab lives in the `?tab=`
// query param (default: overview); a spec that drives a now-tabbed section
// (combat HP/conditions, inventory, magic/spells, story) must target its tab.
export async function gotoSheet(
  page: Page,
  id: string,
  tab?: "overview" | "combat" | "inventory" | "magic" | "story",
): Promise<void> {
  await page.goto(`/characters/${id}${tab ? `?tab=${tab}` : ""}`);
}

// Land on the live Combat tab for a session persona. Not joined yet → click the
// doorway (Start/Resume/Join). Already joined (a shared roster persona joined by
// an earlier spec) → mobile keeps its live pill (aria-label "… go to fight"), so
// click that; desktop dropped its under-tabs "Go to fight" strip (#1085), so fall
// back to the Combat tab there. Either path lands the workspace on ?tab=combat.
export async function enterLiveCombat(page: Page): Promise<void> {
  const entry = page
    .getByRole("button", { name: /(Start|Resume|Join) session|go to fight/i })
    .first();
  // Desktop-joined shows no entry button; the banner's End Session marks the state.
  const joinedDesktop = page.getByRole("button", { name: /End Session/i }).first();
  await expect(entry.or(joinedDesktop)).toBeVisible();
  if (await entry.isVisible()) {
    await entry.click();
  } else {
    await page.getByRole("tab", { name: /^Combat/ }).click();
  }
  await expect(page).toHaveURL(/[?&]tab=combat/);
}

// The Magic tab is two mutually-exclusive views: the record block (quick-cast +
// slot pips) and the grimoire (full spellbook rows: prepare/cast/forget). The
// spellbook rows live only in the grimoire — open it via "Manage spellbook →"
// before interacting with a spell row, and close it via "Done" to read the
// record's slot pips again.
export async function openSpellbook(page: Page): Promise<void> {
  await page.getByRole("button", { name: /manage spellbook/i }).click();
}

export async function closeSpellbook(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^done$/i }).click();
}

type AbilityScores = typeof ABILITY_SCORES;

interface CreateCharacterOpts {
  name: string;
  className: string;
  race?: string;
  background?: string;
  experiencePoints?: number;
  // Override the module-level defaults, e.g. Wis 16 for a monk / Con 15 for a barbarian.
  abilityScores?: Partial<AbilityScores>;
}

// Create a character and return its id. Sets XP through the transactions
// endpoint so level/proficiency/slots derive server-side.
export async function createCharacter(
  request: APIRequestContext,
  opts: CreateCharacterOpts,
): Promise<string> {
  const response = await request.post("/api/characters", {
    data: {
      name: opts.name,
      alignment: "True Neutral",
      race: opts.race ?? "Human",
      background: opts.background ?? "Sage",
      classes: [{ name: opts.className }],
      abilityScores: { ...ABILITY_SCORES, ...opts.abilityScores },
    },
  });
  expect(response.ok(), `create ${opts.name}: ${response.status()}`).toBeTruthy();
  const { id } = (await response.json()) as { id: string };

  if (opts.experiencePoints) {
    await setExperience(request, id, opts.experiencePoints);
  }
  return id;
}

export async function setExperience(
  request: APIRequestContext,
  characterId: string,
  value: number,
): Promise<void> {
  const response = await request.post(`/api/characters/${characterId}/experience`, {
    data: { operations: [{ type: "set", value }] },
  });
  expect(response.ok(), `set XP: ${response.status()}`).toBeTruthy();
}

// Create a fresh character already attached to its own new campaign, so it can
// start a live session in-spec without touching the shared roster's campaigns.
export async function createSessionCharacter(
  request: APIRequestContext,
  opts: CreateCharacterOpts,
): Promise<string> {
  const characterId = await createCharacter(request, opts);
  const campaignResponse = await request.post("/api/campaigns", {
    data: { name: uniqueName("E2E Campaign") },
  });
  expect(campaignResponse.ok(), `create campaign: ${campaignResponse.status()}`).toBeTruthy();
  const { id: campaignId } = (await campaignResponse.json()) as { id: string };

  const attachResponse = await request.post(`/api/campaigns/${campaignId}/characters`, {
    data: { characterId },
  });
  expect(attachResponse.ok(), `attach character: ${attachResponse.status()}`).toBeTruthy();
  return characterId;
}

// Resolve a shared persona's id by exact name (roster personas are unique).
export async function findCharacterByName(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const response = await request.get("/api/characters");
  expect(response.ok(), `list characters: ${response.status()}`).toBeTruthy();
  const characters = (await response.json()) as { id: string; name: string }[];
  const match = characters.find((c) => c.name === name);
  expect(match, `persona not found: ${name}`).toBeTruthy();
  return match!.id;
}

// Restore a class resource pool (e.g. superiorityDice) to full so a shared
// persona's spend flow is deterministic regardless of leftover state.
export async function restoreResourcePool(
  request: APIRequestContext,
  characterId: string,
  key: string,
): Promise<void> {
  const response = await request.get(`/api/characters/${characterId}`);
  expect(response.ok(), `load character: ${response.status()}`).toBeTruthy();
  const character = (await response.json()) as {
    resources?: { pools?: { key: string; total: number; remaining: number }[] };
  };
  const pool = character.resources?.pools?.find((p) => p.key === key);
  const spent = pool ? pool.total - pool.remaining : 0;
  if (spent <= 0) return;
  const restoreResponse = await request.post(`/api/characters/${characterId}/resources/transactions`, {
    data: { operations: [{ type: "restoreResource", key, amount: spent }] },
  });
  expect(restoreResponse.ok(), `restore ${key}: ${restoreResponse.status()}`).toBeTruthy();
}

// Teach a shared persona a catalog maneuver by name (idempotent — skips if the
// maneuver is already known), so a spec can drive an attackRoll/damageRoll
// maneuver the seeded roster doesn't include. Mirrors global-setup's seedManeuver.
export async function learnManeuver(
  request: APIRequestContext,
  characterId: string,
  maneuverName: string,
): Promise<void> {
  const loaded = await request.get(`/api/characters/${characterId}`);
  expect(loaded.ok(), `load character: ${loaded.status()}`).toBeTruthy();
  const character = (await loaded.json()) as {
    resources?: { maneuversKnown?: { name: string }[] };
  };
  if (character.resources?.maneuversKnown?.some((m) => m.name === maneuverName)) return;

  const catalogResponse = await request.get("/api/maneuvers");
  expect(catalogResponse.ok(), `list maneuvers: ${catalogResponse.status()}`).toBeTruthy();
  const catalog = (await catalogResponse.json()) as { id: string; name: string }[];
  const match = catalog.find((m) => m.name === maneuverName);
  expect(match, `maneuver not in catalog: ${maneuverName}`).toBeTruthy();

  const learnResponse = await request.post(`/api/characters/${characterId}/resources/transactions`, {
    data: { operations: [{ type: "learnManeuver", maneuverId: match!.id }] },
  });
  expect(learnResponse.ok(), `learn ${maneuverName}: ${learnResponse.status()}`).toBeTruthy();
}

// Clear a status condition from a shared persona so its apply flow is
// deterministic regardless of leftover state. No-op when the key isn't active
// (removeCondition errors on an absent key), mirroring restoreResourcePool.
export async function removeCondition(
  request: APIRequestContext,
  characterId: string,
  key: string,
): Promise<void> {
  const response = await request.get(`/api/characters/${characterId}`);
  expect(response.ok(), `load character: ${response.status()}`).toBeTruthy();
  const character = (await response.json()) as {
    conditions?: { active?: { key: string }[] };
  };
  if (!character.conditions?.active?.some((c) => c.key === key)) return;
  const removeResponse = await request.post(`/api/characters/${characterId}/conditions/transactions`, {
    data: { operations: [{ type: "removeCondition", key }] },
  });
  expect(removeResponse.ok(), `remove condition ${key}: ${removeResponse.status()}`).toBeTruthy();
}

// Add the named catalog spells to a character's spellbook, prepared so they read
// as castable. Returns nothing; the caller reloads the sheet to see them.
export async function learnSpells(
  request: APIRequestContext,
  characterId: string,
  spellNames: string[],
): Promise<void> {
  const catalogResponse = await request.get("/api/spells");
  expect(catalogResponse.ok(), `list spells: ${catalogResponse.status()}`).toBeTruthy();
  const catalog = (await catalogResponse.json()) as { id: string; name: string; level: number }[];

  for (const name of spellNames) {
    const spell = catalog.find((s) => s.name === name);
    expect(spell, `spell not in catalog: ${name}`).toBeTruthy();
    const learnResponse = await request.post(`/api/characters/${characterId}/spellcasting/transactions`, {
      data: { operations: [{ type: "learnSpell", spellId: spell!.id }] },
    });
    expect(learnResponse.ok(), `learn ${name}: ${learnResponse.status()}`).toBeTruthy();
    // Prepare leveled spells (cantrips are always ready) so the spellbook row is castable.
    if (spell!.level > 0) {
      const entryId = await spellEntryId(request, characterId, name);
      const prepareResponse = await request.post(`/api/characters/${characterId}/spellcasting/transactions`, {
        data: { operations: [{ type: "prepareSpell", entryId }] },
      });
      expect(prepareResponse.ok(), `prepare ${name}: ${prepareResponse.status()}`).toBeTruthy();
    }
  }
}

// Look up a spellbook entry's id (the per-character entry, not the catalog id).
async function spellEntryId(
  request: APIRequestContext,
  characterId: string,
  spellName: string,
): Promise<string> {
  const response = await request.get(`/api/characters/${characterId}`);
  expect(response.ok(), `load character: ${response.status()}`).toBeTruthy();
  const character = (await response.json()) as {
    spellcasting?: { spells?: { id: string; name: string }[] };
  };
  const entry = character.spellcasting?.spells?.find((s) => s.name === spellName);
  expect(entry, `spellbook entry not found: ${spellName}`).toBeTruthy();
  return entry!.id;
}
