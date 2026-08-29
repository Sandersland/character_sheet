import { z } from "zod";

import { diceRollStyleSchema, preferencesSchema, themePreferenceSchema } from "@character-sheet/contracts";

// preferencesSchema's `.default()`s live in @character-sheet/contracts (#1395).

// z.output, deliberately not the contracts package's UserPreferences — that name is its z.input type, with every field optional for a PATCH body.
export type ResolvedPreferences = z.output<typeof preferencesSchema>;

// No `.default()` here so an absent key stays absent through `.partial()` instead of zod filling it in and clobbering other stored keys on merge.
const partialPreferencesShape = z
  .object({
    theme: themePreferenceSchema,
    diceRollStyle: diceRollStyleSchema,
    autoRollConcentration: z.boolean(),
  })
  .partial();

// `.strict()` so an unrecognized key is a 400 — a request body with an unknown key is almost certainly a client bug, unlike a stored value.
export const preferencesPatchSchema = partialPreferencesShape.strict();

// Derived from the schema's own per-field defaults rather than duplicated as a literal, so the two can't drift.
export const DEFAULT_PREFERENCES: ResolvedPreferences = preferencesSchema.parse({});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A corrupt or partially-shaped stored value never throws — falls back to DEFAULT_PREFERENCES on any validation failure.
function parseStoredPreferences(raw: unknown): ResolvedPreferences {
  const base = isPlainObject(raw) ? raw : {};
  const result = preferencesSchema.safeParse(base);
  return result.success ? result.data : DEFAULT_PREFERENCES;
}

// Unlike parseStoredPreferences, keeps the result sparse so merging a patch onto a never-stored base yields just the patch; unknown stored keys are stripped, and an invalid recognized key fails the whole parse to {}.
function parseStoredPreferencesBase(raw: unknown): Partial<ResolvedPreferences> {
  const base = isPlainObject(raw) ? raw : {};
  const result = partialPreferencesShape.safeParse(base);
  return result.success ? result.data : {};
}

// `null` is preserved so the frontend can distinguish "never stored" (migrate local values up) from "a value is stored" (server wins) — mergePreferencesPatch is the write-side half of that contract.
export function resolvePreferences(raw: unknown): ResolvedPreferences | null {
  if (raw == null) return null;
  return parseStoredPreferences(raw);
}

export function mergePreferencesPatch(
  raw: unknown,
  patch: Partial<ResolvedPreferences>,
): Partial<ResolvedPreferences> {
  return { ...parseStoredPreferencesBase(raw), ...patch };
}
