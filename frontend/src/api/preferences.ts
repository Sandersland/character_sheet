import type { UserPreferences } from "@/types/auth";
import { jsonBody, request } from "@/api/http";

// PATCH (not …/transactions) is deliberate: these are account settings,
// not character-sheet state.
export async function patchPreferences(
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const data = await request<{ preferences: UserPreferences }>(
    "/preferences",
    jsonBody(patch, "PATCH"),
    "Failed to save preferences",
  );
  return data.preferences;
}
