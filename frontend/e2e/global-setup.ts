// Idempotent persona seeding for the e2e suite. Runs once before all specs:
// signs in via dev-login, then creates each roster persona if it's missing
// (matched by name). Personas are (re)built every suite start because the
// backend auth.test.ts wipes dev-user-local as cleanup — so we can't assume any
// survive between a vitest run and this suite.

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 14,
  intelligence: 15,
  wisdom: 12,
  charisma: 8,
};

// Wizard L5 threshold from the XP curve (backend/src/lib/experience.ts).
const WIZARD_L5_XP = 6500;

interface Persona {
  name: string;
  race: string;
  background: string;
  className: string;
  experiencePoints?: number;
}

const ROSTER: Persona[] = [
  { name: "Smoke Fighter", race: "Human", background: "Soldier", className: "Fighter" },
  { name: "Wizard L5", race: "Human", background: "Sage", className: "Wizard", experiencePoints: WIZARD_L5_XP },
];

// Node fetch doesn't persist cookies, so we thread the session cookie manually.
function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("dev-login did not return a session cookie");
  return setCookie.split(";")[0];
}

async function devLoginWithRetry(): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${baseURL}/api/auth/dev-login`, { method: "POST" });
      if (response.ok) return sessionCookie(response);
      lastError = new Error(`dev-login returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend never became ready: ${String(lastError)}`);
}

async function createPersona(cookie: string, persona: Persona): Promise<void> {
  const response = await fetch(`${baseURL}/api/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: persona.name,
      alignment: "True Neutral",
      race: persona.race,
      background: persona.background,
      classes: [{ name: persona.className }],
      abilityScores: ABILITY_SCORES,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create ${persona.name}: ${response.status} ${await response.text()}`);
  }

  // XP goes through the transactions endpoint (not the create body) so the level
  // — and thus spell slots — derive server-side exactly as they would in the app.
  if (persona.experiencePoints) {
    const { id } = (await response.json()) as { id: string };
    const xpResponse = await fetch(`${baseURL}/api/characters/${id}/experience`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ operations: [{ type: "set", value: persona.experiencePoints }] }),
    });
    if (!xpResponse.ok) {
      throw new Error(`Failed to set XP for ${persona.name}: ${xpResponse.status}`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const cookie = await devLoginWithRetry();

  const listResponse = await fetch(`${baseURL}/api/characters`, { headers: { cookie } });
  if (!listResponse.ok) {
    throw new Error(`Failed to list characters: ${listResponse.status}`);
  }
  const existing = (await listResponse.json()) as { name: string }[];
  const existingNames = new Set(existing.map((c) => c.name));

  for (const persona of ROSTER) {
    if (!existingNames.has(persona.name)) {
      await createPersona(cookie, persona);
    }
  }
}
