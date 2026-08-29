import { expect, type APIRequestContext, type Page } from "@playwright/test";

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

export async function gotoSheet(
  page: Page,
  id: string,
  tab?: "overview" | "combat" | "inventory" | "magic" | "story",
): Promise<void> {
  await page.goto(`/characters/${id}${tab ? `?tab=${tab}` : ""}`);
}

// If already joined: mobile keeps a live "go to fight" pill, but desktop
// dropped its own under-tabs strip (#1085) and shows no entry button at all —
// only the banner's End Session marks that state, so fall back to the tab.
export async function enterLiveCombat(page: Page): Promise<void> {
  const entry = page
    .getByRole("button", { name: /(Start|Resume|Join) session|go to fight/i })
    .first();
  const joinedDesktop = page.getByRole("button", { name: /End Session/i }).first();
  await expect(entry.or(joinedDesktop)).toBeVisible();
  if (await entry.isVisible()) {
    await entry.click();
  } else {
    await page.getByRole("tab", { name: /^Combat/ }).click();
  }
  await expect(page).toHaveURL(/[?&]tab=combat/);
}

// A shared roster persona's session may already be mid-encounter from an
// earlier spec — the short timeout treats "Start combat" never appearing as
// already-active rather than a real failure ("Start my turn" works either way).
export async function startCombatAndTurn(page: Page): Promise<void> {
  try {
    await page.getByRole("button", { name: /Start combat/i }).click({ timeout: 3000 });
  } catch {
    // Already active.
  }
  await page.getByRole("button", { name: "Start my turn" }).click();
}

// The Magic tab's record view and grimoire are mutually exclusive — spellbook
// rows (prepare/swap/forget) live only in the grimoire, behind this button.
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
  speciesName?: string;
  background?: string;
  experiencePoints?: number;
  abilityScores?: Partial<AbilityScores>;
  rulesEdition?: "EDITION_2014" | "EDITION_2024";
}

// A species id from the wrong edition's catalog 400s at creation
// (crossEditionRejection), so this must be scoped to the character's own edition.
async function resolveSpeciesId(
  request: APIRequestContext,
  name: string,
  edition: "EDITION_2014" | "EDITION_2024",
): Promise<string> {
  const response = await request.get(`/api/reference?edition=${edition}`);
  expect(response.ok(), `load reference: ${response.status()}`).toBeTruthy();
  const { species } = (await response.json()) as { species: { id: string; name: string }[] };
  const match = species.find((s) => s.name === name);
  if (!match) throw new Error(`Species not found in catalog: ${name}`);
  return match.id;
}

export async function createCharacter(
  request: APIRequestContext,
  opts: CreateCharacterOpts,
): Promise<string> {
  const edition = opts.rulesEdition ?? "EDITION_2024";
  const speciesId = await resolveSpeciesId(request, opts.speciesName ?? "Halfling", edition);
  const response = await request.post("/api/characters", {
    data: {
      name: opts.name,
      alignment: "True Neutral",
      speciesId,
      background: opts.background ?? "Sage",
      classes: [{ name: opts.className }],
      abilityScores: { ...ABILITY_SCORES, ...opts.abilityScores },
      ...(opts.rulesEdition ? { rulesEdition: opts.rulesEdition } : {}),
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

export async function createCampaign(
  request: APIRequestContext,
  opts: { name: string; rulesEdition?: "EDITION_2014" | "EDITION_2024" },
): Promise<string> {
  const response = await request.post("/api/campaigns", {
    data: { name: opts.name, ...(opts.rulesEdition ? { rulesEdition: opts.rulesEdition } : {}) },
  });
  expect(response.ok(), `create campaign ${opts.name}: ${response.status()}`).toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

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

  const catalogResponse = await request.get("/api/maneuvers?edition=EDITION_2024");
  expect(catalogResponse.ok(), `list maneuvers: ${catalogResponse.status()}`).toBeTruthy();
  const catalog = (await catalogResponse.json()) as { id: string; name: string }[];
  const match = catalog.find((m) => m.name === maneuverName);
  expect(match, `maneuver not in catalog: ${maneuverName}`).toBeTruthy();

  const learnResponse = await request.post(`/api/characters/${characterId}/resources/transactions`, {
    data: { operations: [{ type: "learnManeuver", maneuverId: match!.id }] },
  });
  expect(learnResponse.ok(), `learn ${maneuverName}: ${learnResponse.status()}`).toBeTruthy();
}

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

export async function learnSpells(
  request: APIRequestContext,
  characterId: string,
  spellNames: string[],
): Promise<void> {
  const catalogResponse = await request.get("/api/spells?edition=EDITION_2024");
  expect(catalogResponse.ok(), `list spells: ${catalogResponse.status()}`).toBeTruthy();
  const catalog = (await catalogResponse.json()) as { id: string; name: string; level: number }[];

  for (const name of spellNames) {
    const spell = catalog.find((s) => s.name === name);
    expect(spell, `spell not in catalog: ${name}`).toBeTruthy();
    const learnResponse = await request.post(`/api/characters/${characterId}/spellcasting/transactions`, {
      data: { operations: [{ type: "learnSpell", spellId: spell!.id }] },
    });
    expect(learnResponse.ok(), `learn ${name}: ${learnResponse.status()}`).toBeTruthy();
    // Cantrips are always prepared; leveled spells need an explicit prepare to be castable.
    if (spell!.level > 0) {
      const entryId = await spellEntryId(request, characterId, name);
      const prepareResponse = await request.post(`/api/characters/${characterId}/spellcasting/transactions`, {
        data: { operations: [{ type: "prepareSpell", entryId }] },
      });
      expect(prepareResponse.ok(), `prepare ${name}: ${prepareResponse.status()}`).toBeTruthy();
    }
  }
}

// The per-character spellbook entry id, distinct from the catalog spell id.
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
