import type {
  Character,
  CharacterSummary,
  CreateCharacterInput,
  ReferenceData,
} from "../types/character";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function fetchCharacters(): Promise<CharacterSummary[]> {
  const response = await fetch(`${API_URL}/characters`);
  if (!response.ok) {
    throw new Error(`Failed to fetch characters (${response.status})`);
  }
  return response.json();
}

export async function fetchCharacter(id: string): Promise<Character | null> {
  const response = await fetch(`${API_URL}/characters/${id}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch character ${id} (${response.status})`);
  }
  return response.json();
}

export async function updateCharacter(
  id: string,
  patch: Partial<Pick<Character, "experiencePoints">>
): Promise<Character> {
  const response = await fetch(`${API_URL}/characters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Failed to update character ${id} (${response.status})`);
  }
  return response.json();
}

export async function fetchReference(): Promise<ReferenceData> {
  const response = await fetch(`${API_URL}/reference`);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference data (${response.status})`);
  }
  return response.json();
}

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  const response = await fetch(`${API_URL}/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Failed to create character (${response.status})`);
  }
  return response.json();
}
